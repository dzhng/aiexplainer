/**
 * `validateChapter(def)` returns every way a chapter breaks the contract (empty when valid).
 * Chapters are TypeScript data, so the compiler checks shapes; this checks what types can't:
 * the copy budget (README Copy rules), the loop budget (D24), the caps (D18), and that every
 * anchor, shot, colour token and kit primitive exists (the frozen vocabulary, slice 13).
 */
import { ARITH, arithProblems, type ArithUnit } from "@repo/llm";
import { isKitPrimitive } from "@repo/renderer";
import shots from "../look/shots.json";
import { isPaletteToken } from "../look/look.ts";
import { isSceneAnchor, SCENE_KIT } from "./scenes.ts";
import {
  STAT_FORMATS,
  STAT_SCALES,
  type Caption,
  type ChapterDef,
  type StatFormat,
  type Timeline,
} from "./types.ts";

export const LOOP_SEC = { min: 20, max: 30 } as const;
export const MAX_SENTENCE_WORDS = 25;
export const MAX_FOLLOW = 3;
export const MAX_LABELS = 5;

/** Which chip formats can display each arithmetic unit. */
const FORMATS_FOR_UNIT: Record<ArithUnit, readonly StatFormat[]> = {
  bytes: ["bytes"],
  "tok/s": ["tok/s"],
  s: ["s"],
  count: ["int", "num", "x"],
};

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
/** A sentence end followed by more text means the string holds more than one sentence. */
const holdsTwoSentences = (s: string) => /[.!?]["'”’)]*\s+\S/.test(s.trim());

function checkCaption(where: string, caption: Caption, problems: string[]) {
  if (!Array.isArray(caption.story) || caption.story.length !== 2)
    problems.push(`${where}: story must be exactly 2 sentences`);
  for (const [i, sentence] of (caption.story ?? []).entries()) {
    if (!sentence?.trim()) problems.push(`${where}: sentence ${i + 1} is empty`);
    else if (holdsTwoSentences(sentence))
      problems.push(`${where}: sentence ${i + 1} holds more than one sentence`);
    else if (wordCount(sentence) > MAX_SENTENCE_WORDS)
      problems.push(
        `${where}: sentence ${i + 1} has ${wordCount(sentence)} words (max ${MAX_SENTENCE_WORDS})`,
      );
  }
  if (!caption.precisely?.trim()) problems.push(`${where}: missing precisely line`);
}

function checkLoop(def: ChapterDef, loop: Timeline, problems: string[]) {
  const d = loop.durationSec;
  if (!(d >= LOOP_SEC.min && d <= LOOP_SEC.max))
    problems.push(`loop: ${d} s is outside ${LOOP_SEC.min}–${LOOP_SEC.max} s`);
  const inLoop = (t: number) => t >= 0 && t < d;
  loop.inputs?.forEach((input, i) => {
    if (!input.trim()) problems.push(`loop.inputs[${i}]: empty`);
  });
  for (const [id, keys] of Object.entries(loop.channels)) {
    if (keys.length === 0) problems.push(`loop.${id}: no keyframes`);
    keys.forEach((k, i) => {
      if (!inLoop(k.t)) problems.push(`loop.${id}: keyframe at ${k.t} s is outside the loop`);
      if (i > 0 && k.t <= keys[i - 1]!.t)
        problems.push(`loop.${id}: keyframes out of order at ${k.t} s`);
    });
  }
  loop.beats.forEach((beat, i) => {
    if (!inLoop(beat.t)) problems.push(`beat ${beat.id}: ${beat.t} s is outside the loop`);
    if (i > 0 && beat.t < loop.beats[i - 1]!.t) problems.push(`beat ${beat.id}: out of order`);
    if (beat.focus !== undefined && !isSceneAnchor(def.scene, beat.focus))
      problems.push(`beat ${beat.id}: unknown anchor ${beat.focus}`);
    if (beat.tint !== undefined && !isPaletteToken(beat.tint))
      problems.push(`beat ${beat.id}: unknown colour token ${beat.tint}`);
  });
  if (!inLoop(def.ogTimeSec)) problems.push(`ogTimeSec ${def.ogTimeSec} is outside the loop`);
}

/** `kitOf` names the primitives a scene builds from (a parameter only so tests can vary it). */
export function validateChapter(
  def: ChapterDef,
  kitOf: (scene: ChapterDef["scene"]) => readonly string[] | undefined = (s) => SCENE_KIT[s],
): string[] {
  const problems: string[] = [];
  const kit = kitOf(def.scene);
  if (!kit) problems.push(`unknown scene ${def.scene}`);
  for (const primitive of kit ?? [])
    if (!isKitPrimitive(primitive)) problems.push(`unknown kit primitive ${primitive}`);
  if (!def.title?.trim()) problems.push("missing title");
  if (!def.why?.trim()) problems.push("missing why-line");

  checkCaption("caption", def.caption.default, problems);
  const followIds = new Set(def.follow.map((f) => f.id));
  for (const [id, caption] of Object.entries(def.caption.byFollow)) {
    if (!followIds.has(id)) problems.push(`caption.byFollow.${id}: no such follow target`);
    if (caption) checkCaption(`caption.byFollow.${id}`, caption, problems);
  }

  if (def.follow.length > MAX_FOLLOW)
    problems.push(`${def.follow.length} follow targets (max ${MAX_FOLLOW})`);
  if (followIds.size !== def.follow.length) problems.push("duplicate follow ids");
  for (const f of def.follow)
    if (!isSceneAnchor(def.scene, f.anchor))
      problems.push(`follow ${f.id}: unknown anchor ${f.anchor}`);

  // A tour shows one stop's label at a time; everywhere else every label can show at once.
  if (def.labels.length > MAX_LABELS && !def.tour)
    problems.push(`${def.labels.length} labels (max ${MAX_LABELS})`);
  if (new Set(def.labels.map((l) => l.anchor)).size !== def.labels.length)
    problems.push("two labels on one anchor");
  for (const label of def.labels) {
    if (!isSceneAnchor(def.scene, label.anchor))
      problems.push(`label: unknown anchor ${label.anchor}`);
    if (!label.analogy?.trim() || !label.precise?.trim())
      problems.push(`label ${label.anchor}: needs both readings`);
  }

  if (!Object.hasOwn(shots, def.shot)) problems.push(`unknown shot ${def.shot}`);
  if (def.pullBack) {
    if (!Object.hasOwn(shots, def.pullBack.shot))
      problems.push(`pullBack: unknown shot ${def.pullBack.shot}`);
    if (!Object.hasOwn(def.loop.channels, def.pullBack.channel))
      problems.push(`pullBack: no loop channel ${def.pullBack.channel}`);
  }
  if (def.tour && !Object.hasOwn(def.loop.channels, def.tour.channel))
    problems.push(`tour: no loop channel ${def.tour.channel}`);

  if (def.stats.length !== 3) problems.push(`${def.stats.length} stats (need 3)`);
  for (const stat of def.stats) {
    if (!(STAT_SCALES as readonly string[]).includes(stat.scale))
      problems.push(`stat ${stat.id}: missing or unknown scale`);
    if (!(STAT_FORMATS as readonly string[]).includes(stat.format))
      problems.push(`stat ${stat.id}: unknown format ${stat.format}`);
    if (!stat.label?.trim()) problems.push(`stat ${stat.id}: missing label`);
    if (stat.value.kind !== "arith" && def.model === null)
      problems.push(`stat ${stat.id}: reads a ${stat.value.kind} but the chapter has no model`);
    if (stat.value.kind === "arith") {
      const { fn } = stat.value;
      // Bindings are checked for shape here; their values exist only at run time.
      const args: Record<string, number> = {};
      for (const [name, arg] of Object.entries(stat.value.args)) {
        if (typeof arg === "number") args[name] = arg;
        else if ("probe" in arg) {
          if (def.model === null)
            problems.push(`stat ${stat.id}: ${name} reads a probe but the chapter has no model`);
          args[name] = 0;
        } else args[name] = def.slider.initial;
      }
      const argProblems = arithProblems(fn, args);
      problems.push(...argProblems.map((p) => `stat ${stat.id}: ${p}`));
      if (argProblems.length) continue;
      const { scale, unit } = ARITH[fn];
      if (scale !== null && scale !== stat.scale)
        problems.push(`stat ${stat.id}: ${fn} is at scale "${scale}", not "${stat.scale}"`);
      if (!FORMATS_FOR_UNIT[unit].includes(stat.format))
        problems.push(
          `stat ${stat.id}: ${fn} gives ${unit}, which format ${stat.format} can't show`,
        );
    }
  }

  for (const s of def.scenarios)
    if (!s.probe?.trim()) problems.push(`scenario ${s.id}: must cite a probe`);

  const { min, max, initial } = def.slider;
  if (!(min <= initial && initial <= max))
    problems.push(`slider ${def.slider.id}: initial outside range`);
  if (def.slider.loop !== undefined && !Object.hasOwn(def.loop.channels, def.slider.loop))
    problems.push(`slider ${def.slider.id}: no loop channel ${def.slider.loop}`);

  checkLoop(def, def.loop, problems);
  return problems;
}
