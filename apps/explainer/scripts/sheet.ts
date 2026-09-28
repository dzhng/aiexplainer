/**
 * `bun run --cwd apps/explainer sheet --variable <crop> --chapters all`: one crop across every finished chapter,
 * side by side: the cross-chapter consistency check. Each chapter is shot at
 * `/#<n>` at its OG time (or `--t`) by `verify.ts`, which also checks it; the tiles are then
 * joined left to right in ladder order into `throwaway/shots/sheet/<variable>.png`.
 *
 *   bun run --cwd apps/explainer sheet --variable 'part:board*' --chapters all
 *   bun run --cwd apps/explainer sheet --variable panel:tl --chapters autocomplete --t 5.4
 *   bun run --cwd apps/explainer sheet --variable full --chapters all        # the whole frame
 *   bun run --cwd apps/explainer sheet --variable og --chapters all          # the link-preview cards
 *
 * `og` shoots nothing: it tiles the recorded cards (`public/media/<slug>-card.jpg`) four to a
 * row at 600 px wide, the size a feed shows them, into `throwaway/shots/sheet/og.png`.
 */
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { CHAPTERS } from "../src/chapters/index.ts";
import { displayNumber, type ChapterSlug } from "../src/chapters/ladder.ts";
import { CARD_SIZE, cardFor } from "../src/runtime/media.ts";
import { writtenChapters } from "../src/state/app-state.ts";
import { FFMPEG, appRoot, repoRoot as repo, run } from "./harness.ts";

const { values: args } = parseArgs({
  options: {
    variable: { type: "string" },
    chapters: { type: "string", default: "all" },
    t: { type: "string" },
    height: { type: "string", default: "360" },
    base: { type: "string" },
  },
});

const here = import.meta.dirname;
if (!args.variable) throw new Error("--variable <crop> is required (or `full`)");

const slugs: ChapterSlug[] =
  args.chapters === "all"
    ? writtenChapters(CHAPTERS)
    : args.chapters!.split(",").map((slug) => {
        if (!CHAPTERS[slug as ChapterSlug]) throw new Error(`no written chapter "${slug}"`);
        return slug as ChapterSlug;
      });
if (slugs.length === 0) throw new Error("no chapters to shoot");

const name = args.variable.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "sheet";
const outDir = path.join(repo, "throwaway/shots/sheet");
await mkdir(outDir, { recursive: true });

if (args.variable === "og") {
  const sheet = path.join(outDir, "og.png");
  const width = 600;
  const height = Math.round((width * CARD_SIZE.height) / CARD_SIZE.width);
  const columns = Math.min(4, slugs.length);
  const cards = slugs.map((slug) => path.join(appRoot, "public", cardFor(slug)));
  const inputs = cards.flatMap((file) => ["-i", file]);
  const scaled = cards.map((_, i) => `[${i}]scale=${width}:${height}[t${i}]`).join(";");
  const layout = cards.map(
    (_, i) => `${(i % columns) * width}_${Math.floor(i / columns) * height}`,
  );
  const joined =
    cards.length === 1
      ? `${scaled};[t0]copy`
      : `${scaled};${cards.map((_, i) => `[t${i}]`).join("")}xstack=inputs=${cards.length}:layout=${layout.join("|")}:fill=black`;
  run([FFMPEG, "-loglevel", "error", "-y", ...inputs, "-filter_complex", joined, sheet]);
  console.log(`sheet ${path.relative(repo, sheet)} (${cards.length} cards)`);
  process.exit(0);
}

const tiles: string[] = [];
for (const slug of slugs) {
  const def = CHAPTERS[slug]!;
  const out = `${name}-${slug}`;
  const cmd = [
    "bun",
    path.join(here, "verify.ts"),
    "--route",
    `/#${displayNumber(slug)}`,
    "--t",
    args.t ?? String(def.ogTimeSec),
    "--slice",
    "sheet",
    "--out",
    out,
    ...(args.variable === "full" ? [] : ["--crop", args.variable]),
    ...(args.base ? ["--base", args.base] : []),
  ];
  const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0) throw new Error(`${slug}: verify failed\n${stdout}\n${stderr}`);
  const shot = stdout.match(/^shot (.+\.png)$/m)?.[1];
  if (!shot) throw new Error(`${slug}: verify saved no shot\n${stdout}`);
  tiles.push(path.join(repo, shot));
  console.log(`${slug}: ${shot}`);
}

// Same height for every tile, joined left to right.
const height = Number(args.height);
const sheet = path.join(outDir, `${name}.png`);
const inputs = tiles.flatMap((file) => ["-i", file]);
const scaled = tiles.map((_, i) => `[${i}]scale=-2:${height}[t${i}]`).join(";");
const joined =
  tiles.length === 1
    ? `${scaled};[t0]copy`
    : `${scaled};${tiles.map((_, i) => `[t${i}]`).join("")}hstack=inputs=${tiles.length}`;
run([FFMPEG, "-loglevel", "error", "-y", ...inputs, "-filter_complex", joined, sheet]);
for (const tile of tiles) await rm(tile);
console.log(
  `sheet ${path.relative(repo, sheet)} (${tiles.length} chapter${tiles.length > 1 ? "s" : ""})`,
);
