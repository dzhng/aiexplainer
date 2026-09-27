/**
 * Prints a chapter loop's channel values and active beat at 1-second steps (slice 03).
 *
 *   bun scripts/timeline.ts autocomplete
 */
import { CHAPTERS } from "../src/chapters/index.ts";
import { LADDER, type ChapterSlug } from "../src/chapters/ladder.ts";
import { createTimelineState, evalTimeline } from "../src/chapters/timeline.ts";

const slug = process.argv[2] as ChapterSlug | undefined;
const def = slug && CHAPTERS[slug];
if (!def) {
  console.error(
    `usage: bun scripts/timeline.ts <slug>\nwritten: ${LADDER.filter((s) => CHAPTERS[s]).join(", ")}`,
  );
  process.exit(1);
}

const { loop } = def;
const state = createTimelineState(loop);
const channels = Object.keys(loop.channels);
console.log(["t", ...channels, "beat"].join("\t"));
for (let t = 0; t <= loop.durationSec; t++) {
  evalTimeline(loop, t, state);
  const beat = loop.beats[state.beat];
  const values = channels.map((id) => state.channels[id]!.toFixed(3));
  console.log([t, ...values, beat ? `${beat.id} (${beat.note})` : "-"].join("\t"));
}
