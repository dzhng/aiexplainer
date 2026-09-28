/**
 * Chapter 8's scene: the `full` model as an assembly line of four blocks, set on a diagonal so
 * each stands clear of the next. In every block the text sits on a rail, four readers (the
 * attention heads) hang above it, and a pipe runs from each word to each reader, as wide as
 * that head's real attention weight from the last word, in that block's own layer. Heads that
 * share a set of notes (GQA's key/value groups) share a colour. A belt carries the work from
 * block to block. The camera stays on block 1 except for the one zoom-out (D5, the chapter's
 * `pullBack`), and the text the whole line goes on to write appears above block 1.
 *
 * Head pipes are straight tube segments (`placeSegment`): an interim stand-in for chapter 4's
 * pipe network, which lives on another lane and is not in the kit yet.
 *
 * Loop channels read: `tokens` (0 → 1 the words land on the rail), `heads` (0 → 1 the readers'
 * pipes grow, one head after another), `zoom` (the pull-back, read by the chapter scene),
 * `write` (0 → 1 the continuation is written out) and `failure` (the page shrinks to the
 * one word a single pass predicts). Typed text shows every pipe, without the page.
 */
import {
  KIT,
  placeSegment,
  UNIT_SEGMENT,
  type BlockPart,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  type TubePart,
} from "@repo/renderer";
import { evalArith } from "@repo/llm";
import type { Vec3 } from "math";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";

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
/** The pipe and lamp material of each key/value group. */
const GROUP_MATERIAL = ["bar", "barAlt"];
const BELT = { y: 1.1, radius: 0.05 };
/** The page: a sheet on the floor in front of block 1 and to its right. */
const PAGE = { center: [-2.1, 0.01, 2.5] as Vec3, size: [1.0, 0.02, 0.6] as Vec3 };

const tokenX = (i: number, n: number) => (i - (n - 1) / 2) * RAIL.pitch;
const readerX = (h: number) => (h - (HEADS - 1) / 2) * READER.pitch;

interface Built {
  tiles: BlockPart[];
  pipes: TubePart[][][];
  belts: TubePart[];
  page: BlockPart;
  slots: { pipes: number; lamps: number; belts: number };
}

const built = new WeakMap<SceneDesc, Built>();

function box(id: string, slot: number, material: string, center: Vec3, size: Vec3): BlockPart {
  return KIT.block.build({ id, slot, material, center, size }).parts[0] as BlockPart;
}

function segment(id: string, slot: number, material: string): TubePart {
  return KIT.tube.build({ id, slot, material, path: UNIT_SEGMENT, radius: 1 }).parts[0] as TubePart;
}

/** Where block `b`'s word `i` of `n` and its reader `h` sit, for pipe ends. */
function wordTop(b: number, i: number, n: number): Vec3 {
  const [cx, cz] = CENTRES[b]!;
  return [cx + tokenX(i, n), RAIL.y + 0.1 + RAIL.tile[1], cz + RAIL.z];
}
function readerFoot(b: number, h: number, i: number, n: number): Vec3 {
  const [cx, cz] = CENTRES[b]!;
  // Each reader's pipes arrive side by side along its underside, in word order.
  const spread = ((i - (n - 1) / 2) / Math.max(1, n - 1)) * READER.size[0] * 0.8;
  return [cx + readerX(h) + spread, READER.y - READER.size[1] / 2, cz + READER.z];
}

export const stack: SceneBuilder = {
  assets: {},
  // A word per rail slot, the page (or its one-word note), and a name per block.
  tagCount: STACK_TOKENS + 1 + BLOCKS,

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
      Array.from({ length: HEADS }, (_, h) =>
        Array.from({ length: STACK_TOKENS }, (_, i) =>
          segment(
            `block.${b}.pipe.${h}.${i}`,
            pipesSlot + b * HEADS + h,
            GROUP_MATERIAL[Math.floor(h / 2)]!,
          ),
        ),
      ),
    );
    slot += BLOCKS * HEADS;
    for (const perBlock of pipes) for (const perHead of perBlock) parts.push(...perHead);
    // Belts: into block 1, between blocks, and out of block 4.
    // A slot per belt, so one pass can light the line belt by belt.
    const beltSlot = slot;
    const belts = Array.from({ length: BLOCKS + 1 }, (_, k) =>
      segment(`belt.${k}`, beltSlot + k, "bar"),
    );
    slot += BLOCKS + 1;
    parts.push(...belts);
    // The page the line writes: a sheet on the floor in front of block 1, its text above it.
    const page = box("page", plainSlot, "housing", PAGE.center, PAGE.size);
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
    const scene: SceneDesc = { revision, parts, anchors, assets };
    const b: Built = {
      tiles,
      pipes,
      belts,
      page,
      slots: { pipes: pipesSlot, lamps: lampsSlot, belts: beltSlot },
    };
    built.set(scene, b);
    pose(b, BUILT_POSE, null, null, null);

    const tags: SceneTags = {
      anchors: [
        ...Array.from({ length: STACK_TOKENS }, (_, i) => ({
          id: `word.${i}`,
          part: `block.0.word.${i}`,
          local: [0, 0.5, 0.5] as Vec3,
          priority: 0,
        })),
        { id: "page", part: "page", local: [0, 0.5, 0.5], priority: 0 },
        ...Array.from({ length: BLOCKS }, (_, k) => ({
          id: `name.${k}`,
          part: `block.${k}.beam`,
          local: [0, 0.5, 0.5] as Vec3,
          priority: 0,
        })),
      ],
      text: Array.from({ length: STACK_TOKENS + 1 + BLOCKS }, () => ""),
      emphasis: Array.from({ length: STACK_TOKENS + 1 + BLOCKS }, () => false),
    };
    return { scene, tags };
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
      lit: ui.slider,
    };
    const data = run?.kind === "stack" ? run : null;
    pose(
      built.get(frame.input.scene)!,
      state,
      data,
      frame.input.dynamics.intensity,
      frame.tags.text,
    );
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
  /** The block (1-based) whose pipes glow at full strength: the slider. */
  lit: number;
}

const BUILT_POSE: Pose = { tokens: 1, heads: 1, zoom: 0, write: 0, failure: 0, pass: 0, lit: 1 };
/** Glow of the blocks the slider is not on. */
const DIM = 0.35;

/** A pipe's radius for attention weight `w` (0–1). */
export function pipeRadius(w: number): number {
  return PIPE.min + PIPE.span * w;
}

function pose(
  b: Built,
  state: Pose,
  data: StackRun | null,
  intensity: Float32Array | null,
  text: string[] | null,
): void {
  const n = data?.tokens.length ?? STACK_TOKENS;
  for (let blk = 0; blk < BLOCKS; blk++) {
    const [cx, cz] = CENTRES[blk]!;
    for (let i = 0; i < STACK_TOKENS; i++) {
      const tile = b.tiles[blk * STACK_TOKENS + i]!;
      // Words land left to right; slots past the text stay empty, but for the one word a
      // pass writes, which drops onto block 1's rail when the pass is done.
      const next = blk === 0 && i === n && i < STACK_TOKENS ? Math.max(0, state.pass * 5 - 4) : 0;
      const landed = i < n ? Math.min(1, Math.max(0, state.tokens * n - i)) : next;
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
      const grow = Math.min(1, Math.max(0, state.heads * HEADS - h));
      for (let i = 0; i < STACK_TOKENS; i++) {
        const w = data && i < n ? data.weights[blk]![h]![i]! : 0;
        const from = wordTop(blk, i, n);
        const to = readerFoot(blk, h, i, n);
        for (let a = 0; a < 3; a++) to[a] = from[a]! + (to[a]! - from[a]!) * Math.max(grow, 1e-3);
        const shown = (data === null || i < n) && grow > 0;
        placeSegment(b.pipes[blk]![h]![i]!.transform, from, to, shown ? pipeRadius(w) : 1e-4);
      }
    }
  }
  // Belts: from the left into block 1's rail end, block to block, out past block 4.
  for (let k = 0; k <= BLOCKS; k++) {
    const left = k === 0 ? [CENTRES[0]![0] - 2.3, CENTRES[0]![1] + 0.8] : CENTRES[k - 1]!;
    const right =
      k === BLOCKS ? [CENTRES[BLOCKS - 1]![0] + 2.3, CENTRES[BLOCKS - 1]![1] - 0.8] : CENTRES[k]!;
    const from: Vec3 = [left[0]! + (k === 0 ? 0 : BLOCK.width / 2), BELT.y, left[1]! - 0.5];
    const to: Vec3 = [right[0]! - (k === BLOCKS ? 0 : BLOCK.width / 2), BELT.y, right[1]! - 0.5];
    placeSegment(b.belts[k]!.transform, from, to, BELT.radius);
  }
  // The page shows only while it has words on it.
  const pageShown = state.write > 0 || state.failure >= 0.5 ? 1 : 1e-4;
  b.page.transform[0] = PAGE.size[0] * pageShown;
  b.page.transform[10] = PAGE.size[2] * pageShown;
  if (intensity) {
    // Belts glow as the one pass reaches them, and sit dim otherwise.
    for (let k = 0; k <= BLOCKS; k++)
      intensity[b.slots.belts + k] = 0.35 + (state.pass > 0 && state.pass * 5 >= k ? 1.2 : 0);
    for (let h = 0; h < HEADS; h++) {
      const grow = Math.min(1, Math.max(0, state.heads * HEADS - h));
      intensity[b.slots.lamps + h] = 0.2 + 0.9 * grow;
      for (let blk = 0; blk < BLOCKS; blk++)
        intensity[b.slots.pipes + blk * HEADS + h] =
          (0.3 + 0.7 * grow) * (blk + 1 === state.lit ? 1 : DIM);
    }
  }
  if (!text) return;
  for (let i = 0; i < STACK_TOKENS; i++) {
    const word = data && i < n ? data.tokens[i]! : "";
    const landed = i < n && state.tokens * n - i >= 1;
    text[i] = landed ? (word === "<bos>" ? "·" : word.trim() || "␣") : "";
    if (data && i === n && state.pass >= 1) text[i] = data.next.trim();
  }
  const page = data
    ? wrap(`…${data.prompt.split(" ").slice(-2).join(" ")}${data.continuation}`)
    : "";
  const chars = Math.round(page.length * state.write);
  // The page, written out; at the failure beat it shrinks to the one word a single pass makes.
  text[STACK_TOKENS] = !data
    ? ""
    : state.failure >= 0.5
      ? `one pass through the line\nwrites one word: “${data.next.trim()}”`
      : state.write > 0
        ? page.slice(0, chars)
        : "";
  for (let k = 0; k < BLOCKS; k++)
    text[STACK_TOKENS + 1 + k] =
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
