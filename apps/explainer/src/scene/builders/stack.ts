/**
 * Chapter 8's scene: the `full` model as an assembly line of four blocks, set on a diagonal so
 * each stands clear of the next. In every block the text sits on a rail, four readers (the
 * attention heads) hang above it, and a pipe runs from each word to each reader, as wide as
 * that head's real attention weight from the last word, in that block's own layer. Heads that
 * share a set of notes (GQA's key/value groups) share a colour. A belt carries the work from
 * block to block. The camera stays on block 1 except for the one zoom-out (D5, the chapter's
 * `pullBack`), and the text the whole line goes on to write appears above block 1.
 *
 * Head pipes are chapter 4's pipe network (kit `pipes`): each rises from its word and curves
 * into the reader's underside, its radius scaled by the weight through `widthScale`.
 *
 * Loop channels read: `tokens` (0 → 1 the words land on the rail), `heads` (0 → 1 the readers'
 * pipes grow, one head after another), `zoom` (the pull-back, read by the chapter scene),
 * `write` (0 → 1 the continuation is written out) and `failure` (the page shrinks to the
 * one word a single pass predicts). Typed text shows every pipe, without the page.
 */
import { clamp } from "math";
import {
  KIT,
  pipePaths,
  placeSegment,
  text,
  type BlockPart,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  type SceneText,
  type TubePart,
} from "@repo/renderer";
import { evalArith } from "@repo/llm";
import type { Mat4, Vec3 } from "math";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";
import { nextRevision } from "../revision.ts";
import { box, segment } from "./parts.ts";

/** Chapter 8's run (`runtime/runs/stack.ts`). */
export interface StackRun {
  kind: "stack";
  prompt: string;
  /** The words on the rail, as the model reads them (`<bos>` first). */
  tokens: string[];
  /** `[layer][head][token]`: each head's attention weight from the last word. */
  weights: number[][][];
  /** Each head's key/value group: heads in one group read the same notes. */
  kvGroup: number[];
  /** What the model writes next, seeded: the page above block 1. */
  continuation: string;
  /** The first word of it: all one pass through the line predicts. */
  next: string;
}

/** Words the rail holds; longer text keeps `<bos>` and its last words. */
export const STACK_TOKENS = 12;
const BLOCKS = 4;
const HEADS = 4;
/** Block centres on the floor: a diagonal line, front-left to back-right. */
const CENTRES: [number, number][] = [
  [-3.3, 1.2],
  [-1.1, -0.1],
  [1.1, -1.4],
  [3.3, -2.7],
];
const BLOCK = { width: 2.9, depth: 1.2, height: 2.5 };
const RAIL = { y: 0.25, z: 0.35, pitch: 0.24, tile: [0.2, 0.11, 0.06] as Vec3 };
const READER = { y: 1.95, z: -0.35, pitch: 0.7, size: [0.5, 0.32, 0.3] as Vec3 };
/** Pipe radius: a hairline floor, plus the weight's share (linear, so strong pulls stand out). */
const PIPE = { min: 0.0015, span: 0.05 };
/** How far a pipe rises straight out of its word before curving to its reader, metres. */
const PIPE_LIFT = 0.35;
/** The pipe and lamp material of each key/value group. */
const GROUP_MATERIAL = ["bar", "barAlt"];
/** `end`: how far (x, z) the first belt starts before block 1 and the last runs past block 4. */
const BELT = { y: 1.1, radius: 0.05, end: [1, 0.35] as const };
/**
 * The page: a sheet propped on the floor in front of block 1 and to its right, its front edge
 * on the floor and its face tilted `tilt` radians up toward the camera, so its words read.
 */
const PAGE = { at: [-2.1, 2.7] as const, size: [1.1, 0.02, 0.62] as Vec3, tilt: 1.05 };

/** The page's transform: propped as `PAGE` says, at `shown` of its size (0 hides it). */
function placePage(t: Mat4, shown: number): void {
  const [w, h, d] = PAGE.size;
  const s = Math.max(shown, 1e-4);
  const c = Math.cos(PAGE.tilt);
  const sn = Math.sin(PAGE.tilt);
  // Rotated about x: its top face's normal leans from +y toward +z (column-major).
  const m = [w * s, 0, 0, 0, 0, h * c, h * sn, 0, 0, -d * s * sn, d * s * c, 0];
  for (let i = 0; i < m.length; i++) t[i] = m[i]!;
  t[12] = PAGE.at[0];
  t[13] = (d / 2) * sn + (h / 2) * c;
  t[14] = PAGE.at[1] + (d / 2) * c;
  t[15] = 1;
}

const tokenX = (i: number, n: number) => (i - (n - 1) / 2) * RAIL.pitch;
const readerX = (h: number) => (h - (HEADS - 1) / 2) * READER.pitch;

interface Built {
  tiles: BlockPart[];
  /** `[block][head][word]`, a dynamics slot each (`slots.pipes` + the flat index). */
  pipes: TubePart[][][];
  /** How many words the pipes were last laid out for. */
  laidFor: number;
  belts: TubePart[];
  page: BlockPart;
  slots: { pipes: number; lamps: number; belts: number };
  text: { words: SceneText[]; page: SceneText; names: SceneText[] };
}

/**
 * Font sizes (em), metres: a word on its rail tile, the page's lines, and each block's name
 * (read from the pull-back, so large).
 */
const TEXT = { tile: 0.09, page: 0.08, name: 0.22 };

const built = new WeakMap<SceneDesc, Built>();

/** Where block `b`'s word `i` of `n` sits, for pipe ends. */
function wordTop(b: number, i: number, n: number): Vec3 {
  const [cx, cz] = CENTRES[b]!;
  return [cx + tokenX(i, n), RAIL.y + 0.1 + RAIL.tile[1], cz + RAIL.z];
}
/** Block `b`'s pipes into reader `h` from `n` words: they arrive side by side along its underside. */
function headPaths(b: number, h: number, n: number): Vec3[][] {
  const [cx, cz] = CENTRES[b]!;
  const sources = Array.from({ length: STACK_TOKENS }, (_, i) => wordTop(b, Math.min(i, n - 1), n));
  return pipePaths({
    sources,
    sink: [cx + readerX(h), READER.y - READER.size[1] / 2, cz + READER.z],
    spread: [READER.size[0] * 0.8, 0],
    lift: PIPE_LIFT,
  });
}

export const stack: SceneBuilder = {
  assets: {},

  create(assets, revision) {
    let slot = 0;
    const plainSlot = slot++;
    const parts: Part[] = [];
    const tiles: BlockPart[] = [];
    for (let b = 0; b < BLOCKS; b++) {
      const [cx, cz] = CENTRES[b]!;
      const { width, depth, height } = BLOCK;
      parts.push(
        box(`block.${b}.plate`, plainSlot, "housing", [cx, 0.025, cz], [width, 0.05, depth]),
        box(
          `block.${b}.post.0`,
          plainSlot,
          "metal",
          [cx - width / 2, height / 2, cz - 0.5],
          [0.07, height, 0.07],
        ),
        box(
          `block.${b}.post.1`,
          plainSlot,
          "metal",
          [cx + width / 2, height / 2, cz - 0.5],
          [0.07, height, 0.07],
        ),
        box(
          `block.${b}.beam`,
          plainSlot,
          "metal",
          [cx, height, cz - 0.5],
          [width + 0.07, 0.09, 0.09],
        ),
        box(
          `block.${b}.rail`,
          plainSlot,
          "housing",
          [cx, RAIL.y, cz + RAIL.z],
          [width - 0.1, 0.2, 0.22],
        ),
      );
    }
    // Word tiles: block 1's carry the words; the others repeat them.
    for (let b = 0; b < BLOCKS; b++)
      for (let i = 0; i < STACK_TOKENS; i++) {
        const tile = box(`block.${b}.word.${i}`, plainSlot, "card", [0, 0, 0], RAIL.tile);
        tiles.push(tile);
        parts.push(tile);
      }
    const lampsSlot = slot;
    for (let b = 0; b < BLOCKS; b++)
      for (let h = 0; h < HEADS; h++) {
        const [cx, cz] = CENTRES[b]!;
        const [x, y, z] = [cx + readerX(h), READER.y, cz + READER.z];
        parts.push(box(`block.${b}.reader.${h}`, plainSlot, "housing", [x, y, z], READER.size));
        // The lamp on its face, in its note group's colour (a slot per head, for its glow).
        const lamp = box(
          `block.${b}.reader.${h}.lamp`,
          lampsSlot + h,
          GROUP_MATERIAL[Math.floor(h / 2)]!,
          [x, y, z + READER.size[2] / 2 + 0.01],
          [READER.size[0] * 0.7, 0.08, 0.02],
        );
        parts.push(lamp);
      }
    slot += HEADS;
    // A slot per block and head, so the slider's block can glow brighter than the rest.
    const pipesSlot = slot;
    const pipes = Array.from({ length: BLOCKS }, (_, b) =>
      Array.from(
        { length: HEADS },
        (_, h) =>
          KIT.pipes.build({
            id: `block.${b}.pipe.${h}`,
            slot: pipesSlot + (b * HEADS + h) * STACK_TOKENS,
            material: GROUP_MATERIAL[Math.floor(h / 2)]!,
            sources: headPaths(b, h, STACK_TOKENS).map((p) => p[0]!),
            sink: headPaths(b, h, STACK_TOKENS)[0]!.at(-1)!,
            radius: PIPE.span,
          }).parts as TubePart[],
      ),
    );
    slot += BLOCKS * HEADS * STACK_TOKENS;
    for (const perBlock of pipes) for (const perHead of perBlock) parts.push(...perHead);
    // Belts: into block 1, between blocks, and out of block 4.
    // A slot per belt, so one pass can light the line belt by belt.
    const beltSlot = slot;
    const belts = Array.from({ length: BLOCKS + 1 }, (_, k) =>
      segment(`belt.${k}`, beltSlot + k, "bar"),
    );
    slot += BLOCKS + 1;
    parts.push(...belts);
    // The page the line writes: a sheet propped in front of block 1, its text written on it.
    const page = box("page", plainSlot, "card", [0, 0, 0], PAGE.size);
    parts.push(page);
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: slot++,
      bounds: [-4.9, 0, -3.4, 4.9, BLOCK.height, 1.9],
      softness: 0.4,
    });
    parts.unshift(...shadow.parts);

    const anchors: SceneAnchor[] = [
      { id: "readers", part: "block.0.reader.3", local: [0.5, 0.5, 0.5], priority: 3 },
      { id: "words", part: "block.0.rail", local: [-0.45, -0.5, 0.5], priority: 2 },
      { id: "block", part: "block.0.beam", local: [-0.35, 0.5, 0.5], priority: 2 },
      { id: "line", part: "block.1.beam", local: [0.3, 0.5, 0.5], priority: 1 },
    ];
    const texts: Built["text"] = {
      // Block 1's words, each on its tile in dark ink.
      words: Array.from({ length: STACK_TOKENS }, (_, i) =>
        text({
          id: `word.${i}`,
          part: `block.0.word.${i}`,
          local: [0, 0, 0.5],
          size: TEXT.tile,
          style: "ink",
          maxWidth: RAIL.tile[0] - 0.012,
        }),
      ),
      // The page's words are written on the propped sheet itself, from its left.
      page: text({
        id: "page",
        part: "page",
        local: [-0.45, 0.5, 0],
        face: "top",
        size: TEXT.page,
        style: "ink",
        align: [0, 0.5],
        maxWidth: PAGE.size[0] - 0.1,
      }),
      // Each block's name stands on its top beam, like the letters of a sign.
      names: Array.from({ length: BLOCKS }, (_, k) =>
        text({
          id: `name.${k}`,
          part: `block.${k}.beam`,
          local: [0, 0.5, 0.5],
          size: TEXT.name,
          style: "chalk",
          align: [0.5, 1.15],
        }),
      ),
    };
    const scene: SceneDesc = {
      revision,
      parts,
      anchors,
      assets,
      text: [...texts.words, texts.page, ...texts.names],
    };
    const b: Built = {
      tiles,
      pipes,
      laidFor: 0,
      belts,
      page,
      slots: { pipes: pipesSlot, lamps: lampsSlot, belts: beltSlot },
      text: texts,
    };
    built.set(scene, b);
    pose(b, BUILT_POSE, null, null, null, false);
    return scene;
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const typed = ui.text !== null;
    const ch = (id: string, loop: number, still: number) =>
      typed ? still : (tl.channels[id] ?? loop);
    const state: Pose = {
      tokens: ch("tokens", 1, 1),
      heads: ch("heads", 1, 1),
      zoom: ch("zoom", 0, 0),
      write: ch("write", 0, 0),
      failure: ch("failure", 0, 0),
      pass: ch("pass", 0, 0),
    };
    const data = run?.kind === "stack" ? run : null;
    const b = built.get(frame.input.scene)!;
    // A text of another length lays the pipes out afresh: a new structure for the renderer.
    const n = data?.tokens.length ?? STACK_TOKENS;
    if (b.laidFor !== n) {
      layPipes(b, n);
      frame.input.scene.revision = nextRevision();
    }
    pose(b, state, data, frame.input.dynamics.intensity, frame.input.dynamics.widthScale, true);
  },
};

interface Pose {
  tokens: number;
  heads: number;
  zoom: number;
  write: number;
  failure: number;
  /** 0 → 1 one pass runs down the line, belt by belt, and its one word lands on the rail. */
  pass: number;
}

const BUILT_POSE: Pose = { tokens: 1, heads: 1, zoom: 0, write: 0, failure: 0, pass: 0 };
/** The block (1-based) whose pipes glow at full strength: the one the hero shot frames. */
const LIT_BLOCK = 1;
/** Glow of the other blocks. */
const DIM = 0.35;

/** A pipe's radius for attention weight `w` (0–1). */
export function pipeRadius(w: number): number {
  return PIPE.min + PIPE.span * w;
}

/** Points every block's head pipes at `n` words (words past the text share the last one's). */
function layPipes(b: Built, n: number): void {
  for (let blk = 0; blk < BLOCKS; blk++)
    for (let h = 0; h < HEADS; h++) {
      const paths = headPaths(blk, h, n);
      b.pipes[blk]![h]!.forEach((pipe, i) => {
        pipe.path = paths[i]!;
      });
    }
  b.laidFor = n;
}

function pose(
  b: Built,
  state: Pose,
  data: StackRun | null,
  intensity: Float32Array | null,
  widthScale: Float32Array | null,
  write: boolean,
): void {
  const n = data?.tokens.length ?? STACK_TOKENS;
  for (let blk = 0; blk < BLOCKS; blk++) {
    const [cx, cz] = CENTRES[blk]!;
    for (let i = 0; i < STACK_TOKENS; i++) {
      const tile = b.tiles[blk * STACK_TOKENS + i]!;
      // Words land left to right; slots past the text stay empty, but for the one word a
      // pass writes, which drops onto block 1's rail when the pass is done.
      const next = blk === 0 && i === n && i < STACK_TOKENS ? Math.max(0, state.pass * 5 - 4) : 0;
      const landed = i < n ? clamp(state.tokens * n - i, 0, 1) : next;
      const scale = landed > 0 ? 1 : 1e-4;
      tile.transform[0] = RAIL.tile[0] * scale;
      tile.transform[5] = RAIL.tile[1] * scale;
      tile.transform[10] = RAIL.tile[2] * scale;
      tile.transform[12] = cx + tokenX(i, i === n ? n + 1 : n) + (i === n ? RAIL.pitch / 2 : 0);
      tile.transform[13] = RAIL.y + 0.1 + RAIL.tile[1] / 2 + (1 - landed) * 0.3;
      tile.transform[14] = cz + RAIL.z;
    }
    for (let h = 0; h < HEADS; h++) {
      // Head h's pipes grow once `heads` passes h / HEADS.
      const grow = clamp(state.heads * HEADS - h, 0, 1);
      for (let i = 0; i < STACK_TOKENS; i++) {
        const w = data && i < n ? data.weights[blk]![h]![i]! : 0;
        const shown = (data === null || i < n) && grow > 0;
        // The kit pipe is built at `PIPE.span`; widthScale scales it to this weight's radius,
        // opening from nothing as the head's pipes grow.
        const slot = b.pipes[blk]![h]![i]!.slot;
        if (widthScale) widthScale[slot] = shown ? (pipeRadius(w) / PIPE.span) * grow : 0;
      }
    }
  }
  // Belts: from the left into block 1's rail end, block to block, out past block 4.
  for (let k = 0; k <= BLOCKS; k++) {
    const [ex, ez] = BELT.end;
    const left = k === 0 ? [CENTRES[0]![0] - ex, CENTRES[0]![1] + ez] : CENTRES[k - 1]!;
    const right =
      k === BLOCKS ? [CENTRES[BLOCKS - 1]![0] + ex, CENTRES[BLOCKS - 1]![1] - ez] : CENTRES[k]!;
    const from: Vec3 = [left[0]! + (k === 0 ? 0 : BLOCK.width / 2), BELT.y, left[1]! - 0.5];
    const to: Vec3 = [right[0]! - (k === BLOCKS ? 0 : BLOCK.width / 2), BELT.y, right[1]! - 0.5];
    placeSegment(b.belts[k]!.transform, from, to, BELT.radius);
  }
  // The page shows only while it has words on it.
  const pageShown = state.write > 0 || state.failure >= 0.5 ? 1 : 1e-4;
  placePage(b.page.transform, pageShown);
  if (intensity) {
    // Belts glow as the one pass reaches them, and sit dim otherwise.
    for (let k = 0; k <= BLOCKS; k++)
      intensity[b.slots.belts + k] = 0.35 + (state.pass > 0 && state.pass * 5 >= k ? 1.2 : 0);
    for (let h = 0; h < HEADS; h++) {
      const grow = clamp(state.heads * HEADS - h, 0, 1);
      intensity[b.slots.lamps + h] = 0.2 + 0.9 * grow;
      for (let blk = 0; blk < BLOCKS; blk++)
        for (const pipe of b.pipes[blk]![h]!)
          intensity[pipe.slot] = (0.3 + 0.7 * grow) * (blk + 1 === LIT_BLOCK ? 1 : DIM);
    }
  }
  if (!write) return;
  const text = b.text;
  for (let i = 0; i < STACK_TOKENS; i++) {
    const word = data && i < n ? data.tokens[i]! : "";
    const landed = i < n && state.tokens * n - i >= 1;
    const tile = text.words[i]!;
    tile.text = landed ? (word === "<bos>" ? "·" : word.trim() || "␣") : "";
    if (data && i === n && state.pass >= 1) tile.text = data.next.trim();
  }
  const page = data
    ? wrap(`…${data.prompt.split(" ").slice(-2).join(" ")}${data.continuation}`)
    : "";
  const chars = Math.round(page.length * state.write);
  // The page, written out; at the failure beat it shrinks to the one word a single pass makes.
  text.page.text = !data
    ? ""
    : state.failure >= 0.5
      ? `one pass through the line\nwrites one word: “${data.next.trim()}”`
      : state.write > 0
        ? page.slice(0, chars)
        : "";
  for (let k = 0; k < BLOCKS; k++)
    text.names[k]!.text =
      state.zoom > 0.6
        ? k === BLOCKS - 1
          ? `block ${k + 1} of ${BLOCKS}\n(Llama-3-8B has ${evalArith("layers", {})})`
          : `block ${k + 1}`
        : "";
}

/** Breaks the page into lines of about 30 characters, at spaces. */
function wrap(s: string): string {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(" ")) {
    if (line && line.length + word.length + 1 > 30) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.join("\n");
}
