/**
 * Chapter 0's scene, built from the kit (`mesh`, `bars`, `block`, `contactShadow`): the
 * counter board split into its nodes on a soft contact shadow, a count bar in each of its
 * slots, and a word card on its rail. Bar heights are the real `nextWords` shares for the
 * word on the card; the slot and rail positions come from the prop's own nodes, so the
 * Blender script stays their only owner. The header strip names the lookup ("after “upon”…"),
 * so the bars read as that word's row of the tally, and the rail holds the whole text: the
 * earlier words muted, the last one on the lit card, the only word the machine looks at.
 *
 * Loop channels read: `railWord` (which step's word is on the card), `barsWord` (which step's
 * counts the bars show; it may lag the card), `railSlide` (0 → 1 as the card slides in),
 * `bars` (0 → 1 bar growth), `topFlash` (glow on the tallest bar).
 * Typed text shows its word's bars at full height, without the loop's motion.
 */
import {
  KIT,
  placeBar,
  type BarSlot,
  type BlockPart,
  type MeshAsset,
  type SceneAnchor,
  type SceneDesc,
} from "@repo/renderer";
import type { NextWord } from "@repo/llm";
import type { Mat4 } from "math";
import type { Box3 } from "math/shapes";
import { share } from "../../chapters/format.ts";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";
import { stepAt } from "../step.ts";
import { shown as named } from "./sampling.ts";

/** Chapter 0's run (`runtime/runs/autocomplete.ts`). */
export interface CountsRun {
  kind: "counts";
  /**
   * One step per loop text (or one for typed text): its earlier words, its last word, and
   * that last word's real successors.
   */
  steps: { before: string[]; word: string; next: NextWord[] }[];
}

/** The board's count slots: how many successors the run looks up. */
export const BOARD_SLOTS = 10;
const SLOTS = BOARD_SLOTS;
/** The most characters of earlier words the rail shows; longer text keeps its end. */
const BEFORE_CHARS = 36;
/** Bars are this share of their slot's width and depth, so the channel walls stay visible. */
const BAR_WIDTH = 0.72;
const BAR_DEPTH = 0.6;
/** Clearance below the slot top and above its floor, metres. */
const SLOT_MARGIN = 0.03;
const CARD = { width: 0.5, height: 0.12, depth: 0.02 };
/** How far right of its resting place the card starts its slide, metres. */
const CARD_TRAVEL = 1.4;
/** The width (x) of each of the stand's feet in `counter_board.py`, metres. */
const FOOT = 0.2;
/** Extra glow on the tallest bar at the top of its flash. */
const FLASH_GAIN = 3;

interface Box {
  min: [number, number, number];
  max: [number, number, number];
}

function nodeBox(asset: MeshAsset, name: string): Box {
  const node = asset.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`autocomplete: the board has no node "${name}"`);
  const b = node.bounds;
  return { min: [b[0], b[1], b[2]], max: [b[3], b[4], b[5]] };
}

/** Layout read from the prop, fixed for the scene's lifetime. */
interface Layout {
  slots: BarSlot[];
  card: { x: number; y: number; z: number };
  /** The middle of the slot row, on its front face: where "no counts" is written. */
  middle: [number, number, number];
}

/** The layout and the parts `update` moves, per built scene. */
const built = new WeakMap<SceneDesc, { layout: Layout; bars: BlockPart[]; card: BlockPart }>();

function layoutOf(asset: MeshAsset): Layout {
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const b = nodeBox(asset, `board.slot.${i}`);
    return {
      x: (b.min[0] + b.max[0]) / 2,
      z: (b.min[2] + b.max[2]) / 2,
      floor: b.min[1] + SLOT_MARGIN,
      maxHeight: b.max[1] - b.min[1] - 2 * SLOT_MARGIN,
      width: (b.max[0] - b.min[0]) * BAR_WIDTH,
      depth: (b.max[2] - b.min[2]) * BAR_DEPTH,
    };
  });
  // The card stands on the rail's shelf at its right end, clear of the bars that are shown.
  const rail = nodeBox(asset, "board.rail");
  const first = slots[0]!;
  const last = slots[SLOTS - 1]!;
  return {
    slots,
    middle: [(first.x + last.x) / 2, first.floor + first.maxHeight / 2, first.z + first.depth],
    card: {
      x: rail.max[0] - CARD.width / 2 - 0.08,
      y: rail.min[1] + CARD.height / 2 + 0.035,
      z: (rail.min[2] + rail.max[2]) / 2,
    },
  };
}

function placeCard(transform: Mat4, x: number, y: number, z: number) {
  transform[0] = CARD.width;
  transform[5] = CARD.height;
  transform[10] = CARD.depth;
  transform[12] = x;
  transform[13] = y;
  transform[14] = z;
}

/** The earlier words as the rail shows them: the end of the text, cut at a word, if long. */
function earlier(words: readonly string[]): string {
  const text = words.join(" ");
  if (text.length <= BEFORE_CHARS) return text;
  const tail = text.slice(-BEFORE_CHARS);
  return `…${tail.slice(tail.indexOf(" ") + 1)}`;
}

export const autocomplete: SceneBuilder = {
  assets: { board: "/props/counter_board.glb" },
  // A word per bar, the card's word, the note for a word with no counts, the earlier words
  // and the header.
  tagCount: SLOTS + 4,

  create(assets, revision) {
    const board = assets.board;
    if (!board) throw new Error("autocomplete: the board prop is not loaded");
    const layout = layoutOf(board);
    const boardKit = KIT.mesh.build({
      id: "board",
      slot: 0,
      assetId: "board",
      asset: board,
      split: true,
    });
    const barsKit = KIT.bars.build({
      id: "bar",
      slot: 1,
      material: "bar",
      slots: layout.slots,
    });
    const cardKit = KIT.block.build({
      id: "card",
      slot: SLOTS + 1,
      material: "card",
      center: [layout.card.x, layout.card.y, layout.card.z],
      size: [CARD.width, CARD.height, CARD.depth],
    });
    // The board's own feet stand on the floor; the shadow grounds each (slot after the card).
    // The stand's two feet are its x extremes, FOOT wide, and its full depth.
    const stand = nodeBox(board, "board.stand");
    const feet: Box3[] = [
      [stand.min[0], 0, stand.min[2], stand.min[0] + FOOT, 0, stand.max[2]],
      [stand.max[0] - FOOT, 0, stand.min[2], stand.max[0], 0, stand.max[2]],
    ];
    const shadowKit = KIT.contactShadow.build({
      id: "shadow",
      slot: SLOTS + 2,
      bounds: boardKit.bounds,
      softness: 0.25,
      feet,
      // The feet are broad plates: a wider soft edge keeps them dark right along their sides.
      footSoftness: 0.18,
    });
    const parts = [...shadowKit.parts, ...boardKit.parts, ...barsKit.parts, ...cardKit.parts];
    const housing = nodeBox(board, "board.housing");
    // The header plate, centred high on the panel face.
    const header: [number, number, number] = [0, housing.max[1] - 0.14, housing.max[2]];
    const anchors: SceneAnchor[] = [
      { id: "board", part: "board.housing", local: header, priority: 1 },
      // Halfway up the tallest bar's right side, so the pill clears the bar's own word.
      { id: "bars", part: "bar.0", local: [0.5, 0, 0.5], priority: 3 },
      // The card's right edge, so the pill clears the word written above the card.
      { id: "rail", part: "card", local: [0.5, 0, 0.5], priority: 2 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    built.set(scene, {
      layout,
      bars: barsKit.parts as BlockPart[],
      card: cardKit.parts[0] as BlockPart,
    });
    const tags: SceneTags = {
      anchors: [
        ...Array.from({ length: SLOTS }, (_, i) => ({
          id: `word.${i}`,
          part: `bar.${i}`,
          local: [0, 0.5, 0.5] as [number, number, number],
          priority: 0,
        })),
        { id: "card", part: "card", local: [0, 0, 0.5], priority: 0 },
        { id: "no-counts", part: "board.housing", local: layout.middle, priority: 0 },
        // Just left of the card at rest, so the earlier words end where the card begins; they
        // stay on the rail while the card slides out and in.
        {
          id: "before",
          part: "board.rail",
          // A little above the card's middle: the smaller muted words then share its baseline.
          local: [
            layout.card.x - CARD.width * 0.62,
            layout.card.y + 0.012,
            layout.card.z + CARD.depth / 2,
          ],
          priority: 0,
        },
        { id: "header", part: "board.housing", local: header, priority: 0 },
      ],
      text: Array.from({ length: SLOTS + 4 }, () => ""),
      style: [
        ...Array.from({ length: SLOTS }, () => "above" as const),
        "onPart",
        "above",
        "before",
        "heading",
      ],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const { layout, bars, card: cardPart } = built.get(scene)!;
    const steps = run?.kind === "counts" ? run.steps : [];
    const typed = ui.text !== null;
    const pick = (channel: number | undefined) => stepAt(steps, typed, channel);
    const step = pick(tl.channels.barsWord ?? tl.channels.railWord);
    const onCard = pick(tl.channels.railWord);
    const growth = typed ? 1 : (tl.channels.bars ?? 1);
    const slide = typed ? 1 : (tl.channels.railSlide ?? 1);
    const flash = typed ? 0 : (tl.channels.topFlash ?? 0);

    for (let i = 0; i < SLOTS; i++) {
      const slot = layout.slots[i]!;
      const next = step?.next[i];
      const shown = next !== undefined;
      placeBar(bars[i]!.transform, slot, shown ? next.p * growth * slot.maxHeight : 0);
      frame.tags.text[i] = shown && growth > 0.05 ? `${named(next.word)}\n${share(next.p)}` : "";
      dynamics.intensity[1 + i] = i === 0 ? 1 + flash * FLASH_GAIN : 1;
    }

    const card = layout.card;
    const x = card.x + (1 - slide) * CARD_TRAVEL;
    placeCard(cardPart.transform, x, card.y, card.z);
    frame.tags.text[SLOTS] = onCard?.word ?? "";
    // A word the model never kept has no row: say so once the bars would have risen.
    const empty = step !== undefined && step.next.length === 0 && growth > 0.5;
    frame.tags.text[SLOTS + 1] = empty ? `never seen “${step.word}”: no counts` : "";
    frame.tags.text[SLOTS + 2] = onCard ? earlier(onCard.before) : "";
    // The bars are one row of the tally: the row for the word they were looked up after.
    frame.tags.text[SLOTS + 3] = step ? `After “${step.word}”…` : "";
  },
};
