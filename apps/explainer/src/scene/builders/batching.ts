/**
 * Chapter 11's scene, built from the kit (`mesh`, `block`, `contactShadow`): the double-decker
 * bus prop split into its nodes, one glowing cube per rider on its 16 seats, the weight crates
 * on its roof rack, a contact shadow under it, and a bus stop where riders past the bus's
 * capacity wait.
 *
 * Occupancy is honest arithmetic: the bus holds `computeBoundBatch` riders (the batch where a
 * decode step's sums take as long as its haul of bytes). Every rider is one cube; a seat
 * fills before the next, so the bus visibly fills; riders past the capacity queue at the stop.
 * In the prefill beat the same places hold one prompt's tokens. Every number in a tag comes
 * from `evalArith` with the chapter's `BUS_ARITH` inputs.
 *
 * Loop channels read: `batch` (riders the loop puts on the bus; the slider replaces it once the
 * reader moves it), `crates` (0 lifted clear → 1 on the rack), `prefill` (1 while one prompt's
 * tokens fill the seats), `heavy` (the crates' glow).
 */
import { clamp } from "math";
import {
  KIT,
  type BlockPart,
  type MeshAsset,
  type SceneAnchor,
  type SceneDesc,
} from "@repo/renderer";
import { evalArith } from "@repo/llm";
import type { Vec3 } from "math";
import { BUS_ARITH, PREFILL_TOKENS } from "../../chapters/data/batching.ts";
import { formatStat } from "../../chapters/format.ts";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";

export const SEATS = 16;
const QUEUE = 10;
/** Rider places per seat or queue spot: a grid `COLS` wide and `ROWS` high. */
const COLS = 3;
const ROWS = 7;
export const PER_SPOT = COLS * ROWS;
const CRATES = 5;
/** The seat node's cushion depth (the prop's `CUSHION`): riders sit on top of it. */
const CUSHION = 0.06;
/** A rider cube's edge and the pitch of the grid it sits in, metres. */
const CUBE = 0.048;
const PITCH = { x: 0.068, y: 0.062 };
/** The queue at the stop: two rows beside the bus's rear, metres. */
const STOP = { x: -2.45, pitch: 0.27, rows: [0.2, 0.62] as const, post: [-2.2, 0.98] as const };
/** How high the crates hang above the rack before they load. */
const CRATE_LIFT = 1.2;
const CRATE_GLOW = 0.1;
/** Where a hidden cube waits: under the floor. */
const HIDDEN_Y = -5;

const EXPLODE: Record<string, Vec3> = {
  "bus.body": [0, 0, -0.45],
  "bus.frame": [0, 0, 0.5],
  "bus.glass": [0, 0, 0.7],
  "bus.trim": [0, 0, 0.35],
  "bus.wheels": [0, -0.15, 0],
  "bus.hubs": [0, -0.15, 0],
  "bus.rack": [0, 0.35, 0],
  "bus.seat": [0, 0, 0.15],
};
const RIDERS_EXPLODE: Vec3 = [0, 0, 0.15];
const CRATES_EXPLODE: Vec3 = [0, 0.7, 0];
const STOP_EXPLODE: Vec3 = [-0.4, 0, 0.3];

/** The capacity the bus is built for: arithmetic, never a typed number. */
export function busCapacity(): number {
  return evalArith("computeBoundBatch", BUS_ARITH);
}

/** How many riders ride and how many wait, for `riders` on a bus that holds `capacity`. */
export function occupancy(riders: number, capacity: number): { seated: number; waiting: number } {
  const seated = Math.min(riders, Math.floor(capacity));
  return { seated, waiting: Math.min(riders - seated, QUEUE * PER_SPOT) };
}

/** The numbers the scene writes for `riders` on the bus, all from the arithmetic registry. */
function busReadout(riders: number) {
  const args = { batch: Math.max(1, riders), ...BUS_ARITH };
  return {
    tripSec: evalArith("decodeStepSeconds", args),
    totalTokPerSec: evalArith("batchThroughput", args),
    weightBytes: evalArith("weightBytes", { weightBytes: BUS_ARITH.weightBytes }),
    prefillSec: evalArith("prefillSeconds", {
      tokens: PREFILL_TOKENS,
      weightBytes: BUS_ARITH.weightBytes,
      kvBytes: BUS_ARITH.kvBytes,
    }),
  };
}

function nodeBounds(asset: MeshAsset, name: string): readonly number[] {
  const node = asset.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`batching: the bus has no node "${name}"`);
  return node.bounds;
}

/** Where a grid of rider places stands: its first place's centre, bottom row. */
interface Spot {
  x: number;
  y: number;
  z: number;
}

/**
 * The `n`-th place over `spots`: each spot's grid fills, bottom row first, before the next,
 * so a lone rider sits alone and the fill reads seat by seat.
 */
function place(spots: Spot[], n: number): Vec3 {
  const spot = spots[Math.floor(n / PER_SPOT)]!;
  const k = n % PER_SPOT;
  return [
    spot.x + ((k % COLS) - (COLS - 1) / 2) * PITCH.x,
    spot.y + CUBE / 2 + Math.floor(k / COLS) * PITCH.y,
    spot.z,
  ];
}

interface Layout {
  seats: Spot[];
  queue: Spot[];
  crates: { center: Vec3; size: Vec3 }[];
}

function layoutOf(bus: MeshAsset): Layout {
  const seats = Array.from({ length: SEATS }, (_, i) => {
    const b = nodeBounds(bus, `bus.seat.${i}`);
    // The window side is +Z; riders sit forward of the backrest, which stands at min Z.
    return { x: (b[0]! + b[3]!) / 2, y: b[1]! + CUSHION, z: (b[2]! + 0.06 + b[5]!) / 2 };
  });
  const queue = Array.from({ length: QUEUE }, (_, i) => ({
    x: STOP.x - Math.floor(i / 2) * STOP.pitch,
    y: 0,
    z: STOP.rows[1 - (i % 2)]!,
  }));
  const rack = nodeBounds(bus, "bus.rack");
  const pitch = (rack[3]! - rack[0]!) / CRATES;
  const size: Vec3 = [pitch * 0.82, 0.3, (rack[5]! - rack[2]!) * 0.9];
  const crates = Array.from({ length: CRATES }, (_, i) => ({
    center: [
      rack[0]! + (i + 0.5) * pitch,
      rack[4]! + size[1] / 2,
      (rack[2]! + rack[5]!) / 2,
    ] as Vec3,
    size,
  }));
  return { seats, queue, crates };
}

const built = new WeakMap<
  SceneDesc,
  {
    layout: Layout;
    riders: BlockPart[];
    tokens: BlockPart[];
    queue: BlockPart[];
    crates: BlockPart[];
  }
>();

/** Tag indices. */
const TAG = { trip: 0, crates: 1, stop: 2 } as const;

/** Dynamics slots: the bus's nodes share 0; riders, tokens and the queue one each. */
const SLOT = { riders: 1, tokens: 2, queue: 3, crates: 4, stop: 4 + CRATES } as const;

/** `count` cubes named `<id>.<n>`, all in one dynamics slot, built hidden. */
function cubes(
  id: string,
  count: number,
  slot: number,
  material: string,
  explode: Vec3,
): BlockPart[] {
  return Array.from(
    { length: count },
    (_, n) =>
      KIT.block.build({
        id: `${id}.${n}`,
        slot,
        material,
        center: [0, HIDDEN_Y, 0],
        size: [CUBE, CUBE, CUBE],
        explode,
      }).parts[0] as BlockPart,
  );
}

/** Shows the first `shown` cubes at their places over `spots` and hides the rest. */
function seatCubes(parts: BlockPart[], spots: Spot[], shown: number): void {
  for (let n = 0; n < parts.length; n++) {
    const t = parts[n]!.transform;
    if (n < shown) {
      const [x, y, z] = place(spots, n);
      t[12] = x;
      t[13] = y;
      t[14] = z;
    } else t[13] = HIDDEN_Y;
  }
}

export const batching: SceneBuilder = {
  assets: { bus: "/props/bus.glb" },
  tagCount: 3,

  create(assets, revision) {
    const bus = assets.bus;
    if (!bus) throw new Error("batching: the bus prop is not loaded");
    const layout = layoutOf(bus);
    const busKit = KIT.mesh.build({
      id: "bus",
      slot: 0,
      assetId: "bus",
      asset: bus,
      split: true,
      nodeExplode: EXPLODE,
      clip: ["bus.body", "bus.frame", "bus.glass", "bus.trim"],
    });
    const riders = cubes("rider", SEATS * PER_SPOT, SLOT.riders, "bar", RIDERS_EXPLODE);
    const tokens = cubes("token", PREFILL_TOKENS, SLOT.tokens, "prompt", RIDERS_EXPLODE);
    const queue = cubes("waiting", QUEUE * PER_SPOT, SLOT.queue, "bar", STOP_EXPLODE);
    const crates = layout.crates.map((c, i) =>
      KIT.block.build({
        id: `crate.${i}`,
        slot: SLOT.crates + i,
        material: "crate",
        center: c.center,
        size: c.size,
        explode: CRATES_EXPLODE,
      }),
    );
    const [px, pz] = STOP.post;
    const post = KIT.block.build({
      id: "stop.post",
      slot: SLOT.stop,
      material: "metal",
      center: [px, 1, pz],
      size: [0.06, 2, 0.06],
      explode: STOP_EXPLODE,
    });
    const sign = KIT.block.build({
      id: "stop.sign",
      slot: SLOT.stop + 1,
      material: "card",
      center: [px, 1.85, pz],
      size: [0.36, 0.26, 0.03],
      explode: STOP_EXPLODE,
    });
    // The bus's wheels stand on the floor; the shadow grounds it (the last slot).
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: SLOT.stop + 2,
      bounds: busKit.bounds,
      softness: 0.25,
    });
    const parts = [
      ...shadow.parts,
      ...busKit.parts,
      ...riders,
      ...tokens,
      ...queue,
      ...crates.flatMap((c) => c.parts),
      ...post.parts,
      ...sign.parts,
    ];
    const body = nodeBounds(bus, "bus.body");
    const seat = nodeBounds(bus, "bus.seat.10");
    // The mesh parts keep the prop's own space, which is the world's: anchors on them are world points.
    const anchors: SceneAnchor[] = [
      // The belt between the decks, toward the nose, clear of the riders.
      { id: "bus", part: "bus.body", local: [body[3]! - 0.6, 1.25, body[5]! + 0.01], priority: 1 },
      // Just outside the upper deck's window, over the third seat's riders, so the pill never covers them.
      {
        id: "riders",
        part: "bus.seat.10",
        local: [
          (seat[0]! + seat[3]!) / 2,
          seat[1]! + CUSHION + ROWS * PITCH.y + 0.03,
          body[5]! + 0.01,
        ],
        priority: 3,
      },
      { id: "crates", part: "crate.1", local: [0, 0.5, 0.5], priority: 2 },
      { id: "stop", part: "stop.sign", local: [-0.5, 0, 0.5], priority: 2 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    built.set(scene, {
      layout,
      riders,
      tokens,
      queue,
      crates: crates.map((c) => c.parts[0] as BlockPart),
    });
    const tags: SceneTags = {
      anchors: [
        // On the floor in front of the bus, clear of the HUD and the labels.
        { id: "trip", part: "bus.body", local: [-0.2, 0, body[5]! + 1.1], priority: 0 },
        { id: "crates", part: "crate.3", local: [0, 0.5, 0.5], priority: 0 },
        // Above the queue's middle, clear of the stop sign's label.
        {
          id: "stop",
          part: "bus.body",
          local: [STOP.x - 2 * STOP.pitch, 0.95, STOP.rows[0]],
          priority: 0,
        },
      ],
      text: ["", "", ""],
      emphasis: [false, false, false],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui) {
    const { scene, dynamics } = frame.input;
    const { layout, riders, tokens, queue, crates } = built.get(scene)!;
    const c = tl.channels;
    // The loop fills the bus until the reader takes the slider; then the slider's riders ride.
    const onBus = ui.sliderSet ? ui.slider : Math.round(c.batch ?? 0);
    const prefill = ui.sliderSet ? 0 : (c.prefill ?? 0);
    const loaded = ui.sliderSet ? 1 : (c.crates ?? 1);
    const heavy = ui.sliderSet ? 0 : (c.heavy ?? 0);
    const capacity = busCapacity();

    const { seated, waiting } = occupancy(onBus, capacity);
    seatCubes(riders, layout.seats, seated);
    seatCubes(queue, layout.queue, waiting);
    seatCubes(tokens, layout.seats, prefill > 0.5 ? PREFILL_TOKENS : 0);
    for (let i = 0; i < crates.length; i++) {
      const crate = layout.crates[i]!;
      // They land one after another, rear first.
      const lag = clamp(loaded * (1 + 0.15 * (crates.length - 1)) - 0.15 * i, 0, 1);
      crates[i]!.transform[13] = crate.center[1] + (1 - lag) * CRATE_LIFT;
      dynamics.intensity[SLOT.crates + i] = heavy * CRATE_GLOW;
    }

    const readout = busReadout(onBus);
    const riderWord = onBus === 1 ? "rider" : "riders";
    frame.tags.text[TAG.trip] =
      prefill > 0.5
        ? `prefill: one ${PREFILL_TOKENS}-token prompt boards at once\none trip: ${formatStat(readout.prefillSec, "s")}`
        : onBus > 0
          ? `${onBus} ${riderWord} · ${formatStat(readout.totalTokPerSec, "tok/s")} in total\none trip: ${formatStat(readout.tripSec, "s")}`
          : "";
    frame.tags.text[TAG.crates] =
      heavy > 0.3 ? `${formatStat(readout.weightBytes, "bytes")} of weights, every trip` : "";
    frame.tags.text[TAG.stop] = onBus > capacity ? "bus full: each trip takes longer" : "";
  },
};
