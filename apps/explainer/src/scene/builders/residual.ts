/**
 * Chapter 7's scene: four stations in a row. Without the river, the word's signal passes
 * from station to station through pipes, each station's output replacing it, and it fades to
 * nothing. With the river, a translucent channel (the kit's `river`) runs under the row, each
 * station pours what it computed into it, and a volume knob on each station (`volumeKnob`,
 * RMSNorm) turns the station's input back down as the river grows. Light currents (the kit's
 * `flows`) run down each stretch of water that is there, so it reads as a stream moving
 * toward the readout, not a still glass duct.
 *
 * Every size is the run's (`runtime/runs/residual.ts`), from each model's trace at the last
 * token: pipe and river sizes are the stream's RMS as a share of the embedding's (square-root
 * scaled, so a 30× river still fits), chute widths what each station added, knob angles the
 * stream size each station's RMSNorm divides by (log scaled), and the readout the model's
 * real best next word.
 *
 * Loop channels read: `flowA` (0 → 1 the signal travels the no-river row), `river` (0 → 1 the
 * river and knobs come in, the pipes go), `flowB` (0 → 1 the river fills station by station)
 * and `failure` (0 → 1 the readout says how unsure one pass still is). Typed text shows the
 * river version, filled.
 */
import { clamp } from "math";
import {
  KIT,
  placeKnob,
  placePour,
  placeSegment,
  placeStretch,
  stretchSpan,
  text,
  type BlockPart,
  type Part,
  type RiverParams,
  type SceneAnchor,
  type SceneDesc,
  type SceneText,
  type TubePart,
  type VolumeKnobParams,
} from "@repo/renderer";
import type { ModelId } from "@repo/llm";
import type { Vec3 } from "math";
import { look } from "../../look/look.ts";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";
import { share } from "../../chapters/format.ts";
import { box, segment } from "./parts.ts";

/** One model's pass over the text (`runtime/runs/residual.ts`). */
export interface ResidualPass {
  model: ModelId;
  /** The stream's RMS at the last token entering each layer, then leaving the last. */
  stream: number[];
  /** The RMS of what each layer computed (its attention and MLP outputs together). */
  adds: number[];
  /** The best next word and its probability, out of `vocab`. */
  answer: string;
  p: number;
  vocab: number;
}

/** Chapter 7's run: the same text without the river and with it. */
export interface ResidualRun {
  kind: "residual";
  prompt: string;
  without: ResidualPass;
  with: ResidualPass;
}

const STATIONS = [-1.8, -0.6, 0.6, 1.8];
const STATION = { y: 1.35, size: [0.62, 0.7, 0.46] as Vec3, post: 0.08, postZ: -0.3 };
/**
 * The pipes of the no-river row: at mid-station height, from the entry to the readout. A pipe
 * the signal has died in still shows, dark, at `empty`.
 */
const PIPE = { entry: -3.0, exit: 2.35, radius: 0.045, max: 0.09, empty: 0.018 };
const READOUT = { x: 2.35, size: [1.15, 0.42, 0.06] as Vec3 };
const RIVER: RiverParams = {
  id: "river",
  slot: 0,
  stations: STATIONS,
  y: 0.45,
  z: 0.02,
  run: 0.75,
  width: 0.42,
  pourFrom: STATION.y - STATION.size[1] / 2,
  maxHeight: 0.62,
  materials: { water: "river", pour: "bar" },
};
/** River height at the embedding's size; it grows with √(stream ÷ embedding). */
const RIVER_BASE = 0.07;
/** Chute radius per √(station output ÷ embedding). */
const POUR = { base: 0.012, max: 0.05 };
/**
 * The currents in each stretch: lanes as (height, depth) shares of the stretch's box, so they
 * scale with the water. Each has its own pulse lag (in pulse spacings) and `pace`, which
 * divides its pulse spacing and speed together (the top, pace < 1, runs faster than the
 * bottom), so the light never marches in step or lines up into a grid.
 */
const CURRENTS: { at: [number, number]; lag: number; pace: number }[] = [
  { at: [0.3, -0.25], lag: 0, pace: 0.75 },
  { at: [0.05, 0.2], lag: 0.43, pace: 1 },
  { at: [-0.25, -0.05], lag: 0.71, pace: 1.35 },
];
const CURRENT = { radius: 0.06, glow: 1.1 };
/** Knob angle: pointing right at the first station's input, turning down with its log size. */
const KNOB = { radius: 0.14, start: 1.1, turn: 1.8 };

/**
 * Font sizes (em), metres: the best guess printed on the readout card, and the notes standing
 * in the air over the row (the prompt over the first station, the knob's numbers over the
 * noted station, clear of its pour, the river's size past its end), facing the eye.
 */
const TEXT = { readout: 0.13, note: 0.12 };

interface Built {
  pipes: TubePart[];
  stretches: BlockPart[];
  pours: TubePart[];
  /** Per stretch, its current lanes (sleeves drawn only where a flow pulse is). */
  currents: TubePart[][];
  dials: TubePart[];
  pointers: BlockPart[];
  knobs: VolumeKnobParams[];
  slots: { pipes: number; river: number; pointers: number[]; currents: number };
  /** The prompt, the readout, the note at the row's end, and one per station. */
  text: SceneText[];
}

const built = new WeakMap<SceneDesc, Built>();

/** Pipe i's ends along X: into the first station, between each pair, out to the readout. */
function pipeSpan(i: number): [number, number] {
  const half = STATION.size[0] / 2;
  const left = i === 0 ? PIPE.entry : STATIONS[i - 1]! + half;
  const right = i === STATIONS.length ? PIPE.exit : STATIONS[i]! - half;
  return [left, right];
}

export const residual: SceneBuilder = {
  assets: {},

  create(assets, revision) {
    let slot = 0;
    const housingSlot = slot++;
    const stations = STATIONS.flatMap((x, k) => [
      box(`station.${k}`, housingSlot, "housing", [x, STATION.y, 0], STATION.size),
      box(
        `station.${k}.post`,
        housingSlot,
        "housing",
        [x, (STATION.y - STATION.size[1] / 2) / 2, STATION.postZ],
        [STATION.post, STATION.y - STATION.size[1] / 2, STATION.post],
      ),
    ]);
    const pipesSlot = slot;
    const pipes = Array.from({ length: STATIONS.length + 1 }, (_, i) => {
      const part = segment(i === 0 ? "pipe" : `pipe.${i}`, slot++, "bar");
      return part;
    });
    const riverSlot = slot;
    const river = KIT.river.build({ ...RIVER, slot: riverSlot });
    slot += 2 * STATIONS.length + 1;
    const knobs: VolumeKnobParams[] = STATIONS.map((x, k) => ({
      id: `knob.${k}`,
      slot: 0,
      center: [x - 0.14, STATION.y + 0.12, STATION.size[2] / 2],
      radius: KNOB.radius,
      materials: { dial: "metal", pointer: "bar" },
    }));
    const pointerSlots: number[] = [];
    const knobParts = knobs.flatMap((knob) => {
      knob.slot = slot;
      pointerSlots.push(slot + 1);
      slot += 2;
      return KIT.volumeKnob.build(knob).parts;
    });
    // Currents: metres along the stretch (× the lane's pace, so a lane's pulses keep one
    // spacing in every stretch), and shares of its height and depth; `pose` scales them.
    const currentsSlot = slot;
    const currents = KIT.flows.build({
      id: "current",
      slot: currentsSlot,
      material: "current",
      radius: CURRENT.radius,
      paths: STATIONS.concat(0).flatMap((_, i) => {
        const [left, right] = stretchSpan(RIVER, i);
        return CURRENTS.map(({ at: [h, d], pace }): Vec3[] => [
          [((left - right) / 2) * pace, h, d],
          [((right - left) / 2) * pace, h, d],
        ]);
      }),
    }).parts as TubePart[];
    slot += currents.length;
    const card = box(
      "readout",
      slot++,
      "card",
      [READOUT.x + READOUT.size[0] / 2, STATION.y, 0],
      READOUT.size,
    );
    // Soft contact shadows ground the row of stations and the readout.
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: slot++,
      bounds: [STATIONS[0]! - 0.5, 0, -0.45, READOUT.x + READOUT.size[0], 1, 0.45],
      softness: 0.3,
    });
    const parts: Part[] = [
      ...shadow.parts,
      ...stations,
      ...pipes,
      ...river.parts,
      ...currents,
      ...knobParts,
      card,
    ];
    const anchors: SceneAnchor[] = [
      { id: "stations", part: "station.1", local: [0, 0.5, 0.5], priority: 2 },
      { id: "river", part: "river.stretch.2", local: [0, -0.5, 0.5], priority: 3 },
      // The top of the third knob's rim (the dial is a unit segment along +Z: local −Z is up).
      { id: "knob", part: "knob.2.dial", local: [0, 1, -1], priority: 2 },
      { id: "readout", part: "readout", local: [0.5, 0.5, 0.5], priority: 1 },
    ];
    // The best guess is printed on the readout card. The prompt, each station's knob numbers
    // and the river's size at its end have no face of their own to go on (the stations are
    // too small to hold them legibly): they stand over and under the row, facing the eye.
    const note = (id: string, part: string, local: Vec3, align: [number, number]) =>
      text({ id, part, local, face: "camera", size: TEXT.note, style: "chalk", align });
    const texts: SceneText[] = [
      note("prompt", "station.0", [-0.5, 0.5, 0.5], [0, 1.4]),
      text({
        id: "readout",
        part: "readout",
        local: [0, 0, 0.5],
        size: TEXT.readout,
        style: "ink",
        maxWidth: READOUT.size[0] - 0.1,
      }),
      note("end", "river.stretch.4", [0.35, -0.9, 0.5], [0.5, 0]),
      ...STATIONS.map((_, k) => note(`station.${k}`, `station.${k}`, [0, 0.5, 0.5], [0.5, 1.25])),
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets, text: texts };
    const b: Built = {
      pipes,
      stretches: river.parts.filter((p) => p.id.startsWith("river.stretch.")) as BlockPart[],
      pours: river.parts.filter((p) => p.id.startsWith("river.pour.")) as TubePart[],
      currents: STATIONS.concat(0).map((_, i) =>
        currents.slice(i * CURRENTS.length, (i + 1) * CURRENTS.length),
      ),
      dials: knobParts.filter((p) => p.id.endsWith(".dial")) as TubePart[],
      pointers: knobParts.filter((p) => p.id.endsWith(".pointer")) as BlockPart[],
      knobs,
      slots: { pipes: pipesSlot, river: riverSlot, pointers: pointerSlots, currents: currentsSlot },
      text: texts,
    };
    built.set(scene, b);
    // Built with the river full, so label occluders match the hero.
    pose(b, BUILT_POSE, null, null, null);
    return scene;
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const typed = ui.text !== null;
    const ch = (id: string, loop: number, still: number) =>
      typed ? still : (tl.channels[id] ?? loop);
    const state: Pose = {
      flowA: ch("flowA", 1, 1),
      river: ch("river", 1, 1),
      flowB: ch("flowB", 1, 1),
      failure: ch("failure", 0, 0),
    };
    const b = built.get(frame.input.scene)!;
    const data = run?.kind === "residual" ? run : null;
    const { dynamics } = frame.input;
    pose(b, state, data, dynamics.intensity, b.text);
    // The currents run on the ambient clock (they keep flowing while the lesson holds its
    // end), each lane a little behind the one before.
    const phase = frame.ambientSec * look.flow.cyclesPerSec;
    for (let k = 0; k < (STATIONS.length + 1) * CURRENTS.length; k++)
      dynamics.flowPhase[b.slots.currents + k] = phase + CURRENTS[k % CURRENTS.length]!.lag;
  },
};

/** The loop's state as the scene reads it (see the channel list at the top). */
interface Pose {
  flowA: number;
  river: number;
  flowB: number;
  failure: number;
}

const BUILT_POSE: Pose = { flowA: 1, river: 1, flowB: 1, failure: 0 };
/** The station (1-based) whose river and knob numbers are written beside it. */
const NOTED_STATION = 3;

/** River height for a stream `ratio` times the embedding's size. */
export function riverHeight(ratio: number): number {
  return Math.min(RIVER.maxHeight, RIVER_BASE * Math.sqrt(ratio));
}

/** Knob angle for a station whose input is `ratio` times the first station's. */
export function knobAngle(ratio: number): number {
  return KNOB.start - KNOB.turn * Math.log10(Math.max(ratio, 1e-6));
}

function pose(
  b: Built,
  state: Pose,
  data: ResidualRun | null,
  intensity: Float32Array | null,
  texts: SceneText[] | null,
): void {
  const { river, failure } = state;
  const y = STATION.y;
  const n = STATIONS.length;

  // Without the river: each pipe carries the stream entering the next station (or leaving
  // the last), and fills in as the signal reaches it. The pipes give way to the river.
  const without = data?.without;
  for (let i = 0; i <= n; i++) {
    const [left, right] = pipeSpan(i);
    const reached = clamp(state.flowA * (n + 1) - i, 0, 1);
    const ratio = without ? without.stream[i]! / without.stream[0]! : 1;
    const radius =
      Math.max(PIPE.empty, Math.min(PIPE.max, PIPE.radius * Math.sqrt(ratio))) * (1 - river);
    placeSegment(
      b.pipes[i]!.transform,
      [left, y, 0],
      [left + (right - left) * Math.max(reached, 1e-3), y, 0],
      reached > 0 && radius > 1e-3 ? radius : 1e-4,
    );
    if (intensity) intensity[b.slots.pipes + i] = 1.2 * Math.sqrt(Math.min(ratio, 1));
  }

  // With the river: stretch i carries the stream entering station i (or leaving the last);
  // station k's chute pours what it computed; its knob divides its input back down.
  const withRiver = data?.with;
  const embed = withRiver?.stream[0] ?? 1;
  for (let i = 0; i <= n; i++) {
    const filled = clamp(state.flowB * (n + 1) - i, 0, 1);
    const ratio = withRiver ? withRiver.stream[i]! / embed : 1;
    const water = river * filled;
    placeStretch(b.stretches[i]!.transform, RIVER, i, riverHeight(ratio) * water);
    if (intensity) intensity[b.slots.river + i] = 0.2 + 0.15 * filled;
    b.currents[i]!.forEach((current, lane) => {
      // The stretch's own transform, but along x undoing the lane's pace (its path is in
      // metres × pace there).
      const stretch = b.stretches[i]!.transform;
      for (let j = 0; j < 16; j++) current.transform[j] = stretch[j]!;
      current.transform[0] = 1 / CURRENTS[lane]!.pace;
      if (intensity)
        intensity[b.slots.currents + i * CURRENTS.length + lane] = CURRENT.glow * water;
    });
  }
  for (let k = 0; k < n; k++) {
    const reached = clamp(state.flowB * (n + 1) - k - 0.5, 0, 1);
    const add = withRiver ? withRiver.adds[k]! / embed : 1;
    const top =
      RIVER.y + (riverHeight(withRiver ? withRiver.stream[k + 1]! / embed : 1) / 2) * river;
    placePour(
      b.pours[k]!.transform,
      RIVER,
      k,
      reached > 0 && river > 0.05 ? Math.min(POUR.max, POUR.base * Math.sqrt(add)) : 1e-4,
      RIVER.pourFrom - (RIVER.pourFrom - top) * reached,
    );
    if (intensity) intensity[b.slots.river + n + 1 + k] = 1.1 * reached;

    // The knob comes out of the station with the river; it turns as the river reaches it.
    const knob = b.knobs[k]!;
    const ratio = withRiver ? withRiver.stream[k]! / withRiver.stream[0]! : 1;
    const angle = KNOB.start + (knobAngle(ratio) - KNOB.start) * reached;
    const sunk = (1 - river) * 0.08;
    const [cx, cy, cz] = knob.center;
    placeSegment(
      b.dials[k]!.transform,
      [cx, cy, cz - sunk],
      [cx, cy, cz + 0.05 - sunk],
      KNOB.radius,
    );
    placeKnob(b.pointers[k]!.transform, knob, angle);
    b.pointers[k]!.transform[14]! -= sunk;
    if (intensity) intensity[b.slots.pointers[k]!] = 0.8 * river;
  }

  if (!texts) return;
  const shown = river < 0.5 ? without : withRiver;
  const settled = river < 0.5 ? state.flowA > 0.99 : state.flowB > 0.99;
  texts[0]!.text = data ? `“${data.prompt}”` : "";
  // The readout answers only once the signal has made it through every station.
  texts[1]!.text = shown ? (settled ? guess(shown, failure) : "reading…") : "";
  const end = shown ? shown.stream.at(-1)! / shown.stream[0]! : 0;
  texts[2]!.text =
    shown && settled
      ? river < 0.5
        ? `signal left: ${end === 0 ? "0%" : share(end)}`
        : `this text: river ${end.toPrecision(2)}× its start`
      : "";
  // The noted station: how big the river is on its way in, and what the knob makes of it.
  for (let k = 0; k < n; k++) {
    const reached = clamp(state.flowB * (n + 1) - k - 0.5, 0, 1);
    const ratio = withRiver ? withRiver.stream[k]! / withRiver.stream[0]! : 0;
    texts[3 + k]!.text =
      withRiver && k + 1 === NOTED_STATION && river > 0.5 && reached >= 1
        ? `in: river ${ratio.toPrecision(2)}×\nknob sets it to 1×`
        : "";
  }
}

/** The readout: the best guess, or "no idea" when the model is spread evenly over every word. */
function guess(pass: ResidualPass, failure: number): string {
  if (pass.p * pass.vocab < 1.5) return `no idea:\n1 in ${pass.vocab.toLocaleString("en-US")} each`;
  const word = `“${pass.answer.trim()}” ${share(pass.p)}`;
  return failure > 0.5 ? `${word}\nshaky guess` : `best guess\n${word}`;
}
