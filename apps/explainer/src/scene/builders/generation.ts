/**
 * Chapter 9's scene: the generation loop. The text sits on a rail in front of the machine (the
 * `full` model's four blocks, drawn as four bands on one housing). Each step, a light sweeps
 * the whole rail from the first word, a feed pipe per word lighting as it is reread, the
 * bands light, a new word appears above the machine and flies to the end of the rail, and the
 * work counter climbs by the number of tokens that step fed. The counter's steps grow each
 * time (10, 11, 12…): the rereading is the waste chapter 10 removes.
 *
 * Every number is the run's (`runtime/runs/generation.ts`): the words are the worker's seeded
 * generation with no notes kept, and each step's `fed` is what that forward pass read.
 *
 * Loop channels read: `step` (0 → steps: the integer part is steps done, the fraction the phase
 * of the one in progress), `failure` (the counter spells out the rereading) and `fade` (1 → 0
 * the written words clear before the seam). Typed text shows every step done.
 */
import {
  KIT,
  placeBar,
  placeSegment,
  type BarSlot,
  type BlockPart,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  type TubePart,
} from "@repo/renderer";
import type { Vec3 } from "math";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";
import { box, segment } from "./parts.ts";
import { smoothstep } from "../ease.ts";
import { tokenLabel } from "../../chapters/format.ts";

/** Chapter 9's run (`runtime/runs/generation.ts`). */
export interface GenerationRun {
  kind: "generation";
  prompt: string;
  /** The prompt's tokens as the model reads them (`<bos>` first). */
  tokens: string[];
  /** One per written word: the word, and how many tokens that step fed through the model. */
  steps: { word: string; fed: number }[];
}

/** Words the loop writes. */
export const GENERATION_STEPS = 6;
/** Rail slots: a prompt of up to ten tokens plus the written words. */
export const RAIL_SLOTS = 16;
/** The machine's layers (its bands), and the note rack's in chapter 10. */
export const LAYERS = 4;

/** The shared layout of chapters 9 and 10: the rail in front, the machine behind it. */
export const LINE = {
  rail: { y: 0.28, z: 0.9, pitch: 0.36, tile: [0.34, 0.14, 0.07] as Vec3 },
  machine: { center: [0, 1.45, -0.7] as Vec3, size: [2.4, 1.5, 1.0] as Vec3 },
  /** Where a new word appears, above the machine. */
  birth: [0, 2.55, -0.2] as Vec3,
  counter: { x: 3.3, z: 0.3, width: 0.3, floor: 0.02, max: 2.2 },
} as const;

export const slotX = (i: number) => (i - (RAIL_SLOTS - 1) / 2) * LINE.rail.pitch;
const tileY = LINE.rail.y + 0.1 + LINE.rail.tile[1] / 2;

/** Phases within one step (fractions of it). */
export const PHASE = { sweep: 0.5, run: 0.7 };

interface Built {
  tiles: BlockPart[];
  feeds: TubePart[];
  bands: BlockPart[];
  card: BlockPart;
  counter: BlockPart;
  counterSlot: BarSlot;
  slots: { feeds: number; bands: number; counter: number };
}

const built = new WeakMap<SceneDesc, Built>();

/** The rail, the machine and its bands, and the feed pipes: parts chapters 9 and 10 share. */
export function buildLine(first: number) {
  let slot = first;
  const plainSlot = slot++;
  const { rail, machine } = LINE;
  const [mx, my, mz] = machine.center;
  const [mw, mh, md] = machine.size;
  const parts: Part[] = [
    box(
      "rail",
      plainSlot,
      "housing",
      [0, rail.y, rail.z],
      [RAIL_SLOTS * rail.pitch + 0.3, 0.2, 0.26],
    ),
    box("machine", plainSlot, "housing", machine.center, machine.size),
    box("machine.post.0", plainSlot, "metal", [mx - mw / 2 - 0.05, my / 2, mz], [0.08, my, 0.08]),
    box("machine.post.1", plainSlot, "metal", [mx + mw / 2 + 0.05, my / 2, mz], [0.08, my, 0.08]),
  ];
  const bandsSlot = slot;
  const bands = Array.from({ length: LAYERS }, (_, l) =>
    box(
      `machine.band.${l}`,
      bandsSlot + l,
      "bar",
      [mx, my - mh / 2 + ((l + 0.5) * mh) / LAYERS, mz + md / 2 + 0.01],
      [mw * 0.8, 0.12, 0.02],
    ),
  );
  slot += LAYERS;
  const tiles = Array.from({ length: RAIL_SLOTS }, (_, i) =>
    box(`word.${i}`, plainSlot, "card", [slotX(i), tileY, rail.z], rail.tile),
  );
  const feedsSlot = slot;
  const feeds = Array.from({ length: RAIL_SLOTS }, (_, i) => {
    const part = segment(`feed.${i}`, feedsSlot + i, "bar");
    placeFeed(part.transform, i, 1, 0.012);
    return part;
  });
  slot += RAIL_SLOTS;
  parts.push(...bands, ...tiles, ...feeds);
  return { parts, tiles, feeds, bands, slots: { feeds: feedsSlot, bands: bandsSlot }, next: slot };
}

/** Feed pipe i: from word i's tile up into the machine's underside, `reach` of the way. */
export function placeFeed(transform: number[], i: number, reach: number, radius: number) {
  const { machine, rail } = LINE;
  const from: Vec3 = [slotX(i), tileY + rail.tile[1] / 2, rail.z];
  const under: Vec3 = [
    machine.center[0] + (slotX(i) / (RAIL_SLOTS * rail.pitch)) * machine.size[0] * 0.9,
    machine.center[1] - machine.size[1] / 2,
    machine.center[2] + machine.size[2] / 2 - 0.1,
  ];
  const to: Vec3 = [
    from[0] + (under[0] - from[0]) * reach,
    from[1] + (under[1] - from[1]) * reach,
    from[2] + (under[2] - from[2]) * reach,
  ];
  placeSegment(transform, from, to, reach > 1e-3 ? radius : 1e-4);
}

/** Tile i shown or hidden (hidden tiles shrink to nothing), at its slot or at `at`. */
/** How far the new word's card has flown at step phase `live`: -1 before it appears. */
export function cardFlight(live: number): number {
  return live >= PHASE.run ? (live - PHASE.run) / (1 - PHASE.run) : live >= PHASE.sweep ? 0 : -1;
}

/**
 * The new word's card: it appears above the machine and arcs to `to` on the rail as `flying`
 * goes 0 → 1; below 0 it is hidden.
 */
export function placeCard(card: BlockPart, flying: number, to?: Vec3) {
  const t = card.transform;
  if (flying < 0 || !to) {
    t[0] = 1e-4;
    t[5] = 1e-4;
    return;
  }
  const k = smoothstep(flying);
  t[0] = 0.5;
  t[5] = 0.2;
  t[12] = LINE.birth[0] + (to[0] - LINE.birth[0]) * k;
  t[13] = LINE.birth[1] + (to[1] - LINE.birth[1]) * k + Math.sin(Math.PI * k) * 0.5;
  t[14] = LINE.birth[2] + (to[2] - LINE.birth[2]) * k;
}

export function placeTile(tile: BlockPart, i: number, shown: number, at?: Vec3) {
  const s = shown > 0 ? 1 : 1e-4;
  tile.transform[0] = LINE.rail.tile[0] * s;
  tile.transform[5] = LINE.rail.tile[1] * s;
  tile.transform[10] = LINE.rail.tile[2] * s;
  tile.transform[12] = at ? at[0] : slotX(i);
  tile.transform[13] = at ? at[1] : tileY;
  tile.transform[14] = at ? at[2] : LINE.rail.z;
}

export const generation: SceneBuilder = {
  assets: {},
  // A word per rail slot, the new word's card, the counter, and the failure note.
  tagCount: RAIL_SLOTS + 3,

  create(assets, revision) {
    const line = buildLine(0);
    let slot = line.next;
    const card = box("card", slot++, "card", LINE.birth, [0.5, 0.2, 0.06]);
    const counterSlot: BarSlot = {
      x: LINE.counter.x,
      z: LINE.counter.z,
      floor: LINE.counter.floor,
      width: LINE.counter.width,
      depth: LINE.counter.width,
      maxHeight: LINE.counter.max,
    };
    const counterBar = slot++;
    const counter = KIT.bars.build({
      id: "counter",
      slot: counterBar,
      material: "bar",
      slots: [counterSlot],
    }).parts[0] as BlockPart;
    const track = box(
      "counter.track",
      0,
      "glass",
      [LINE.counter.x, LINE.counter.floor + LINE.counter.max / 2, LINE.counter.z],
      [LINE.counter.width + 0.08, LINE.counter.max, LINE.counter.width + 0.08],
    );
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: slot++,
      bounds: [-3.1, 0, -1.3, 3.9, 2.3, 1.1],
      softness: 0.35,
    });
    const parts: Part[] = [...shadow.parts, ...line.parts, card, counter, track];
    const anchors: SceneAnchor[] = [
      { id: "machine", part: "machine", local: [-0.35, 0.5, 0.5], priority: 2 },
      { id: "rail", part: "rail", local: [-0.4, -0.5, 0.5], priority: 2 },
      { id: "counter", part: "counter.track", local: [0.5, 0.3, 0.5], priority: 3 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    const b: Built = {
      tiles: line.tiles,
      feeds: line.feeds,
      bands: line.bands,
      card,
      counter,
      counterSlot,
      slots: { feeds: line.slots.feeds, bands: line.slots.bands, counter: counterBar },
    };
    built.set(scene, b);
    pose(
      b,
      { step: GENERATION_STEPS, failure: 0, fade: 1, words: GENERATION_STEPS },
      null,
      null,
      null,
    );
    const tags: SceneTags = {
      anchors: [
        ...Array.from({ length: RAIL_SLOTS }, (_, i) => ({
          id: `word.${i}`,
          part: `word.${i}`,
          local: [0, 0, 0.5] as Vec3,
          priority: 0,
        })),
        { id: "card", part: "card", local: [0, 0, 0.5], priority: 0 },
        { id: "counter", part: "counter.track", local: [0, 0.5, 0.5], priority: 0 },
        { id: "note", part: "machine", local: [0, 0.5, 0.5], priority: 0 },
      ],
      text: Array.from({ length: RAIL_SLOTS + 3 }, () => ""),
      // Words are written on their tiles, in dark ink.
      style: [...Array.from({ length: RAIL_SLOTS + 1 }, () => "onPart" as const), "above", "above"],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const typed = ui.text !== null;
    const state: Pose = typed
      ? { step: GENERATION_STEPS, failure: 0, fade: 1, words: ui.slider }
      : {
          step: tl.channels.step ?? GENERATION_STEPS,
          failure: tl.channels.failure ?? 0,
          fade: tl.channels.fade ?? 1,
          words: ui.slider,
        };
    const data = run?.kind === "generation" ? run : null;
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
  step: number;
  failure: number;
  fade: number;
  /** How many of the run's words the loop writes (the slider). */
  words: number;
}

/** Tokens fed through the model by the steps done so far, plus the part of the live one. */
export function workSoFar(steps: { fed: number }[], step: number): number {
  const done = Math.floor(step);
  let work = 0;
  for (let k = 0; k < Math.min(done, steps.length); k++) work += steps[k]!.fed;
  const live = steps[done];
  if (live) work += Math.round(live.fed * Math.min(1, (step - done) / PHASE.sweep));
  return work;
}

function pose(
  b: Built,
  state: Pose,
  data: GenerationRun | null,
  intensity: Float32Array | null,
  text: string[] | null,
): void {
  const prompt = data?.tokens.length ?? 10;
  const steps = data?.steps ?? [];
  const total = Math.min(steps.length, GENERATION_STEPS, state.words);
  const done = Math.min(Math.floor(state.step), total);
  const phase = state.step - Math.floor(state.step);
  const live = done < total ? phase : 0;
  const reading = done < total ? prompt + done : prompt + total;

  // The rail: the prompt, then each written word once it has landed.
  for (let i = 0; i < RAIL_SLOTS; i++) {
    const written = i >= prompt;
    const shown = i < prompt + done && (!written || state.fade > 0.02) ? 1 : 0;
    placeTile(b.tiles[i]!, i, shown);
  }
  // The live step: the sweep rereads every word so far, then the bands run.
  const sweep = Math.min(1, live / PHASE.sweep);
  for (let i = 0; i < RAIL_SLOTS; i++) {
    const inText = i < reading;
    const lit = inText && live > 0 && sweep * reading > i ? 1 : 0;
    placeFeed(b.feeds[i]!.transform, i, inText ? 1 : 0, 0.012);
    if (intensity)
      intensity[b.slots.feeds + i] = inText ? 0.15 + 1.1 * lit * (live < PHASE.run ? 1 : 0.4) : 0;
  }
  const running =
    live >= PHASE.sweep && live < PHASE.run ? (live - PHASE.sweep) / (PHASE.run - PHASE.sweep) : 0;
  if (intensity)
    for (let l = 0; l < LAYERS; l++)
      intensity[b.slots.bands + l] =
        0.5 + (running * LAYERS > l ? 1.1 : 0) + (live >= PHASE.run ? 0.4 : 0);

  // The new word: appears above the machine, then flies to the rail's next slot.
  const flying = cardFlight(live);
  if (flying >= 0 && done < total)
    placeCard(b.card, flying, [slotX(prompt + done), tileY + 0.06, LINE.rail.z]);
  else placeCard(b.card, -1);

  // The work counter: tokens fed so far, against the whole loop's.
  const totalWork = steps.slice(0, total).reduce((sum, s) => sum + s.fed, 0) || 1;
  const work = workSoFar(steps, Math.min(state.step, total)) * state.fade;
  placeBar(b.counter.transform, b.counterSlot, (work / totalWork) * LINE.counter.max);
  if (intensity) intensity[b.slots.counter] = 0.9 + 0.6 * state.failure;

  if (!text) return;
  for (let i = 0; i < RAIL_SLOTS; i++) {
    const shown = b.tiles[i]!.transform[0]! > 0.01;
    const word = i < prompt ? data?.tokens[i] : steps[i - prompt]?.word;
    text[i] = shown && word ? tokenLabel(word) : "";
  }
  const card = flying >= 0 && done < total ? steps[done]!.word.trim() : "";
  text[RAIL_SLOTS] = card;
  // The live step's own cost beside the total: it is one more token every time.
  const cost = done < total && live > 0 ? steps[done]!.fed : 0;
  text[RAIL_SLOTS + 1] = data
    ? `tokens read: ${Math.round(work).toLocaleString("en-US")}${cost ? `\n(+${cost} for this word)` : ""}`
    : "";
  const sums = steps.slice(0, total).map((s) => s.fed);
  text[RAIL_SLOTS + 2] =
    data && state.failure > 0.5
      ? `every word rereads everything:\n${sums.join(" + ")} = ${sums.reduce((a, c) => a + c, 0)}`
      : "";
}
