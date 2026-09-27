/**
 * Records each written chapter's media into `public/media/` (D29, D34; ffmpeg is a
 * build-time tool, D41). Re-run it whenever the look or a loop changes:
 *
 *   bun run --cwd apps/explainer media              # every written chapter
 *   bun run --cwd apps/explainer media autocomplete # one chapter
 *   bun scripts/record.ts --repeat                  # record twice and compare frame by frame
 *
 * For each chapter it opens `/#N` with `?clock=step&fps=30` (the probe's `step()` advances
 * exactly one frame, so recording is independent of how fast the browser runs) at
 * 1920×1080. The video is the scene only: the HUD is hidden (still laid out, so the camera
 * and the labels are exactly the app's) and each frame is cropped to the largest 16:9 box
 * inside the app's `safe` rect (the canvas clear of the HUD panels), scaled to 1280×720.
 * The fallback page shows the title and the why-line itself; the HUD's text would be
 * illegible at phone width. Frames are encoded H.264 at the best quality on `CRF_LADDER`
 * that fits `MAX_VIDEO_BYTES`. The poster is the first frame (the video starts without a
 * jump), and the 1200×630 link-preview card is the whole app, HUD included, at `ogTimeSec`.
 */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Browser } from "playwright";
import { CHAPTERS } from "../src/chapters/index.ts";
import { displayNumber, type ChapterSlug } from "../src/chapters/ladder.ts";
import type { ChapterDef } from "../src/chapters/types.ts";
import type { CropRect } from "../src/lab/probe.ts";
import { CARD_SIZE, MEDIA_DIR, VIDEO_SIZE, mediaFor } from "../src/runtime/media.ts";
import { writtenChapters } from "../src/state/app-state.ts";
import {
  FFMPEG,
  FFPROBE,
  appRoot,
  launch,
  openPage,
  run,
  serve,
  settle,
  waitReady,
} from "./harness.ts";

const FPS = 30;
const RECORD_VIEWPORT = { width: 1920, height: 1080 };
const MAX_VIDEO_BYTES = 3_000_000;
/** x264 quality steps tried in order until the video fits (lower is better quality). */
const CRF_LADDER = [18, 21, 24, 27, 30, 33];

const publicDir = path.join(appRoot, "public");
const out = (file: string) => path.join(publicDir, file);

/** Every frame of one loop as PNGs in `dir`; returns each frame's sha256. */
async function shootFrames(
  browser: Browser,
  base: string,
  def: ChapterDef,
  dir: string,
): Promise<string[]> {
  const url = `${base}/?clock=step&fps=${FPS}#${displayNumber(def.slug)}`;
  const opened = await openPage(browser, url, RECORD_VIEWPORT);
  try {
    await waitReady(opened);
    await settle(opened.page);
    const safe = await opened.page.evaluate(() => window.__explainer!.crops().safe);
    if (!safe) throw new Error(`${def.slug}: the app reported no safe rect`);
    const clip = { ...widest16by9(safe), scale: 1 };
    await opened.page.addStyleTag({ content: "[data-hud] { visibility: hidden; }" });
    await settle(opened.page);
    // CDP capture skips Playwright's screenshot bookkeeping (several times faster per frame).
    const cdp = await opened.page.context().newCDPSession(opened.page);
    const frames = Math.round(def.loop.durationSec * FPS);
    const hashes: string[] = [];
    for (let i = 0; i < frames; i++) {
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip });
      const png = Buffer.from(data, "base64");
      await Bun.write(path.join(dir, `${String(i).padStart(5, "0")}.png`), png);
      hashes.push(createHash("sha256").update(png).digest("hex"));
      await opened.page.evaluate(() => window.__explainer!.step());
      await settle(opened.page);
      if ((i + 1) % 150 === 0) console.log(`${def.slug}: ${i + 1}/${frames} frames`);
    }
    if (opened.failures.length) throw new Error(opened.failures.join("\n"));
    return hashes;
  } finally {
    await opened.page.context().close();
  }
}

/** The largest 16:9 box centred in `rect`, on whole even pixels (H.264 wants even sizes). */
function widest16by9(rect: CropRect): CropRect {
  const width = Math.min(rect.width, (rect.height * 16) / 9);
  const height = (width * 9) / 16;
  const even = (n: number) => 2 * Math.floor(n / 2);
  return {
    x: Math.round(rect.x + (rect.width - width) / 2),
    y: Math.round(rect.y + (rect.height - height) / 2),
    width: even(width),
    height: even(height),
  };
}

/** The best CRF on the ladder whose encode fits the budget. */
async function encode(frames: string, file: string): Promise<number> {
  for (const crf of CRF_LADDER) {
    // prettier-ignore
    run([
      FFMPEG, "-loglevel", "error", "-y",
      "-framerate", String(FPS), "-i", path.join(frames, "%05d.png"),
      "-vf", `scale=${VIDEO_SIZE.width}:${VIDEO_SIZE.height}:flags=lanczos`,
      "-c:v", "libx264", "-preset", "veryslow", "-crf", String(crf), "-tune", "animation",
      "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an",
      "-map_metadata", "-1", "-fflags", "+bitexact", "-flags:v", "+bitexact",
      file,
    ]);
    if ((await stat(file)).size <= MAX_VIDEO_BYTES) return crf;
  }
  throw new Error(`${file} does not fit ${MAX_VIDEO_BYTES} bytes even at CRF ${CRF_LADDER.at(-1)}`);
}

function durationSec(file: string): number {
  // prettier-ignore
  return Number(run([FFPROBE, "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).trim());
}

async function shootCard(browser: Browser, base: string, def: ChapterDef, file: string) {
  const url = `${base}/?clock=held&t=${def.ogTimeSec}#${displayNumber(def.slug)}`;
  const opened = await openPage(browser, url, CARD_SIZE);
  try {
    await waitReady(opened);
    await settle(opened.page);
    // Shoot until two frames in a row agree, so late settling (fonts, label fades) can't leak in.
    const png = path.join(os.tmpdir(), `${def.slug}-card.png`);
    let previous: Buffer | null = null;
    for (let i = 0; ; i++) {
      await settle(opened.page);
      const shot = await opened.page.screenshot();
      if (previous?.equals(shot)) break;
      if (i === 60) throw new Error(`${def.slug}: the card frame never settled`);
      previous = shot;
    }
    await Bun.write(png, previous);
    if (opened.failures.length) throw new Error(opened.failures.join("\n"));
    run([FFMPEG, "-loglevel", "error", "-y", "-i", png, "-q:v", "3", file]);
  } finally {
    await opened.page.context().close();
  }
}

async function record(browser: Browser, base: string, slug: ChapterSlug, repeat: boolean) {
  const def = CHAPTERS[slug]!;
  const media = mediaFor(slug);
  const frames = await mkdtemp(path.join(os.tmpdir(), `record-${slug}-`));
  try {
    const hashes = await shootFrames(browser, base, def, frames);
    if (repeat) {
      const again = await mkdtemp(path.join(os.tmpdir(), `record-${slug}-again-`));
      const second = await shootFrames(browser, base, def, again);
      await rm(again, { recursive: true });
      const differing = hashes.filter((h, i) => h !== second[i]).length;
      console.log(`${slug}: repeat recording, ${differing} of ${hashes.length} frames differ`);
      if (differing) throw new Error(`${slug}: recording is not deterministic`);
    }
    const crf = await encode(frames, out(media.video));
    const seconds = durationSec(out(media.video));
    if (Math.abs(seconds - def.loop.durationSec) > 1 / FPS)
      throw new Error(`${slug}: video is ${seconds}s, the loop is ${def.loop.durationSec}s`);
    // prettier-ignore
    run([FFMPEG, "-loglevel", "error", "-y", "-i", path.join(frames, "00000.png"), "-vf", `scale=${VIDEO_SIZE.width}:${VIDEO_SIZE.height}:flags=lanczos`, "-q:v", "3", out(media.poster)]);
    await shootCard(browser, base, def, out(media.card));
    const bytes = (await stat(out(media.video))).size;
    console.log(
      `${slug}: ${hashes.length} frames, ${seconds.toFixed(3)}s, CRF ${crf}, ${bytes} bytes → ${media.video}`,
    );
  } finally {
    await rm(frames, { recursive: true });
  }
}

if (import.meta.main) {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { base: { type: "string" }, repeat: { type: "boolean", default: false } },
  });
  const slugs = positionals.length ? (positionals as ChapterSlug[]) : writtenChapters(CHAPTERS);
  for (const slug of slugs) if (!CHAPTERS[slug]) throw new Error(`no written chapter "${slug}"`);
  await mkdir(out(MEDIA_DIR), { recursive: true });
  const server = await serve(args.base);
  const browser = await launch("chrome");
  try {
    for (const slug of slugs) await record(browser, server.base, slug, args.repeat);
  } finally {
    await browser.close();
    await server.close();
  }
  console.log("media:", (await readdir(out(MEDIA_DIR))).join(" "));
}
