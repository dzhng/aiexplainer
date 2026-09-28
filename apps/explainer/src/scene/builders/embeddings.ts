/**
 * Chapter 2's scene, built from the kit (`block`, `pins`, `brick`, `contactShadow`): a map on
 * a work table with a pin stuck in it for each pinned word. A pin stands where its word's
 * embedding (its row of the `embed` model's table) falls on the map's three directions: the
 * first two across the map, the third as the pin's height (`scene/embed-map.ts`, computed
 * offline). Arrows run from the shadow of the all-zeros embedding (the origin post) to each
 * pin. The loop's words (and typed text) arrive as chapter 1's bricks, fly onto the map and
 * become pins at their own words' places.
 *
 * Loop channels read: `input` (which loop input), `fly` (0 → 1: the input's bricks fly to their
 * pins and become them), `sink` (0 → 1: the input's pins sink back into the map), `pair` (glow
 * on the input's pins), `arrows` (0 → 1: arrows grow from the origin), `focus` (0 → 1: every
 * arrow but the input's shrinks away), `pairNote` and `itNote` (the scene notes). Typed text
 * shows its pins settled.
 */
import { clamp } from "math";
import {
  BRICK,
  KIT,
  placeBrick,
  placePin,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  PARKED_Y,
} from "@repo/renderer";
import type { Vec3 } from "math";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame, PinsRun } from "../build-frame.ts";
import { stepAt } from "../step.ts";
import { EMBED_MAP, MAX_PINNED_INPUT, ORIGIN, type Vec3Tuple } from "../embed-map.ts";
import { tableParts, tableTop, type TableSpec } from "./table.ts";
import { colourOf, COLOURS, type Colour } from "./tokenizer.ts";
import { smoothstep } from "../ease.ts";

const TABLE: TableSpec = { center: [0, 0.74, 0], size: [3.8, 0.08, 2.9], legHeight: 0.7 };
const MAP = { size: [3.6, 0.02, 2.7] as Vec3, grid: 0.3, line: 0.008 };
const MAP_TOP = tableTop(TABLE) + MAP.size[1];
/** Metres per unit of the first two directions, and of the third (the pins' heights). */
const SPREAD = 0.52;
const RISE = 0.14;
/** Pin height above the map where the third direction is 0. */
const LIFT = 0.36;
/** Bricks hover here (in a row) before they fly onto the map. */
const HOVER = { y: MAP_TOP + 0.95, z: 1.75, gap: 0.08 };
const BRICK_UNIT = 0.16;
/** Arrows glow this much at rest; a highlighted pin's head glows this much. */
const ARROW_GLOW = 0.12;
const PIN_GLOW = 1;
/** Just above a pin head (in its unit-tube space), clear of the head itself for occlusion. */
const ABOVE: Vec3 = [0, 2.5, 0];

const BACKGROUND = EMBED_MAP.pins.length;
const LABELLED_PIN = Math.max(
  0,
  EMBED_MAP.pins.findIndex((p) => p.word === "happy"),
);

/** The centre of everything the map shows (pins and origin), in the map's own units. */
const CENTRE = (() => {
  const all = [...EMBED_MAP.pins.map((p) => p.at), ORIGIN];
  return [0, 1].map((a) => {
    const values = all.map((v) => v[a]!);
    return (Math.min(...values) + Math.max(...values)) / 2;
  });
})();

/** Where a projection stands in the world: its pin head. */
export function mapPoint(at: Vec3Tuple, out: Vec3 = [0, 0, 0]): Vec3 {
  out[0] = (at[0] - CENTRE[0]!) * SPREAD;
  out[1] = MAP_TOP + LIFT + at[2] * RISE;
  out[2] = (at[1] - CENTRE[1]!) * SPREAD;
  return out;
}

const ORIGIN_POINT = mapPoint(ORIGIN);
const BACKGROUND_HEADS = EMBED_MAP.pins.map((p) => mapPoint(p.at));

/** Dynamics slots: 0 static, the arrows, the origin post, the input pins, the background pins, the bricks. */
const ARROW_SLOT = 1;
const ORIGIN_SLOT = 2;
const INPUT_SLOT = 3;
const BACKGROUND_SLOT = INPUT_SLOT + MAX_PINNED_INPUT;
const BRICK_SLOT = BACKGROUND_SLOT + BACKGROUND;

interface Built {
  background: Part[];
  input: Part[];
  bricks: Record<Colour, { parts: Part[]; slot: number }[]>;
  anchors: Record<"pins" | "arrows" | "text", SceneAnchor>;
  tagOf: { input: number; brick: number; background: number; note: number };
  scratch: {
    head: Vec3;
    hover: Vec3;
    placement: { center: Vec3; unit: number; length: number };
    used: number[];
  };
  /** What the pins were placed from last frame; a change re-tests label occlusion. */
  motion: { fly: number; arrows: number; sink: number; step: unknown };
}

const built = new WeakMap<SceneDesc, Built>();

/** Input word `i` of `n`'s progress, 0 → 1, as `fly` sweeps: words go one after another. */
function landing(fly: number, n: number, i: number): number {
  return clamp((fly * (n + 3) - i) / 4, 0, 1);
}
/** The progress at which a word's brick has become its pin. */
const LANDED = 0.85;
const PARKED = { center: [0, PARKED_Y, 0] as Vec3, unit: BRICK_UNIT, length: 1 };

function mapParts(): Part[] {
  const [w, h, d] = MAP.size;
  const y = MAP_TOP - h / 2;
  const lines: Part[] = [];
  const along = (count: number, span: number) =>
    Array.from({ length: count }, (_, i) => -span / 2 + (i + 0.5) * (span / count));
  along(Math.round(w / MAP.grid), w).forEach((x, i) =>
    lines.push(
      ...KIT.block.build({
        id: `map.grid.x${i}`,
        slot: 0,
        material: "mapGrid",
        center: [x, MAP_TOP + 0.001, 0],
        size: [MAP.line, 0.002, d],
      }).parts,
    ),
  );
  along(Math.round(d / MAP.grid), d).forEach((z, i) =>
    lines.push(
      ...KIT.block.build({
        id: `map.grid.z${i}`,
        slot: 0,
        material: "mapGrid",
        center: [0, MAP_TOP + 0.001, z],
        size: [w, 0.002, MAP.line],
      }).parts,
    ),
  );
  return [
    ...KIT.block.build({ id: "map", slot: 0, material: "map", center: [0, y, 0], size: MAP.size })
      .parts,
    ...lines,
  ];
}

export const embeddings: SceneBuilder = {
  assets: {},
  // The input pins' words, the bricks' faces, the background pins' words, one note.
  tagCount: MAX_PINNED_INPUT + COLOURS.length * MAX_PINNED_INPUT + BACKGROUND + 1,

  create(assets, revision) {
    const pinField = (id: string, slot: number, heads: Vec3[], arrowSlot?: number) =>
      KIT.pins.build({
        id,
        slot,
        heads,
        floor: MAP_TOP,
        origin: ORIGIN_POINT,
        headMaterial: "pin",
        needleMaterial: "metal",
        arrowMaterial: "arrow",
        arrowSlot,
      }).parts;
    const input = pinField(
      "word",
      INPUT_SLOT,
      Array.from({ length: MAX_PINNED_INPUT }, () => [0, 1, 0]),
    );
    // Background arrows glow together; each input pin's arrow glows with its pin.
    const background = pinField("pin", BACKGROUND_SLOT, BACKGROUND_HEADS, ARROW_SLOT);
    // The origin: a post whose glowing head is where the all-zeros embedding falls.
    const origin = KIT.pins.build({
      id: "origin",
      slot: ORIGIN_SLOT,
      heads: [ORIGIN_POINT],
      floor: MAP_TOP,
      origin: ORIGIN_POINT,
      headMaterial: "arrow",
      needleMaterial: "metal",
      arrowMaterial: "arrow",
    }).parts;
    let slot = BRICK_SLOT;
    const bricks = {} as Built["bricks"];
    const brickParts: Part[] = [];
    for (const colour of COLOURS)
      bricks[colour] = Array.from({ length: MAX_PINNED_INPUT }, (_, i) => {
        const b = KIT.brick.build({
          id: `brick.${colour}.${i}`,
          slot,
          material: colour,
          center: [0, PARKED_Y, 0],
          unit: BRICK_UNIT,
          length: 1,
          studs: 2,
        });
        brickParts.push(...b.parts);
        return { parts: b.parts, slot: slot++ };
      });
    const parts = [
      ...tableParts(TABLE),
      ...mapParts(),
      ...origin,
      ...background,
      ...input,
      ...brickParts,
    ];

    const anchors = {
      // A pin clear of the crowd (and of the loop's own words): “happy”.
      pins: { id: "pins", part: `pin.${LABELLED_PIN}.head`, local: ABOVE, priority: 2 },
      arrows: { id: "arrows", part: "pin.20.arrow", local: [0.55, 0, 0] as Vec3, priority: 1 },
      text: { id: "text", part: "word.0.head", local: ABOVE, priority: 3 },
    };
    const sceneAnchors: SceneAnchor[] = [
      anchors.text,
      anchors.pins,
      anchors.arrows,
      { id: "origin", part: "origin.0.head", local: ABOVE, priority: 1 },
      // The map's front-left corner.
      { id: "map", part: "map", local: [0.3, 0.5, 0.4], priority: 0 },
    ];
    const scene: SceneDesc = { revision, parts, anchors: sceneAnchors, assets };

    const above = ABOVE;
    const tagOf = {
      note: 0,
      input: 1,
      brick: 1 + MAX_PINNED_INPUT,
      background: 1 + MAX_PINNED_INPUT + COLOURS.length * MAX_PINNED_INPUT,
    };
    const tags: SceneTags = {
      anchors: [
        // The note first: it outranks every word it could overlap. High over the map's centre,
        // clear of the pins and of the title panel.
        { id: "note", part: "map", local: [0.05, 38, -0.05] as Vec3, priority: 0 },
        ...Array.from({ length: MAX_PINNED_INPUT }, (_, i) => ({
          id: `word.${i}`,
          part: `word.${i}.head`,
          local: above,
          priority: 0,
        })),
        ...COLOURS.flatMap((colour) =>
          bricks[colour].map((b) => ({
            id: `face.${b.parts[0]!.id}`,
            part: b.parts[0]!.id,
            local: [0, 0, 0.5] as Vec3,
            priority: 0,
          })),
        ),
        ...EMBED_MAP.pins.map((_, i) => ({
          id: `pin.${i}`,
          part: `pin.${i}.head`,
          local: above,
          priority: 0,
        })),
      ],
      text: [],
      style: [],
    };
    tags.text = tags.anchors.map(() => "");
    tags.style = tags.anchors.map((_, i) =>
      i >= tagOf.brick && i < tagOf.background ? "onPart" : "above",
    );
    built.set(scene, {
      background,
      input,
      bricks,
      anchors,
      tagOf,
      scratch: {
        head: [0, 0, 0],
        hover: [0, 0, 0],
        placement: { center: [0, 0, 0], unit: BRICK_UNIT, length: 1 },
        used: COLOURS.map(() => 0),
      },
      motion: { fly: -1, arrows: -1, sink: -1, step: null },
    });
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const b = built.get(scene)!;
    const steps = run?.kind === "pins" ? run.steps : [];
    const typed = ui.text !== null;
    const step = stepAt(steps, typed, tl.channels.input);
    const fly = typed ? 1 : (tl.channels.fly ?? 1);
    const arrows = typed ? 1 : (tl.channels.arrows ?? 0);
    const pair = typed ? 1 : (tl.channels.pair ?? 0);
    // `sink` lowers the input's pins back into the map; `focus` shrinks every other arrow.
    const sink = typed ? 0 : (tl.channels.sink ?? 0);
    const focus = typed ? 0 : (tl.channels.focus ?? 0);
    const { head, hover, placement, used } = b.scratch;
    const inputs = step?.pins ?? [];

    // The input's words: each flies from its brick in the hover row to its own pin.
    used.fill(0);
    for (const colour of COLOURS)
      for (const brick of b.bricks[colour]) placeBrick(brick.parts, PARKED);
    for (let c = 0; c < COLOURS.length; c++)
      for (let i = 0; i < MAX_PINNED_INPUT; i++) {
        frame.tags.text[b.tagOf.brick + c * MAX_PINNED_INPUT + i] = "";
        dynamics.intensity[BRICK_SLOT + c * MAX_PINNED_INPUT + i] = 0;
      }
    const rowWidth = inputs.length * (BRICK_UNIT * 2 + HOVER.gap);
    for (let i = 0; i < MAX_PINNED_INPUT; i++) {
      const pin = inputs[i];
      if (!pin) {
        placePin(b.input, i, null, MAP_TOP, ORIGIN_POINT, 0);
        frame.tags.text[b.tagOf.input + i] = "";
        continue;
      }
      mapPoint(pin.at, head);
      head[1] = MAP_TOP + (head[1]! - MAP_TOP) * (1 - sink);
      // 0–0.25 the brick appears in the hover row; 0.25–0.85 it flies; then it is the pin.
      const u = landing(fly, inputs.length, i);
      const flight = clamp((u - 0.25) / (LANDED - 0.25), 0, 1);
      const landed = u >= LANDED && sink < 0.98;
      placePin(b.input, i, landed ? head : null, MAP_TOP, ORIGIN_POINT, arrows);
      frame.tags.text[b.tagOf.input + i] = landed ? pin.text.trim() : "";
      dynamics.intensity[INPUT_SLOT + i] = Math.max(ARROW_GLOW, PIN_GLOW * pair);
      if (u > 0 && u < LANDED && sink === 0) {
        const c = COLOURS.indexOf(colourOf(pin));
        const brick = b.bricks[COLOURS[c]!][used[c]!++]!;
        hover[0] = -rowWidth / 2 + (i + 0.5) * (BRICK_UNIT * 2 + HOVER.gap);
        hover[1] = HOVER.y;
        hover[2] = HOVER.z;
        const e = smoothstep(flight);
        for (let a = 0; a < 3; a++) placement.center[a] = hover[a]! + (head[a]! - hover[a]!) * e;
        placement.center[1] += Math.sin(Math.PI * e) * 0.35 + BRICK.height * BRICK_UNIT * (1 - e);
        placement.unit = BRICK_UNIT * (1 - 0.7 * e) * Math.min(1, u / 0.1);
        placement.length = 2;
        placeBrick(brick.parts, placement);
        frame.tags.text[b.tagOf.brick + c * MAX_PINNED_INPUT + used[c]! - 1] =
          flight < 0.3 ? pin.text.trim() : "";
      }
    }

    // The background pins; a word the input pins itself yields to it.
    for (let i = 0; i < BACKGROUND; i++) {
      const id = EMBED_MAP.pins[i]!.id;
      let covered = false;
      for (let k = 0; k < inputs.length && !covered; k++)
        covered = inputs[k]!.id === id && landing(fly, inputs.length, k) >= LANDED;
      const shown = !covered;
      const grow = arrows * (1 - focus);
      placePin(b.background, i, shown ? BACKGROUND_HEADS[i]! : null, MAP_TOP, ORIGIN_POINT, grow);
      frame.tags.text[b.tagOf.background + i] = shown ? EMBED_MAP.pins[i]!.word : "";
      dynamics.intensity[BACKGROUND_SLOT + i] = 0;
    }
    dynamics.intensity[ARROW_SLOT] = ARROW_GLOW;
    dynamics.intensity[ORIGIN_SLOT] = 1;
    frame.tags.text[b.tagOf.note] = typed ? "" : noteFor(tl.channels, step);

    // Labels: "your text" rides the first input pin while it is down; otherwise it hides.
    // (a parked brick: the late pool's last one, which only an eighth rare word would fly).
    b.anchors.text.part =
      inputs.length && fly >= 0.99 ? "word.0.head" : `brick.brickLate.${MAX_PINNED_INPUT - 1}`;

    const motion = b.motion;
    if (
      motion.fly !== fly ||
      motion.arrows !== arrows ||
      motion.sink !== sink ||
      motion.step !== step
    ) {
      motion.fly = fly;
      motion.arrows = arrows;
      motion.sink = sink;
      motion.step = step;
      scene.layout = (scene.layout ?? 0) + 1;
    }
  },
};

type PinsStep = PinsRun["steps"][number];

/** The scene note for the loop's current beat, from the run's own numbers. */
function noteFor(channels: Record<string, number>, step: PinsStep | undefined): string {
  if (!step) return "";
  const [a, b] = step.pins;
  if ((channels.pairNote ?? 0) > 0.5 && a && b && step.cosine !== null)
    return `“${a.text.trim()}” and “${b.text.trim()}” point almost the same way: ${step.cosine.toFixed(2)} (1 = exactly)`;
  if ((channels.itNote ?? 0) > 0.5 && a)
    return `“${a.text.trim()}” gets this one pin in every sentence: the map never sees the words before it`;
  return "";
}
