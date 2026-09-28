/**
 * Chapter 4's scene: the story laid out as word blocks on a stepped stand, one line per step
 * like a page, and above it the last word's mix: a glowing block fed by a pipe from every word
 * up to and including the focus word (kit: `block`, `pipes`, `sealed`). Each pipe's width is
 * the focus word's real attention weight on the word it comes from (`widthScale` = weight), so
 * the widest pipe runs from the word it draws the most from. The words after the focus (the
 * ones this model writes next) stand in a dim line after it, each with a capped stub: their
 * pipes are sealed, and their weights in the trace are exactly 0.
 *
 * Views: Exploded lifts the mix and its pipes off the words and drops the stand away.
 *
 * Pulses of light run up every pipe into the mix (kit: `flows`), as bright as the pipe is wide,
 * and a needle on the mix (kit: `tube`) tilts toward the word it drew the most from, by the
 * angle attention really turned the focus word's vector. The run can hold several prompts
 * (steps); a step that reorders the last one's words (chapter 4's failure) moves each block
 * from its old place to its new one, and the mix shows the model's guess for the next word.
 *
 * Loop channels read: `step` (which prompt), `blocks` (0 → 1 as the words rise into place),
 * `pipes` (0 → 1: hairline pipes reach up from each word in reading order), `settle` (0 → 1:
 * widths go from hairline to the real weights), `fill` (0 → 1: the mix lights up), `flow`
 * (0 → 1: the pulses come on), `needle` (the needle shows), `turn` (0 → 1: it tilts), `future` (0 → 1: the later
 * words rise with their sealed stubs), `swap` (0 → 1: reordered words move to their new
 * places), `guess` (the next-word guess shows), `lost` (the order note shows).
 * Typed text shows its prompt settled at once, without the loop's motion.
 */
import {
  KIT,
  pipePaths,
  sealedPaths,
  type BlockPart,
  type PipeFan,
  type SceneAnchor,
  type SceneDesc,
  type TubePart,
} from "@repo/renderer";
import type { Mat4, Vec3 } from "math";
import { share } from "../../chapters/format.ts";
import { look } from "../../look/look.ts";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { AttentionStep, SceneBuilder, SceneFrame } from "../build-frame.ts";
import { nextRevision } from "../revision.ts";

/** The most tokens the scene lays out (`<bos>` and the sealed words included). */
export const MAX_TOKENS = 48;
/** How many of the words the model writes next stand, sealed, after the focus word. */
export const FUTURE_WORDS = 4;

/** Word blocks: width grows with the word, so a line reads like set type. Metres. */
const BLOCK = { perChar: 0.036, pad: 0.07, gap: 0.035, height: 0.13, depth: 0.2 };
/**
 * The widest a line of blocks may run before it wraps to the next step, and the most steps:
 * enough for `MAX_TOKENS` of the vocabulary's longest pieces (13 characters, 5 to a line).
 */
const LINE_WIDTH = 3.4;
export const MAX_LINES = 10;
/** Each step up the stand is a line further back and higher; the front line's centre. */
const STEP = { back: 0.36, up: 0.2, frontY: 0.42, frontZ: 0.5 };
/**
 * The mix block: how far above the top line it hangs, its size (a share of the widest line,
 * so the pipes can enter its underside spread out), and its glow.
 */
const MIX = { above: 1.1, height: 0.14, depth: 0.5, share: 0.42, glow: 0.14 };
/** A pipe's radius at weight 1: the width is proportional to the weight. */
const PIPE_RADIUS = 0.25;
/** A sealed stub's radius: a plain pipe's, carrying nothing. */
const SEALED_RADIUS = 0.022;
/** Pipes glow softly, so their width, not their bloom, carries the weight. */
const PIPE_GLOW = 0.3;
/** The lit focus word in its line glows less than the mix it feeds. */
const FOCUS_GLOW = 0.08;
/** The thread a pipe starts as, before it settles to its weight (as a widthScale). */
const HAIRLINE = 0.02;
/** Pipes leave from the back half of their word's top, clear of the word on its face. */
const PIPE_FOOT_BACK = 0.25;
/** Where unused blocks wait: under the floor, at a sliver of size. */
const PARKED: Vec3 = [0, -2, 0];
const SLIVER: Vec3 = [0.01, 0.01, 0.01];
/**
 * Where a label waits while its part has nothing to show: far below the room and off screen,
 * even in the local space of a part shrunk to a sliver.
 */
const OUT_OF_SIGHT: Vec3 = [0, -1e6, 0];
/** The mix block's pin: its right end (in its own unit space), clear of its word. */
const MIX_PIN: Vec3 = [0.5, 0, 0.5];

/** Exploded view: the mix and its pipes lift off the words; the stand drops away. */
const EXPLODE = { mix: [0, 0.45, 0] as Vec3, stand: [0, -0.3, 0] as Vec3 };

/**
 * At most this many of the widest pipes show their share, written on their word's block after
 * the word (the slider picks how many); their blocks are laid out wide enough for it.
 */
const MAX_SHARES = 5;
const SHARE_ROOM = " 00%  ";
/** The note over the sealed words (the chapter's analogy, from the map's ladder). */
export const SEALED_NOTE = "you can't read tomorrow's newspaper";

/** The note while a reordered prompt gives the very same mix. */
export const ORDER_NOTE = "same mix, same guess: the order is lost";

/**
 * Scene text slots: the mix's word, the focus word, the sealed note, the guess, the needle's
 * angle, the order note, then one per word.
 */
const TAG = { mix: 0, focus: 1, sealed: 2, guess: 3, turn: 4, lost: 5, words: 6 } as const;
/** Pulses are this bright at full flow (they add light over the pipe). */
const FLOW_GLOW = 0.5;
/** The needle on the mix: its length and radius, metres. */
const NEEDLE = { length: 0.26, radius: 0.012, glow: 0.35 };
/** A block moving to its new place in a reorder rises this high at mid-move, metres. */
const HOP = 0.28;

/** Dynamics slots. */
const SLOT = {
  stand: 0,
  words: 1,
  focus: 2,
  mix: 3,
  sealed: 4,
  needle: 4 + FUTURE_WORDS,
  pipes: 5 + FUTURE_WORDS,
  flows: 5 + FUTURE_WORDS + MAX_TOKENS,
} as const;

/** What a word block shows: `<bos>` is the start marker every prompt begins with. */
export function tokenLabel(token: string): string {
  return token === "<bos>" ? "start" : token.trim() || "␣";
}

interface Layout {
  /** Block centres and widths, per token. */
  centres: Vec3[];
  widths: number[];
  /** The stand's steps, front to back: centre and size. */
  steps: { centre: Vec3; size: Vec3 }[];
  mix: { centre: Vec3; width: number };
  /** Every token's pipe fan into the mix. */
  fan: PipeFan;
  /** Each block's line, counted from the first (the back step). */
  rowOf: number[];
  rows: number;
}

/**
 * Wraps the blocks into lines no wider than `LINE_WIDTH`, one per step, centred on x = 0.
 * `labels` is what each block must hold (its word, and room for a share on the widest). Blocks
 * from `noWrapFrom` on (the sealed later words) stay on the line they continue, so they never
 * stand alone in front of the story.
 */
export function layoutTokens(labels: string[], noWrapFrom = labels.length): Layout {
  const widths = labels.map((label) => BLOCK.pad + BLOCK.perChar * label.length);
  const lines: number[][] = [[]];
  let run = 0;
  widths.forEach((w, i) => {
    const line = lines.at(-1)!;
    if (line.length > 0 && i < noWrapFrom && run + BLOCK.gap + w > LINE_WIDTH) {
      lines.push([i]);
      run = w;
    } else {
      line.push(i);
      run += (line.length > 1 ? BLOCK.gap : 0) + w;
    }
  });
  if (lines.length > MAX_LINES) throw new Error(`attention: ${lines.length} lines of words`);
  const centres: Vec3[] = [];
  const rowOf: number[] = [];
  const steps: Layout["steps"] = [];
  const spans = lines.map(
    (line) => line.reduce((n, i) => n + widths[i]!, 0) + BLOCK.gap * (line.length - 1),
  );
  const stepWidth = Math.max(LINE_WIDTH, ...spans) + 0.3;
  const rows = lines.length;
  // The last line sits on the front step; earlier lines step up and back, like a page.
  for (let r = rows - 1; r >= 0; r--) {
    const line = lines[r]!;
    const back = rows - 1 - r;
    const y = STEP.frontY + back * STEP.up;
    const z = STEP.frontZ - back * STEP.back;
    let x = -spans[r]! / 2;
    for (const i of line) {
      rowOf[i] = r;
      centres[i] = [x + widths[i]! / 2, y, z];
      x += widths[i]! + BLOCK.gap;
    }
    const top = y - BLOCK.height / 2;
    steps.push({ centre: [0, top / 2, z], size: [stepWidth, top, STEP.back] });
  }
  const topY = STEP.frontY + (rows - 1) * STEP.up;
  const midZ = STEP.frontZ - ((rows - 1) * STEP.back) / 2;
  const widest = Math.max(...centres.map((c, i) => Math.abs(c[0]) + widths[i]! / 2));
  const width = Math.max(0.6, 2 * widest * MIX.share);
  const centre: Vec3 = [0, topY + MIX.above, midZ];
  return {
    centres,
    widths,
    steps,
    rowOf,
    rows,
    mix: { centre, width },
    fan: {
      sources: centres.map(
        ([x, y, z]): Vec3 => [x, y + BLOCK.height / 2, z - BLOCK.depth * PIPE_FOOT_BACK],
      ),
      sink: [0, centre[1] - MIX.height / 2, midZ],
      spread: [width - 0.2, MIX.depth - 0.16],
    },
  };
}

function place(transform: Mat4, centre: Vec3, size: Vec3): void {
  transform[0] = size[0];
  transform[5] = size[1];
  transform[10] = size[2];
  transform[12] = centre[0];
  transform[13] = centre[1];
  transform[14] = centre[2];
}

/** The parts `update` moves, and the step the pipes were last laid along, per built scene. */
interface Built {
  steps: BlockPart[];
  words: BlockPart[];
  /** The words after the focus, in their own dim blocks. */
  later: BlockPart[];
  focusWord: BlockPart;
  mix: BlockPart;
  pipes: TubePart[];
  /** Stub then cap, per later word. */
  sealed: TubePart[];
  /** A pulse sleeve over each pipe. */
  flows: TubePart[];
  needle: TubePart;
  shown: AttentionStep | null;
  layout: Layout | null;
  /** Labels that ride a part of the step shown, and where on it. */
  pipesAnchor: SceneAnchor;
  pipesAt: Vec3;
  sealedAnchor: SceneAnchor;
  sealedAt: Vec3;
  mixAnchor: SceneAnchor;
}
const built = new WeakMap<SceneDesc, Built>();
const layouts = new WeakMap<AttentionStep, Layout>();

function layoutOf(step: AttentionStep): Layout {
  let layout = layouts.get(step);
  if (!layout) {
    const shares = new Set(widestFirst(step).slice(0, MAX_SHARES));
    const labels = step.tokens.map((t, i) => tokenLabel(t) + (shares.has(i) ? SHARE_ROOM : ""));
    layouts.set(step, (layout = layoutTokens(labels, step.focus + 1)));
  }
  return layout;
}

/** Token indices up to the focus, widest pipe first (ties in reading order). */
export function widestFirst(step: AttentionStep): number[] {
  return Array.from({ length: step.focus + 1 }, (_, i) => i).sort(
    (a, b) => step.weights[b]! - step.weights[a]! || a - b,
  );
}

/** Lays the pipes, stubs and the labels riding them along `step`'s layout: a new revision. */
function followStep(scene: SceneDesc, b: Built, step: AttentionStep): void {
  const layout = layoutOf(step);
  const paths = pipePaths(layout.fan);
  b.pipes.forEach((pipe, i) => {
    pipe.path = paths[Math.min(i, step.focus)]!;
    b.flows[i]!.path = pipe.path;
  });
  // Each later word's sealed stub rises from the middle of its block's top.
  const later = Array.from({ length: FUTURE_WORDS }, (_, j): Vec3 => {
    const [x, y, z] = layout.centres[Math.min(step.focus + 1 + j, step.tokens.length - 1)]!;
    return [x, y + BLOCK.height / 2, z];
  });
  sealedPaths(later, SEALED_RADIUS).forEach(({ stub, cap }, j) => {
    b.sealed[2 * j]!.path = stub;
    b.sealed[2 * j + 1]!.path = cap;
  });
  const top = b.pipes[widestFirst(step)[0]!]!;
  b.pipesAnchor.part = top.id;
  b.pipesAt = top.path[Math.round((top.path.length - 1) * 0.45)]!;
  // The last later word's right end.
  const last = Math.min(step.tokens.length - step.focus - 1, FUTURE_WORDS) - 1;
  b.sealedAnchor.part = b.later[Math.max(0, last)]!.id;
  b.sealedAt = [0.5, 0, 0.5];
  b.shown = step;
  b.layout = layout;
  scene.revision = nextRevision();
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * When `next` holds exactly `prev`'s tokens in another order (a reorder), where each of its
 * tokens stood in `prev` (the same word keeps its place when it can); otherwise null.
 */
export function reorderFrom(prev: AttentionStep, next: AttentionStep): number[] | null {
  if (prev.tokens.length !== next.tokens.length || prev.focus !== next.focus) return null;
  const from = next.tokens.map((token, i) => (prev.tokens[i] === token ? i : -1));
  const taken = new Set(from.filter((k) => k >= 0));
  for (const [i, token] of next.tokens.entries()) {
    if (from[i]! >= 0) continue;
    const k = prev.tokens.findIndex((t, k) => t === token && !taken.has(k));
    if (k < 0) return null;
    taken.add(k);
    from[i] = k;
  }
  return from;
}

/**
 * The needle's transform: a unit rod up +y, stood at `base`, tilted from upright by `tilt`
 * radians toward the horizontal unit direction `toward`, `NEEDLE.length` long.
 */
function standNeedle(transform: Mat4, base: Vec3, toward: Vec3, tilt: number): void {
  const up: Vec3 = [toward[0] * Math.sin(tilt), Math.cos(tilt), toward[2] * Math.sin(tilt)];
  // The rod's own width axes: horizontal across the tilt, and the one completing the frame.
  const across: Vec3 = [-toward[2], 0, toward[0]];
  const other: Vec3 = [
    across[1] * up[2] - across[2] * up[1],
    across[2] * up[0] - across[0] * up[2],
    across[0] * up[1] - across[1] * up[0],
  ];
  transform.splice(
    0,
    16,
    across[0],
    across[1],
    across[2],
    0,
    up[0] * NEEDLE.length,
    up[1] * NEEDLE.length,
    up[2] * NEEDLE.length,
    0,
    other[0],
    other[1],
    other[2],
    0,
    base[0],
    base[1],
    base[2],
    1,
  );
}

export const attention: SceneBuilder = {
  assets: {},
  tagCount: TAG.words + MAX_TOKENS,

  create(assets, revision) {
    // Built parked; the first update lays everything out for the real prompt.
    const block = (id: string, slot: number, material: string, explode?: Vec3) =>
      KIT.block.build({ id, slot, material, center: PARKED, size: SLIVER, explode });
    const stand = Array.from({ length: MAX_LINES }, (_, i) =>
      block(`stand.${i}`, SLOT.stand, "steel", EXPLODE.stand),
    );
    const words = Array.from({ length: MAX_TOKENS }, (_, i) =>
      block(`word.${i}`, SLOT.words, "housing"),
    );
    const later = Array.from({ length: FUTURE_WORDS }, (_, j) =>
      block(`later.${j}`, SLOT.words, "futureWord"),
    );
    const focusWord = block("focus-word", SLOT.focus, "focusWord");
    const mix = block("mix", SLOT.mix, "focusWord", EXPLODE.mix);
    const placeholder: PipeFan = {
      sources: Array.from({ length: MAX_TOKENS }, (_, i): Vec3 => [i * 0.05, 0.5, 0]),
      sink: [0, 2, 0],
    };
    const pipes = KIT.pipes.build({
      id: "pipe",
      slot: SLOT.pipes,
      material: "pipe",
      radius: PIPE_RADIUS,
      explode: EXPLODE.mix,
      ...placeholder,
    });
    const sealed = KIT.sealed.build({
      id: "sealed",
      slot: SLOT.sealed,
      material: "pipe",
      capMaterial: "sealed",
      radius: SEALED_RADIUS,
      sources: placeholder.sources.slice(0, FUTURE_WORDS),
    });
    const flows = KIT.flows.build({
      id: "flow",
      slot: SLOT.flows,
      material: "pulse",
      radius: PIPE_RADIUS,
      paths: pipes.parts.map((p) => (p as TubePart).path),
      explode: EXPLODE.mix,
    });
    // A unit rod up +y; each frame's transform stands it on the mix and tilts it.
    const needle = KIT.tube.build({
      id: "needle",
      slot: SLOT.needle,
      material: "focusWord",
      path: [
        [0, 0, 0],
        [0, 1, 0],
      ],
      radius: NEEDLE.radius,
      explode: EXPLODE.mix,
    });
    const parts = [
      ...stand.flatMap((s) => s.parts),
      ...words.flatMap((w) => w.parts),
      ...later.flatMap((w) => w.parts),
      ...focusWord.parts,
      ...mix.parts,
      ...pipes.parts,
      ...sealed.parts,
      ...flows.parts,
      ...needle.parts,
    ];
    const pipesAnchor: SceneAnchor = { ...pipes.anchors[0]!, id: "pipes", priority: 2 };
    const sealedAnchor: SceneAnchor = { ...sealed.anchors[0]!, id: "sealed", priority: 1 };
    // The mix block's right end, so the pill clears the word written on it.
    const mixAnchor: SceneAnchor = { id: "mix", part: "mix", local: MIX_PIN, priority: 3 };
    const anchors: SceneAnchor[] = [
      mixAnchor,
      pipesAnchor,
      sealedAnchor,
      // The front step's left end: the page of words.
      { id: "sentence", part: "stand.0", local: [-0.5, 0, 0.5], priority: 1 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    built.set(scene, {
      steps: stand.map((s) => s.parts[0] as BlockPart),
      words: words.map((w) => w.parts[0] as BlockPart),
      later: later.map((w) => w.parts[0] as BlockPart),
      focusWord: focusWord.parts[0] as BlockPart,
      mix: mix.parts[0] as BlockPart,
      pipes: pipes.parts as TubePart[],
      sealed: sealed.parts as TubePart[],
      flows: flows.parts as TubePart[],
      needle: needle.parts[0] as TubePart,
      shown: null,
      layout: null,
      pipesAnchor,
      pipesAt: pipesAnchor.local,
      sealedAnchor,
      sealedAt: sealedAnchor.local,
      mixAnchor,
    });
    // Each word sits on the bottom of its block's front face; the lit words are printed on.
    const onFace: Vec3 = [0, -0.5, 0.5];
    const tags: SceneTags = {
      anchors: [
        { id: "mix-word", part: "mix", local: [0, 0, 0.5], priority: 0 },
        { id: "focus-word", part: "focus-word", local: [0, 0, 0.5], priority: 0 },
        // On the riser of the later words' step, under them.
        { id: "sealed-note", part: "stand.0", local: [0, 0, 0.5], priority: 0 },
        // Clear above the mix, and at the needle's tip.
        { id: "guess", part: "mix", local: [0, 2.2, 0], priority: 0 },
        { id: "turn", part: "needle", local: [0, 1, 0], priority: 0 },
        // On the front of the stand, under the words.
        { id: "lost-note", part: "stand.0", local: [0, -0.1, 0.5], priority: 0 },
        ...Array.from({ length: MAX_TOKENS }, (_, i) => ({
          id: `word.${i}`,
          part: `word.${i}`,
          local: onFace,
          priority: 0,
        })),
      ],
      text: Array.from({ length: TAG.words + MAX_TOKENS }, () => ""),
      emphasis: [true, true, ...Array.from({ length: TAG.words - 2 + MAX_TOKENS }, () => false)],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const b = built.get(scene)!;
    const text = frame.tags.text;
    const typed = ui.text !== null;
    const steps = run?.kind === "attention" ? run.steps : [];
    const at = typed ? 0 : Math.round(tl.channels.step ?? 0);
    const step = steps[Math.min(Math.max(0, at), steps.length - 1)];
    if (!step) {
      text.fill("");
      dynamics.widthScale.fill(0, SLOT.sealed);
      return;
    }
    if (b.shown !== step) followStep(scene, b, step);
    const layout = b.layout!;
    // Typed text shows its prompt settled; the loop-only moments (a reorder, its note) are off.
    const channel = (id: string, typedValue = 1) =>
      typed ? typedValue : clamp01(tl.channels[id] ?? typedValue);
    const blocks = channel("blocks");
    const grow = channel("pipes");
    const settle = channel("settle");
    const fill = channel("fill");
    const future = channel("future");
    const flow = channel("flow");
    const turn = channel("turn");
    const swap = channel("swap");
    const guessShown = channel("guess") > 0.5;
    const lostShown = channel("lost", 0) > 0.5;
    // A reorder of the previous step: each block starts from where its word stood there.
    const before = at > 0 ? steps[at - 1] : undefined;
    const from = swap < 1 && before ? reorderFrom(before, step) : null;
    const fromLayout = from ? layoutOf(before!) : null;
    const n = step.focus + 1;
    const laterCount = step.tokens.length - n;

    b.steps.forEach((part, i) => {
      const s = layout.steps[i];
      // The stand rises with the words, so the loop's seam and a change of story start flat.
      const rise = Math.max(0.02, blocks);
      if (s)
        place(
          part.transform,
          [s.centre[0], s.centre[1] * rise, s.centre[2]],
          [s.size[0], s.size[1] * rise, s.size[2]],
        );
      else place(part.transform, PARKED, SLIVER);
    });

    // The widest pipes' shares, written on their words once the widths have settled.
    const order = widestFirst(step);
    // Shares stay on the words while a reorder carries them to their new places.
    const shown = settle >= 0.9 || swap < 1 ? Math.min(ui.slider, MAX_SHARES) : 0;
    const label = (i: number) => {
      const rank = order.indexOf(i);
      const word = tokenLabel(step.tokens[i]!);
      return rank >= 0 && rank < shown ? `${word} ${share(step.weights[i]!)}` : word;
    };

    // A block rises out of its step as its value goes 0 → 1 (fully sunk, it sits just below
    // the step's top) and returns how far it is still sunk. Earlier words rise line by line
    // with `blocks`, later ones with `future`.
    const rise = (part: BlockPart, i: number, up: number) => {
      const c = layout.centres[i]!;
      const sunk = BLOCK.height * 1.1 * (1 - up);
      const moved = from && i <= step.focus && from[i] !== i;
      const was = moved ? fromLayout!.centres[from[i]!]! : undefined;
      // Moving in a reorder: from the old place to the new one, hopping over the others.
      const centre: Vec3 = was
        ? [
            was[0] + (c[0] - was[0]) * swap,
            was[1] + (c[1] - was[1]) * swap + Math.sin(Math.PI * swap) * HOP,
            was[2] + (c[2] - was[2]) * swap,
          ]
        : [c[0], c[1] - sunk, c[2]];
      place(part.transform, centre, [layout.widths[i]!, BLOCK.height, BLOCK.depth]);
      return sunk;
    };
    const lineUp = (i: number) =>
      from ? blocks : clamp01(blocks * (layout.rows + 1) - layout.rowOf[i]!);
    for (let i = 0; i < MAX_TOKENS; i++) {
      const part = b.words[i]!;
      const earlier = i < step.focus;
      const up = earlier ? lineUp(i) : 0;
      if (earlier) rise(part, i, up);
      else place(part.transform, PARKED, SLIVER);
      frame.tags.anchors[TAG.words + i]!.part = part.id;
      text[TAG.words + i] = earlier && up > 0.6 ? label(i) : "";
    }
    const focusUp = lineUp(step.focus);
    rise(b.focusWord, step.focus, focusUp);
    dynamics.intensity[SLOT.focus] = FOCUS_GLOW;
    text[TAG.focus] = focusUp > 0.6 ? label(step.focus) : "";
    const wordsShown = blocks > 0.95;

    // The later words and their sealed stubs come up together; the tags ride the dim blocks.
    const laterShown = future > 0.6;
    for (let j = 0; j < FUTURE_WORDS; j++) {
      const i = n + j;
      const part = b.later[j]!;
      const here = j < laterCount;
      const up = here ? Math.min(blocks, future) : 0;
      const sunk = here ? rise(part, i, up) : 0;
      if (!here) place(part.transform, PARKED, SLIVER);
      // The stub and cap ride their block up, then open once it is almost there.
      b.sealed[2 * j]!.transform[13] = -sunk;
      b.sealed[2 * j + 1]!.transform[13] = -sunk;
      dynamics.widthScale[SLOT.sealed + j] = clamp01((up - 0.7) / 0.3);
      dynamics.intensity[SLOT.sealed + j] = PIPE_GLOW;
      if (here) {
        const anchor = frame.tags.anchors[TAG.words + i]!;
        anchor.part = part.id;
        text[TAG.words + i] = laterShown ? tokenLabel(step.tokens[i]!) : "";
      }
    }
    const noted = laterCount > 0 && future >= 0.9 && blocks >= 0.9;
    if (laterCount > 0) {
      // Under the later words, low on the riser of the step they stand on.
      const first = layout.centres[n]!;
      const last = layout.centres[n + laterCount - 1]!;
      const row = layout.steps.findIndex((s) => Math.abs(s.centre[2] - first[2]) < 1e-6);
      const riser = layout.steps[row]!;
      const note = frame.tags.anchors[TAG.sealed]!;
      note.part = `stand.${row}`;
      note.local = [((first[0] + last[0]) / 2 - riser.centre[0]) / riser.size[0], -0.1, 0.5];
    }
    text[TAG.sealed] = noted ? SEALED_NOTE : "";
    b.sealedAnchor.local = noted ? b.sealedAt : OUT_OF_SIGHT;

    // The mix block hangs over the stand; it grows in with the words, so the loop starts on an
    // empty stand, and lights up as the blend arrives.
    const grown = blocks;
    if (grown < 0.02) place(b.mix.transform, PARKED, SLIVER);
    else
      place(b.mix.transform, layout.mix.centre, [
        layout.mix.width * grown,
        MIX.height * grown,
        MIX.depth * grown,
      ]);
    b.mixAnchor.local = blocks >= 0.9 ? MIX_PIN : OUT_OF_SIGHT;
    dynamics.intensity[SLOT.mix] = MIX.glow * (0.3 + 0.7 * fill);
    text[TAG.mix] = wordsShown ? tokenLabel(step.tokens[step.focus]!) : "";
    text[TAG.guess] =
      wordsShown && guessShown
        ? `guess for the next word: “${tokenLabel(step.guess.token)}”, ${share(step.guess.p)} sure`
        : "";
    text[TAG.lost] = lostShown ? ORDER_NOTE : "";

    // The needle stands on the mix and tilts toward the word it drew the most from, by as many
    // degrees as attention turned the focus word's vector toward that word's.
    const { referent, before: from90, after } = step.turn;
    const tilt = ((from90 - after) * Math.PI) / 180;
    const target = layout.centres[referent]!;
    const [mx, my, mz] = layout.mix.centre;
    const top: Vec3 = [mx, my + MIX.height / 2, mz];
    const toward: Vec3 = [target[0] - top[0], 0, target[2] - top[2]];
    const flat = Math.hypot(toward[0], toward[2]) || 1;
    const needleShown = channel("needle") > 0.5 && blocks >= 0.9;
    standNeedle(b.needle.transform, top, [toward[0] / flat, 0, toward[2] / flat], tilt * turn);
    dynamics.widthScale[SLOT.needle] = needleShown ? 1 : 0;
    dynamics.intensity[SLOT.needle] = NEEDLE.glow;
    text[TAG.turn] =
      needleShown && turn >= 0.9
        ? `${Math.round(from90 - after)}° closer to “${tokenLabel(step.tokens[referent]!)}”`
        : "";

    // A hairline reaches up from each word in reading order, then every pipe settles to its
    // real weight. Settled, widthScale is exactly the weight, so width ∝ weight.
    for (let i = 0; i < MAX_TOKENS; i++) {
      const slot = SLOT.pipes + i;
      if (i >= n) {
        dynamics.widthScale[slot] = 0;
        continue;
      }
      const reached = grow * (n + 4) > i + 1;
      const w = step.weights[i]!;
      dynamics.widthScale[slot] = !reached
        ? 0
        : settle >= 1
          ? w
          : HAIRLINE + (w - HAIRLINE) * settle;
      dynamics.intensity[slot] = PIPE_GLOW;
    }
    // Pulses ride every pipe at its width, carrying light up into the mix.
    const phase = tl.t * look.flow.cyclesPerSec;
    const widestWeight = step.weights[order[0]!]!;
    for (let i = 0; i < MAX_TOKENS; i++) {
      const slot = SLOT.flows + i;
      dynamics.widthScale[slot] = dynamics.widthScale[SLOT.pipes + i]!;
      // As bright as the pipe is wide next to the widest, so hairlines carry almost nothing.
      const weight = i <= step.focus ? step.weights[i]! : 0;
      dynamics.intensity[slot] = FLOW_GLOW * flow * (weight / widestWeight);
      dynamics.flowPhase[slot] = phase;
    }

    // The "pipes" label pins to the widest pipe once it has opened; until then it waits out
    // of sight, so it never points at a pipe that isn't there yet.
    b.pipesAnchor.local = settle >= 0.5 ? b.pipesAt : OUT_OF_SIGHT;
  },
};
