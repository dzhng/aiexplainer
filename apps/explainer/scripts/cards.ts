/**
 * Shoots each written chapter's 1200×630 link-preview card into `public/media/` (D34; ffmpeg
 * is a build-time tool, D41). Re-run it whenever the look or a chapter changes:
 *
 *   bun run --cwd apps/explainer cards              # every written chapter
 *   bun run --cwd apps/explainer cards autocomplete # one chapter
 *
 * A card is the whole app, HUD included, at the chapter's `ogTimeSec` on a held clock, laid
 * out at 1440 px wide (the desktop layout the scenes are framed for) and scaled down.
 */
import { mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Browser } from "playwright";
import { CHAPTERS } from "../src/chapters/index.ts";
import { displayNumber, type ChapterSlug } from "../src/chapters/ladder.ts";
import type { ChapterDef } from "../src/chapters/types.ts";
import { CARD_SIZE, MEDIA_DIR, cardFor } from "../src/runtime/media.ts";
import { writtenChapters } from "../src/state/app-state.ts";
import { FFMPEG, appRoot, launch, openPage, run, serve, settle, waitReady } from "./harness.ts";

/** The card's layout size: `CARD_SIZE`'s aspect at 1440 px wide. */
const CARD_VIEWPORT = {
  width: 1440,
  height: Math.round((1440 * CARD_SIZE.height) / CARD_SIZE.width),
};

const publicDir = path.join(appRoot, "public");

async function shootCard(browser: Browser, base: string, def: ChapterDef, file: string) {
  const url = `${base}/?clock=held&t=${def.ogTimeSec}#${displayNumber(def.slug)}`;
  const opened = await openPage(browser, url, CARD_VIEWPORT);
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
    // prettier-ignore
    run([FFMPEG, "-loglevel", "error", "-y", "-i", png, "-vf", `scale=${CARD_SIZE.width}:${CARD_SIZE.height}:flags=lanczos`, "-q:v", "3", file]);
  } finally {
    await opened.page.context().close();
  }
}

if (import.meta.main) {
  const { values: args, positionals } = parseArgs({
    allowPositionals: true,
    options: { base: { type: "string" } },
  });
  const slugs = positionals.length ? (positionals as ChapterSlug[]) : writtenChapters(CHAPTERS);
  for (const slug of slugs) if (!CHAPTERS[slug]) throw new Error(`no written chapter "${slug}"`);
  await mkdir(path.join(publicDir, MEDIA_DIR), { recursive: true });
  const server = await serve(args.base);
  const browser = await launch("chrome");
  try {
    for (const slug of slugs) {
      await shootCard(browser, server.base, CHAPTERS[slug]!, path.join(publicDir, cardFor(slug)));
      console.log(`${slug}: card → ${cardFor(slug)}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  console.log("cards:", (await readdir(path.join(publicDir, MEDIA_DIR))).join(" "));
}
