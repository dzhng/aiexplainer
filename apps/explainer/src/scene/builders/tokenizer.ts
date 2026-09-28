/**
 * Chapter 1's scene, built from the kit (`block`, `brick`, `contactShadow`): a work table with a baseplate, the
 * "box of shapes" at the back, and a row of toy bricks, one per tokenizer piece of the text on
 * show, each with its piece and its id written on its face. Pieces come from the real shared
 * tokenizer (the run); a piece that starts a new word (it carries the word's leading space)
 * leaves a wide gap before its brick, so the pieces of one word sit close together.
 *
 * Brick colour maps piece frequency (the delegated choice): pale for a single byte (a letter
 * or mark every text can fall back to), yellow for pieces the tokenizer merged early (the most
 * common, ids below `EARLY_IDS`), coral for later, rarer merges. Colour is a material, so the
 * scene keeps a pool of bricks per colour and moves them in and out; a brick's length (in
 * studs) grows with its text.
 *
 * Loop channels read: `input` (which loop input is on show), `card` (0 → 1: the word card
 * from chapter 0 slides onto the plate), `bricksIn` (0 → 1: bricks come out of the box left
 * to right; back to 0 puts them back), `ids` (0 → 1: ids are stamped on, left to right), `box` (glow on
 * the box of shapes), `pair` (glow on the failure pair). Typed text shows its bricks settled.
 */
import { clamp } from "math";
import {
  BRICK,
  KIT,
  placeBrick,
  type BlockPart,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  PARKED_Y,
} from "@repo/renderer";
import type { Vec3 } from "math";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame, PiecesRun, SceneRun } from "../build-frame.ts";
import { stepAt } from "../step.ts";
import { tableParts, tableTop, type TableSpec } from "./table.ts";
import { smoothstep } from "../ease.ts";

/** One stud's pitch, metres; a brick is this deep and 1.2× as tall. */
const UNIT = 0.2;
/** Characters of face text one stud of length holds at the hero shot. */
const CHARS_PER_UNIT = 5;
const MAX_UNITS = 3;
/** The most bricks on show at once (the slider's range); each colour's pool holds this many. */
export const MAX_BRICKS = 16;
/** Gap before a brick that starts a new word, metres. */
const WORD_GAP = 0.08;
/** Gap between the pieces of one word, so each brick reads as its own piece. */
const PIECE_GAP = 0.018;
/** A row wraps to the next one, in front of it, past this width. */
const ROW_WIDTH = 2.5;
/** Row depths on the plate, for one row and for two (the first row is the back one). */
const ROW_Z = [[0.3], [-0.12, 0.62]] as const;
const MAX_ROWS = ROW_Z.length;
/** Ids below this were merged early: the tokenizer's most common pieces. */
export const EARLY_IDS = 1024;
/** The failure beat's pair: two words a reader knows are alike, as unrelated ids. */
export const FAILURE_PAIR = ["cat", "kitten"] as const;
/** How many bricks one flight from the box spans (they leave in a cascade), and its arc height. */
const CASCADE = 2.5;
const ARC = 0.3;
/** Glow at the top of a highlight. */
const GLOW = 0.2;

const TABLE: TableSpec = { center: [0, 0.74, 0], size: [3.0, 0.08, 1.65], legHeight: 0.7 };
const PLATE = {
  center: [0, tableTop(TABLE) + 0.015, 0.25] as Vec3,
  size: [2.7, 0.03, 1.05] as Vec3,
};
/** The top of the plate: where bricks stand. */
const PLATE_TOP = PLATE.center[1] + PLATE.size[1] / 2;
const BOX = { center: [-0.8, 0.91, -0.54] as Vec3, size: [0.95, 0.26, 0.42] as Vec3, wall: 0.03 };
/** Where a brick leaves the box: just over its rim. */
const BOX_TOP = BOX.center[1] + BOX.size[1] / 2;
const CARD = { width: 0.62, height: 0.2, depth: 0.03, travel: 1.6 };

export type Colour = "brickLetter" | "brickEarly" | "brickLate";
export const COLOURS: readonly Colour[] = ["brickLetter", "brickEarly", "brickLate"];

type Piece = PiecesRun["steps"][number]["pieces"][number];

/** The frequency colour of a piece (see the header). */
export function colourOf(piece: Piece): Colour {
  if (piece.bytes === 1) return "brickLetter";
  return piece.id < EARLY_IDS ? "brickEarly" : "brickLate";
}

/** What a brick's face reads: its piece (a bare space shows as ␣), then its id once stamped. */
export function faceText(piece: Piece, stamped: boolean): string {
  const text = piece.text.trim() || "␣";
  return stamped ? `${text}\n${piece.id}` : text;
}

/** Where each piece's brick stands: centre x, row z, and length in studs. */
interface BrickSpot {
  x: number;
  z: number;
  length: number;
}

/** Lays pieces out in rows, centred on the plate; a new word leaves a gap. */
function layoutRow(pieces: readonly Piece[]): BrickSpot[] {
  const lengths = pieces.map((p) =>
    Math.min(MAX_UNITS, Math.max(1, Math.ceil(p.text.trim().length / CHARS_PER_UNIT))),
  );
  const rows: { start: number; end: number; width: number }[] = [];
  let x = 0;
  let start = 0;
  pieces.forEach((piece, i) => {
    const gap = /^\s/.test(piece.text) ? WORD_GAP : PIECE_GAP;
    const width = lengths[i]! * UNIT;
    if (i > start && x + gap + width > ROW_WIDTH && rows.length + 1 < MAX_ROWS) {
      rows.push({ start, end: i, width: x });
      start = i;
      x = 0;
    }
    x += (i > start ? gap : 0) + width;
  });
  rows.push({ start, end: pieces.length, width: x });
  const spots: BrickSpot[] = [];
  rows.forEach((row, r) => {
    let cursor = -row.width / 2;
    for (let i = row.start; i < row.end; i++) {
      if (i > row.start) cursor += /^\s/.test(pieces[i]!.text) ? WORD_GAP : PIECE_GAP;
      const width = lengths[i]! * UNIT;
      spots.push({ x: cursor + width / 2, z: ROW_Z[rows.length - 1]![r]!, length: lengths[i]! });
      cursor += width;
    }
  });
  return spots;
}

interface Built {
  /** Each colour's pool: every brick's parts (body, then studs) and its dynamics slot. */
  pools: Record<Colour, { parts: Part[]; slot: number }[]>;
  card: BlockPart;
  anchors: Record<"bricks" | "ids", SceneAnchor>;
  /** Tag indices: one per pool brick (colour-major), then the card, then the note. */
  cardTag: number;
  noteTag: number;
  /** Per-frame scratch: bricks claimed per colour, a placement, the last layout. */
  used: number[];
  placement: { center: Vec3; unit: number; length: number };
  layout: {
    from: readonly Piece[] | undefined;
    count: number;
    pieces: Piece[];
    spots: BrickSpot[];
  };
  /** What the bricks and card were placed from last frame; a change re-tests occlusion. */
  motion: { spots: BrickSpot[] | null; arrive: number; slide: number };
}

const built = new WeakMap<SceneDesc, Built>();
const PARKED = { center: [0, PARKED_Y, 0] as Vec3, unit: UNIT, length: 1 };

/** The step's first `count` pieces and their spots, laid out again only when either changes. */
function laidOut(b: Built, from: readonly Piece[] | undefined, count: number) {
  const memo = b.layout;
  if (memo.from !== from || memo.count !== count) {
    memo.from = from;
    memo.count = count;
    memo.pieces = (from ?? []).slice(0, count);
    memo.spots = layoutRow(memo.pieces);
  }
  return memo;
}

/** A point in the plate's local (unit-cube) space, for anchors pinned to the plate. */
function onPlate(x: number, y: number, z: number): Vec3 {
  const [cx, cy, cz] = PLATE.center;
  const [sx, sy, sz] = PLATE.size;
  return [(x - cx) / sx, (y - cy) / sy, (z - cz) / sz];
}

function staticParts(): Part[] {
  const [bx, by, bz] = BOX.center;
  const [bw, bh, bd] = BOX.size;
  const w = BOX.wall;
  const box: { id: string; center: Vec3; size: Vec3; material: string }[] = [
    {
      id: "box.floor",
      center: [bx, by - bh / 2 + w / 2, bz],
      size: [bw, w, bd],
      material: "housing",
    },
    {
      id: "box.front",
      center: [bx, by, bz + bd / 2 - w / 2],
      size: [bw, bh, w],
      material: "housing",
    },
    {
      id: "box.back",
      center: [bx, by, bz - bd / 2 + w / 2],
      size: [bw, bh, w],
      material: "housing",
    },
    {
      id: "box.left",
      center: [bx - bw / 2 + w / 2, by, bz],
      size: [w, bh, bd],
      material: "housing",
    },
    {
      id: "box.right",
      center: [bx + bw / 2 - w / 2, by, bz],
      size: [w, bh, bd],
      material: "housing",
    },
    // The rim along the front edge: it glows when the box is the point.
    {
      id: "box.rim",
      center: [bx, by + bh / 2 + 0.006, bz + bd / 2 - w / 2],
      size: [bw, 0.012, w + 0.004],
      material: "bar",
    },
  ];
  return [
    ...tableParts(TABLE),
    ...KIT.block.build({
      id: "plate",
      slot: 0,
      material: "plate",
      center: PLATE.center,
      size: PLATE.size,
    }).parts,
    ...box.flatMap(
      (b) =>
        KIT.block.build({
          ...b,
          slot: b.id === "box.rim" ? BOX_SLOT : 0,
        }).parts,
    ),
  ];
}

/** Dynamics slots: 0 static, the rim's, the card's, the box's contents, then one per brick. */
const BOX_SLOT = 1;
const CARD_SLOT = 2;
const HEAP_SLOT = 3;
const FIRST_BRICK_SLOT = 4;

/** The box's contents: smaller bricks packed in two layers, the top one just over the rim. */
const HEAP = { unit: 0.12, layers: 2, lengths: [2, 1, 3, 1, 2, 2, 1, 3, 1, 2, 1, 2] };

/** Bricks packed in the box (no text: they stand for the box's contents). */
function heapParts(): Part[] {
  const [bx, by, bz] = BOX.center;
  const inner = { width: BOX.size[0] - 2 * BOX.wall, depth: BOX.size[2] - 2 * BOX.wall };
  const floor = by - BOX.size[1] / 2 + BOX.wall;
  const { unit } = HEAP;
  const height = BRICK.height * unit;
  const rows = Math.floor(inner.depth / unit);
  const parts: Part[] = [];
  let n = 0;
  for (let layer = 0; layer < HEAP.layers; layer++)
    for (let row = 0; row < rows; row++) {
      // Each row is packed left to right; layers and rows start at different lengths.
      let x = -inner.width / 2 + (layer % 2) * unit * 0.5;
      for (;;) {
        const length = HEAP.lengths[(n + layer * 5 + row * 3) % HEAP.lengths.length]!;
        if (x + length * unit > inner.width / 2) break;
        parts.push(
          ...KIT.brick.build({
            id: `heap.${n}`,
            slot: HEAP_SLOT,
            material: COLOURS[(n * 7 + row) % COLOURS.length]!,
            center: [
              bx + x + (length * unit) / 2,
              floor + height / 2 + layer * height,
              bz - inner.depth / 2 + unit * (row + 0.5),
            ],
            unit,
            length,
            studs: length,
          }).parts,
        );
        x += length * unit;
        n++;
      }
    }
  return parts;
}

export const tokenizer: SceneBuilder = {
  assets: {},
  // A face per pool brick, the card's word, and one note.
  tagCount: COLOURS.length * MAX_BRICKS + 2,

  create(assets, revision) {
    const pools = {} as Built["pools"];
    const parts: Part[] = [...staticParts(), ...heapParts()];
    let slot = FIRST_BRICK_SLOT;
    for (const colour of COLOURS) {
      pools[colour] = Array.from({ length: MAX_BRICKS }, (_, i) => {
        const brick = KIT.brick.build({
          id: `brick.${colour}.${i}`,
          slot,
          material: colour,
          // Built parked below the room; `update` places the ones on show.
          center: [0, PARKED_Y, 0],
          unit: UNIT,
          length: 1,
          studs: MAX_UNITS,
        });
        parts.push(...brick.parts);
        return { parts: brick.parts, slot: slot++ };
      });
    }
    const card = KIT.block.build({
      id: "card",
      slot: CARD_SLOT,
      material: "card",
      center: [0, PARKED_Y, 0],
      size: [CARD.width, CARD.height, CARD.depth],
    }).parts[0] as BlockPart;
    parts.push(card);

    const first = pools.brickEarly[0]!.parts[0]!.id;
    const anchors = {
      bricks: { id: "bricks", part: first, local: [-0.5, 0.5, -0.5] as Vec3, priority: 3 },
      ids: { id: "ids", part: first, local: [0.5, -0.3, 0.5] as Vec3, priority: 2 },
    };
    const sceneAnchors: SceneAnchor[] = [
      anchors.bricks,
      anchors.ids,
      // The front of the box of shapes, at its left end.
      { id: "box", part: "box.front", local: [-0.35, 0.5, 0.5], priority: 1 },
      // The plate's front edge, under the row: where the text is laid out.
      { id: "text", part: "plate", local: onPlate(0, PLATE_TOP, 0.775), priority: 1 },
    ];
    const scene: SceneDesc = { revision, parts, anchors: sceneAnchors, assets };

    const faceAnchors = COLOURS.flatMap((colour) =>
      pools[colour].map((b) => ({
        id: `face.${b.parts[0]!.id}`,
        part: b.parts[0]!.id,
        local: [0, 0, 0.5] as Vec3,
        priority: 0,
      })),
    );
    const noteAnchor: SceneAnchor = {
      id: "note",
      part: "plate",
      local: onPlate(0.15, PLATE_TOP + 0.62, ROW_Z[0][0]),
      priority: 0,
    };
    const tags: SceneTags = {
      anchors: [
        ...faceAnchors,
        { id: "card", part: "card", local: [0, 0, 0.5], priority: 0 },
        noteAnchor,
      ],
      text: Array.from({ length: faceAnchors.length + 2 }, () => ""),
      style: [...faceAnchors.map(() => "onPart" as const), "onPart", "above"],
    };
    built.set(scene, {
      pools,
      card,
      anchors,
      cardTag: faceAnchors.length,
      noteTag: faceAnchors.length + 1,
      used: COLOURS.map(() => 0),
      placement: { center: [0, 0, 0], unit: UNIT, length: 1 },
      layout: { from: undefined, count: -1, pieces: [], spots: [] },
      motion: { spots: null, arrive: -1, slide: -1 },
    });
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const b = built.get(scene)!;
    const steps = run?.kind === "pieces" ? run.steps : [];
    const typed = ui.text !== null;
    const step = stepAt(steps, typed, tl.channels.input);
    const { pieces, spots } = laidOut(b, step?.pieces, Math.min(MAX_BRICKS, ui.slider));
    const arrive = typed ? 1 : (tl.channels.bricksIn ?? 1);
    const stamp = typed ? 1 : (tl.channels.ids ?? 1);
    const pair = typed ? 0 : (tl.channels.pair ?? 0);
    const n = pieces.length;

    // Every brick starts parked with a blank face; the pieces on show claim one of their colour.
    for (let c = 0; c < COLOURS.length; c++) {
      const pool = b.pools[COLOURS[c]!];
      b.used[c] = 0;
      for (let i = 0; i < pool.length; i++) {
        frame.tags.text[c * MAX_BRICKS + i] = "";
        placeBrick(pool[i]!.parts, PARKED);
        dynamics.intensity[pool[i]!.slot] = 0;
      }
    }
    let first: string | null = null;
    let lastStamped: string | null = null;
    for (let i = 0; i < n; i++) {
      const piece = pieces[i]!;
      const c = COLOURS.indexOf(colourOf(piece));
      const k = b.used[c]!++;
      const brick = b.pools[COLOURS[c]!][k];
      if (!brick) continue;
      // Left to right in, right to left out: brick i lands once `arrive` passes its turn.
      const u = clamp((arrive * (n - 1 + CASCADE) - i) / CASCADE, 0, 1);
      if (u <= 0) continue;
      // Each brick is taken from the box of shapes: it arcs from above the box to its spot,
      // growing from the box's brick size, and goes back the same way.
      const eased = smoothstep(u);
      const spot = spots[i]!;
      const rest = PLATE_TOP + (BRICK.height * UNIT) / 2;
      const at = b.placement;
      at.center[0] = BOX.center[0] + (spot.x - BOX.center[0]) * eased;
      at.center[1] = BOX_TOP + (rest - BOX_TOP) * eased + Math.sin(Math.PI * eased) * ARC;
      at.center[2] = BOX.center[2] + (spot.z - BOX.center[2]) * eased;
      at.unit = HEAP.unit + (UNIT - HEAP.unit) * eased;
      at.length = spot.length;
      placeBrick(brick.parts, at);
      const stamped = stamp * (n + 1) > i + 0.5;
      frame.tags.text[c * MAX_BRICKS + k] = u > 0.9 ? faceText(piece, stamped) : "";
      const inPair = (FAILURE_PAIR as readonly string[]).includes(piece.text.trim());
      dynamics.intensity[brick.slot] = inPair ? pair * GLOW : 0;
      first ??= brick.parts[0]!.id;
      if (stamped && u > 0.9) lastStamped = brick.parts[0]!.id;
    }
    // The brick labels ride the first brick on show and the last stamped one; with none, they
    // ride a brick that is parked out of sight (the pool's last), so they hide.
    const parked = b.pools.brickLate[MAX_BRICKS - 1]!.parts[0]!.id;
    b.anchors.bricks.part = first ?? parked;
    b.anchors.ids.part = lastStamped ?? parked;

    // The card: chapter 0's word card, sliding onto the plate from the right.
    const slide = typed ? 0 : (tl.channels.card ?? 0);
    const card = b.card.transform;
    const shown = slide > 0.001 && step !== undefined;
    card[0] = CARD.width;
    card[5] = CARD.height;
    card[10] = CARD.depth;
    card[12] = (1 - slide) * CARD.travel;
    card[13] = shown ? PLATE_TOP + CARD.height / 2 : PARKED_Y;
    card[14] = ROW_Z[0][0];
    frame.tags.text[b.cardTag] = shown ? step.text : "";

    // Bricks that moved can hide (or stop hiding) the faces behind them.
    const motion = b.motion;
    if (motion.spots !== spots || motion.arrive !== arrive || motion.slide !== slide) {
      motion.spots = spots;
      motion.arrive = arrive;
      motion.slide = slide;
      scene.layout = (scene.layout ?? 0) + 1;
    }

    dynamics.intensity[BOX_SLOT] = 0.15 + (typed ? 0 : (tl.channels.box ?? 0)) * 2.5;
    dynamics.intensity[HEAP_SLOT] = 0;
    dynamics.intensity[CARD_SLOT] = 0;
    frame.tags.text[b.noteTag] = typed ? "" : noteFor(tl.channels, step, run);
  },
};

/** The scene note for the loop's current beat, from the run's own numbers. */
function noteFor(
  channels: Record<string, number>,
  step: { pieces: Piece[] } | undefined,
  run: SceneRun | null,
): string {
  if (!step || run?.kind !== "pieces") return "";
  if ((channels.pair ?? 0) > 0.5) {
    const [a, b] = FAILURE_PAIR.map((w) => step.pieces.find((p) => p.text.trim() === w));
    if (a && b)
      return `“${FAILURE_PAIR[0]}” is ${a.id}, “${FAILURE_PAIR[1]}” is ${b.id}: nothing says they're alike`;
  }
  if ((channels.box ?? 0) > 0.5)
    return `every text is built from the same ${run.vocab.toLocaleString("en-US")} shapes`;
  if ((channels.snapNote ?? 0) > 0.5) return "never seen whole, but made of bricks it knows";
  return "";
}
