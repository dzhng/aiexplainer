/**
 * Chapter 4's scene: the prompt laid out as word blocks on a stepped stand, one line per step
 * like a page, and above it the last word's mix: a glowing block fed by a pipe from every word
 * up to and including the last (kit: `block`, `pipes`). Each pipe's cross-section area is the
 * last word's real attention weight on the word it comes from (`widthScale` = weight), so the
 * widest pipe runs from the word it draws the most from.
 *
 * Views: Exploded lifts the mix and its pipes off the words and drops the stand away.
 *
 * Loop channels read: `blocks` (0 → 1 as the words rise into place), `pipes` (0 → 1: hairline
 * pipes reach up from each word in reading order), `settle` (0 → 1: widths go from hairline
 * to the real weights), `fill` (0 → 1: the mix block lights up as the blend arrives).
 * Typed text shows its settled pipes at once, without the loop's motion.
 */
import {
  KIT,
  pipePaths,
  type BlockPart,
  type SceneAnchor,
  type SceneDesc,
  type TubePart,
} from "@repo/renderer";
import type { Mat4, Vec3 } from "math";
import { share } from "../../chapters/format.ts";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { AttentionStep, SceneBuilder, SceneFrame } from "../build-frame.ts";
import { nextRevision } from "../revision.ts";

/** The most tokens the scene lays out (`<bos>` included); longer text keeps its last ones. */
export const MAX_TOKENS = 48;

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
const MIX = { above: 1.1, height: 0.14, depth: 0.5, share: 0.42, glow: 0.2 };
/** A pipe's radius at weight 1: the width is proportional to the weight. */
const PIPE_RADIUS = 0.25;
/** Pipes glow softly, so their width, not their bloom, carries the weight. */
const PIPE_GLOW = 0.3;
/** The lit focus word in its line glows less than the mix it feeds. */
const FOCUS_GLOW = 0.12;
/** The thread a pipe starts as, before it settles to its weight (as a widthScale). */
const HAIRLINE = 0.02;
/** Pipes leave from the back half of their word's top, clear of the word on its face. */
const PIPE_FOOT_BACK = 0.25;
/** Where unused blocks wait: under the floor, at a sliver of size. */
const PARKED: Vec3 = [0, -2, 0];
const SLIVER: Vec3 = [0.01, 0.01, 0.01];
/** Where a label waits while its part has nothing to show: far below the room, off screen. */
const OUT_OF_SIGHT: Vec3 = [0, -100, 0];

/** Exploded view: the mix and its pipes lift off the words; the stand drops away. */
const EXPLODE = { mix: [0, 0.45, 0] as Vec3, stand: [0, -0.3, 0] as Vec3 };

/**
 * At most this many of the widest pipes show their share, written on their word's block after
 * the word (the slider picks how many); their blocks are laid out wide enough for it.
 */
const MAX_SHARES = 5;
const SHARE_ROOM = " 00%";
/** Scene text slots: the mix's word, the focus word, then one per word block. */
const TAG = { mix: 0, focus: 1, words: 2 } as const;

/** Dynamics slots. */
const SLOT = { stand: 0, words: 1, focus: 2, mix: 3, pipes: 4 } as const;

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
  /** Where the pipes enter the mix: the centre of its underside and their spread across it. */
  sink: Vec3;
  spread: [number, number];
}

/**
 * Wraps the blocks into lines no wider than `LINE_WIDTH`, one per step, centred on x = 0.
 * `labels` is what each block must hold (its word, and room for a share on the widest).
 */
export function layoutTokens(labels: string[]): Layout {
  const widths = labels.map((label) => BLOCK.pad + BLOCK.perChar * label.length);
  const lines: number[][] = [[]];
  let run = 0;
  widths.forEach((w, i) => {
    const line = lines.at(-1)!;
    if (line.length > 0 && run + BLOCK.gap + w > LINE_WIDTH) {
      lines.push([i]);
      run = w;
    } else {
      line.push(i);
      run += (line.length > 1 ? BLOCK.gap : 0) + w;
    }
  });
  if (lines.length > MAX_LINES) throw new Error(`attention: ${lines.length} lines of words`);
  const centres: Vec3[] = [];
  const steps: Layout["steps"] = [];
  const rows = lines.length;
  // The last line sits on the front step; earlier lines step up and back, like a page.
  for (let r = rows - 1; r >= 0; r--) {
    const line = lines[r]!;
    const back = rows - 1 - r;
    const y = STEP.frontY + back * STEP.up;
    const z = STEP.frontZ - back * STEP.back;
    const span = line.reduce((n, i) => n + widths[i]!, 0) + BLOCK.gap * (line.length - 1);
    let x = -span / 2;
    for (const i of line) {
      centres[i] = [x + widths[i]! / 2, y, z];
      x += widths[i]! + BLOCK.gap;
    }
    const top = y - BLOCK.height / 2;
    steps.push({ centre: [0, top / 2, z], size: [LINE_WIDTH + 0.3, top, STEP.back] });
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
    mix: { centre, width },
    sink: [0, centre[1] - MIX.height / 2, midZ],
    spread: [width - 0.2, MIX.depth - 0.16],
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
  focusWord: BlockPart;
  mix: BlockPart;
  pipes: TubePart[];
  shown: AttentionStep | null;
  layout: Layout | null;
  /** The "pipes" label rides the widest pipe of the step shown, at `pipesAt`. */
  pipesAnchor: SceneAnchor;
  pipesAt: Vec3;
}
const built = new WeakMap<SceneDesc, Built>();
const layouts = new WeakMap<AttentionStep, Layout>();

function layoutOf(step: AttentionStep): Layout {
  let layout = layouts.get(step);
  if (!layout) {
    const shares = new Set(widestFirst(step).slice(0, MAX_SHARES));
    const labels = step.tokens.map((t, i) => tokenLabel(t) + (shares.has(i) ? SHARE_ROOM : ""));
    layouts.set(step, (layout = layoutTokens(labels)));
  }
  return layout;
}

/** Token indices up to the focus, widest pipe first (ties in reading order). */
export function widestFirst(step: AttentionStep): number[] {
  return Array.from({ length: step.focus + 1 }, (_, i) => i).sort(
    (a, b) => step.weights[b]! - step.weights[a]! || a - b,
  );
}

/** Lays the pipes (and the label riding them) along `step`'s layout: a new revision. */
function followStep(scene: SceneDesc, b: Built, step: AttentionStep): void {
  const layout = layoutOf(step);
  const sources = b.pipes.map((_, i): Vec3 => {
    const [x, y, z] = layout.centres[Math.min(i, step.focus)]!;
    return [x, y + BLOCK.height / 2, z - BLOCK.depth * PIPE_FOOT_BACK];
  });
  const paths = pipePaths({ sources, sink: layout.sink, spread: layout.spread });
  b.pipes.forEach((pipe, i) => {
    pipe.path = paths[i]!;
  });
  const top = b.pipes[widestFirst(step)[0]!]!;
  b.pipesAnchor.part = top.id;
  b.pipesAt = top.path[Math.round((top.path.length - 1) * 0.45)]!;
  b.shown = step;
  b.layout = layout;
  scene.revision = nextRevision();
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

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
    const focusWord = block("focus-word", SLOT.focus, "focusWord");
    const mix = block("mix", SLOT.mix, "focusWord", EXPLODE.mix);
    const pipes = KIT.pipes.build({
      id: "pipe",
      slot: SLOT.pipes,
      material: "pipe",
      sources: Array.from({ length: MAX_TOKENS }, (_, i): Vec3 => [i * 0.05, 0.5, 0]),
      sink: [0, 2, 0],
      radius: PIPE_RADIUS,
      explode: EXPLODE.mix,
    });
    const parts = [
      ...stand.flatMap((s) => s.parts),
      ...words.flatMap((w) => w.parts),
      ...focusWord.parts,
      ...mix.parts,
      ...pipes.parts,
    ];
    const pipesAnchor: SceneAnchor = { ...pipes.anchors[0]!, id: "pipes", priority: 2 };
    const anchors: SceneAnchor[] = [
      // The mix block's right end, so the pill clears the word written on it.
      { id: "mix", part: "mix", local: [0.5, 0, 0.5], priority: 3 },
      pipesAnchor,
      // The front step's left end: the page of words.
      { id: "sentence", part: "stand.0", local: [-0.5, 0, 0.5], priority: 1 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    built.set(scene, {
      steps: stand.map((s) => s.parts[0] as BlockPart),
      words: words.map((w) => w.parts[0] as BlockPart),
      focusWord: focusWord.parts[0] as BlockPart,
      mix: mix.parts[0] as BlockPart,
      pipes: pipes.parts as TubePart[],
      shown: null,
      layout: null,
      pipesAnchor,
      pipesAt: pipesAnchor.local,
    });
    // Each word sits on the bottom of its block's front face; the lit words are printed on.
    const onFace: Vec3 = [0, -0.5, 0.5];
    const tags: SceneTags = {
      anchors: [
        { id: "mix-word", part: "mix", local: [0, 0, 0.5], priority: 0 },
        { id: "focus-word", part: "focus-word", local: [0, 0, 0.5], priority: 0 },
        ...Array.from({ length: MAX_TOKENS }, (_, i) => ({
          id: `word.${i}`,
          part: `word.${i}`,
          local: onFace,
          priority: 0,
        })),
      ],
      text: Array.from({ length: TAG.words + MAX_TOKENS }, () => ""),
      emphasis: [true, true, ...Array.from({ length: MAX_TOKENS }, () => false)],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const b = built.get(scene)!;
    const text = frame.tags.text;
    const step = run?.kind === "attention" ? run.steps[0] : undefined;
    if (!step) {
      text.fill("");
      dynamics.widthScale.fill(0, SLOT.pipes);
      return;
    }
    if (b.shown !== step) followStep(scene, b, step);
    const layout = b.layout!;
    const typed = ui.text !== null;
    const blocks = typed ? 1 : clamp01(tl.channels.blocks ?? 1);
    const grow = typed ? 1 : clamp01(tl.channels.pipes ?? 1);
    const settle = typed ? 1 : clamp01(tl.channels.settle ?? 1);
    const fill = typed ? 1 : clamp01(tl.channels.fill ?? 1);
    const n = step.focus + 1;

    b.steps.forEach((part, i) => {
      const s = layout.steps[i];
      place(part.transform, s?.centre ?? PARKED, s?.size ?? SLIVER);
    });

    // The widest pipes' shares, written on their words once the widths have settled.
    const order = widestFirst(step);
    const shown = settle >= 0.9 ? Math.min(ui.slider, MAX_SHARES) : 0;
    const label = (i: number) => {
      const rank = order.indexOf(i);
      const word = tokenLabel(step.tokens[i]!);
      return rank >= 0 && rank < shown ? `${word} ${share(step.weights[i]!)}` : word;
    };

    // Word blocks rise out of their steps as `blocks` goes 0 → 1 (fully sunk, a block sits
    // just below its step's top); the focus word is lit.
    const sunk = BLOCK.height * 1.1 * (1 - blocks);
    const wordsShown = blocks > 0.6;
    for (let i = 0; i < MAX_TOKENS; i++) {
      const c = i === step.focus ? undefined : layout.centres[i];
      const part = b.words[i]!;
      if (c)
        place(
          part.transform,
          [c[0], c[1] - sunk, c[2]],
          [layout.widths[i]!, BLOCK.height, BLOCK.depth],
        );
      else place(part.transform, PARKED, SLIVER);
      text[TAG.words + i] = c && wordsShown ? label(i) : "";
    }
    const [fx, fy, fz] = layout.centres[step.focus]!;
    place(
      b.focusWord.transform,
      [fx, fy - sunk, fz],
      [layout.widths[step.focus]!, BLOCK.height, BLOCK.depth],
    );
    dynamics.intensity[SLOT.focus] = FOCUS_GLOW;
    text[TAG.focus] = wordsShown ? label(step.focus) : "";

    // The mix block hangs over the stand; it lights up as the blend arrives.
    place(b.mix.transform, layout.mix.centre, [layout.mix.width, MIX.height, MIX.depth]);
    dynamics.intensity[SLOT.mix] = MIX.glow * (0.3 + 0.7 * fill);
    text[TAG.mix] = wordsShown ? tokenLabel(step.tokens[step.focus]!) : "";

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

    // The "pipes" label pins to the widest pipe once it has opened; until then it waits out
    // of sight, so it never points at a pipe that isn't there yet.
    b.pipesAnchor.local = settle >= 0.5 ? b.pipesAt : OUT_OF_SIGHT;
  },
};
