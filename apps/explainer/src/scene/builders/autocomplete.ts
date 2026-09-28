/**
 * Chapter 0's scene, built from the kit (`mesh`, `bars`, `block`, `contactShadow`, `text`):
 * the counter board split into its nodes on a soft contact shadow, a count bar in each of its
 * slots, and the text as word cards on its rail. Bar heights are the real `nextWords` shares
 * for the last word; the slot and rail positions come from the prop's own nodes, so the
 * Blender script stays their only owner. The header plate names the lookup ("After “upon”…"),
 * so the bars read as that word's row of the tally; each slot's word is printed on the panel
 * above it and its share rides just above its bar. The rail holds the whole text: a dim card
 * per earlier word, and the last word on the lit card at the right end, the only word the
 * machine looks at. A text too long for the rail keeps its end, and its first card reads "…".
 * Every word is written on the board or a card (`kit/text.ts`), none floats over the scene.
 *
 * Loop channels read: `railWord` (which step's text is on the rail), `barsWord` (which step's
 * counts the bars show; it may lag the card), `railSlide` (0 → 1 as the lit card slides in;
 * a word the text just gained unfolds on its dim card meanwhile), `bars` (0 → 1 bar growth),
 * `topFlash` (glow on the tallest bar).
 * Typed text shows its word's bars at full height, without the loop's motion.
 */
import {
  KIT,
  placeBar,
  text,
  type BarSlot,
  type BlockPart,
  type MeshAsset,
  type SceneAnchor,
  type SceneDesc,
  type SceneText,
} from "@repo/renderer";
import type { NextWord } from "@repo/llm";
import type { Mat4 } from "math";
import type { Box3 } from "math/shapes";
import { share } from "../../chapters/format.ts";
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
/** Dim cards for the earlier words; a text with more keeps its end. */
const EARLIER = 12;
/** Bars are this share of their slot's width and depth, so the channel walls stay visible. */
const BAR_WIDTH = 0.72;
const BAR_DEPTH = 0.6;
/** Clearance above a slot's floor, metres; above the tallest bar its share still fits. */
const SLOT_MARGIN = 0.03;
const CARD = { width: 0.5, height: 0.12, depth: 0.02 };
/**
 * Font sizes (em), metres: the header plate's title, each slot's word and share, the lit
 * card's word, a dim card's word, and the note for a word with no counts.
 */
const TEXT = { header: 0.1, word: 0.07, share: 0.062, card: 0.078, dim: 0.068, note: 0.075 };
/** A card's words sit this far up its face (unit card): the rail's lip hides its lower edge. */
const CARD_TEXT_Y = 0.15;
/** The gap between a bar's top and its share, metres. */
const SHARE_GAP = 0.02;
/** The room kept above the tallest bar: the gap, the share's cap height and a margin. */
const SHARE_ROOM = SHARE_GAP + 0.9 * TEXT.share;
/** Air between neighbouring slots' words, metres. */
const WORD_MARGIN = 0.03;
/**
 * A dim card's width: its word's characters at the dim text's size (Inter's letters average
 * about 0.6 em), plus a margin, and never narrower than `min`. `gap` is the space between cards.
 */
const DIM_CARD = { perChar: 0.6 * TEXT.dim, margin: 0.09, min: 0.2, gap: 0.035 };
/** Where the text starts: clear of the rail's left end, metres. */
const RAIL_MARGIN = 0.1;
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
  /** Slot centre to slot centre, and each slot's top, metres. */
  pitch: number;
  slotTop: number;
  card: { x: number; y: number; z: number };
  /** The leftmost x a dim card may reach. */
  railStart: number;
  /** The middle of the slot row, on its front face: where "no counts" is written. */
  middle: [number, number, number];
  /** The header plate's face, centred: where the lookup is named. */
  header: [number, number, number];
  /** The panel face's height between the slots' tops and the header plate: each slot's word. */
  wordY: number;
  /** The panel face (behind the slots). */
  panelZ: number;
}

/** The scene's text, by what it names. */
interface Texts {
  words: SceneText[];
  shares: SceneText[];
  card: SceneText;
  noCounts: SceneText;
  header: SceneText;
  earlier: SceneText[];
}

/** The layout and the parts and text `update` moves, per built scene. */
const built = new WeakMap<
  SceneDesc,
  { layout: Layout; bars: BlockPart[]; card: BlockPart; earlier: BlockPart[]; text: Texts }
>();

function layoutOf(asset: MeshAsset): Layout {
  const slots = Array.from({ length: SLOTS }, (_, i) => {
    const b = nodeBox(asset, `board.slot.${i}`);
    return {
      x: (b.min[0] + b.max[0]) / 2,
      z: (b.min[2] + b.max[2]) / 2,
      floor: b.min[1] + SLOT_MARGIN,
      maxHeight: b.max[1] - b.min[1] - SLOT_MARGIN - SHARE_ROOM,
      width: (b.max[0] - b.min[0]) * BAR_WIDTH,
      depth: (b.max[2] - b.min[2]) * BAR_DEPTH,
    };
  });
  // The card stands on the rail's shelf at its right end, clear of the bars that are shown.
  const rail = nodeBox(asset, "board.rail");
  const housing = nodeBox(asset, "board.housing");
  const slot = nodeBox(asset, "board.slot.0");
  const first = slots[0]!;
  const last = slots[SLOTS - 1]!;
  // The header plate, centred high on the panel face (`counter_board.py`: 0.2 m tall, its
  // middle 0.14 m below the housing's top).
  const header: [number, number, number] = [0, housing.max[1] - 0.14, housing.max[2]];
  return {
    slots,
    pitch: slots[1]!.x - slots[0]!.x,
    slotTop: slot.max[1],
    header,
    wordY: (slot.max[1] + header[1] - 0.1) / 2,
    panelZ: slot.min[2],
    middle: [(first.x + last.x) / 2, first.floor + first.maxHeight / 2, first.z + first.depth],
    railStart: rail.min[0] + RAIL_MARGIN,
    card: {
      x: rail.max[0] - CARD.width / 2 - 0.08,
      y: rail.min[1] + CARD.height / 2 + 0.035,
      z: (rail.min[2] + rail.max[2]) / 2,
    },
  };
}

/** A card at `scale` of its full size (a dim card unfolds from nothing); 0 hides it. */
function placeCard(
  transform: Mat4,
  x: number,
  y: number,
  z: number,
  width = CARD.width,
  scale = 1,
) {
  const s = Math.max(scale, 1e-4);
  transform[0] = width * s;
  transform[5] = CARD.height * s;
  transform[10] = CARD.depth;
  transform[12] = x;
  transform[13] = y;
  transform[14] = z;
}

const dimWidth = (word: string) =>
  Math.max(DIM_CARD.min, word.length * DIM_CARD.perChar + DIM_CARD.margin);

/** A dim card on the rail: its word, its centre's x and its width. */
export interface DimCard {
  word: string;
  x: number;
  width: number;
}

/**
 * The earlier words' cards, laid right to left from the lit card. A text too long for the rail
 * (or for the `EARLIER` cards) keeps its end: the cards that do not fit give way to one reading
 * "…", which says the text goes on before it.
 */
export function earlierCards(
  words: readonly string[],
  layout: Pick<Layout, "card" | "railStart">,
): DimCard[] {
  const cards: DimCard[] = [];
  let right = layout.card.x - CARD.width / 2 - DIM_CARD.gap;
  const fits = (width: number) => right - width >= layout.railStart;
  for (let i = words.length - 1; i >= 0; i--) {
    const width = dimWidth(words[i]!);
    if (cards.length < EARLIER && fits(width)) {
      cards.push({ word: words[i]!, x: right - width / 2, width });
      right -= width + DIM_CARD.gap;
      continue;
    }
    const ellipsis = dimWidth("…");
    while (cards.length > 0 && (cards.length >= EARLIER || !fits(ellipsis))) {
      const dropped = cards.pop()!;
      right = dropped.x + dropped.width / 2;
    }
    cards.push({ word: "…", x: right - ellipsis / 2, width: ellipsis });
    break;
  }
  return cards.reverse();
}

export const autocomplete: SceneBuilder = {
  assets: { board: "/props/counter_board.glb" },

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
    // The earlier words' cards, built parked; `update` lays them out for the text.
    const earlierParts = Array.from(
      { length: EARLIER },
      (_, i) =>
        KIT.block.build({
          id: `earlier.${i}`,
          slot: SLOTS + 3,
          material: "cardDim",
          center: [layout.card.x, layout.card.y, layout.card.z],
          size: [1e-4, 1e-4, CARD.depth],
        }).parts[0] as BlockPart,
    );
    const parts = [
      ...shadowKit.parts,
      ...boardKit.parts,
      ...barsKit.parts,
      ...earlierParts,
      ...cardKit.parts,
    ];
    const anchors: SceneAnchor[] = [
      { id: "board", part: "board.housing", local: layout.header, priority: 1 },
      // Halfway up the tallest bar's right side, so the pill clears the bar's own word.
      { id: "bars", part: "bar.0", local: [0.5, 0, 0.5], priority: 3 },
      // The card's right edge, so the pill clears the word written above the card.
      { id: "rail", part: "card", local: [0.5, 0, 0.5], priority: 2 },
    ];
    // Each slot's word is printed on the panel above it, its share just above its bar (moved
    // by `update`), in the plane of the bar's face so the slot's walls never cut it.
    const texts: Texts = {
      words: layout.slots.map((slot, i) =>
        text({
          id: `word.${i}`,
          part: "board.housing",
          local: [slot.x, layout.wordY, layout.panelZ],
          size: TEXT.word,
          style: "chalk",
          maxWidth: layout.pitch - WORD_MARGIN,
        }),
      ),
      shares: layout.slots.map((slot, i) =>
        text({
          id: `share.${i}`,
          part: "board.housing",
          local: [slot.x, slot.floor, slot.z + slot.depth / 2],
          size: TEXT.share,
          style: "chalk",
          align: [0.5, 1],
        }),
      ),
      card: text({
        id: "card",
        part: "card",
        local: [0, CARD_TEXT_Y, 0.5],
        size: TEXT.card,
        style: "ink",
        maxWidth: CARD.width - 0.06,
      }),
      noCounts: text({
        id: "no-counts",
        part: "board.housing",
        local: layout.middle,
        size: TEXT.note,
        style: "chalk",
      }),
      header: text({
        id: "header",
        part: "board.housing",
        local: layout.header,
        size: TEXT.header,
        style: "sign",
      }),
      earlier: Array.from({ length: EARLIER }, (_, i) =>
        text({
          id: `earlier.${i}`,
          part: `earlier.${i}`,
          local: [0, CARD_TEXT_Y, 0.5],
          size: TEXT.dim,
          style: "muted",
        }),
      ),
    };
    const scene: SceneDesc = {
      revision,
      parts,
      anchors,
      assets,
      text: [
        texts.header,
        ...texts.words,
        ...texts.shares,
        texts.card,
        texts.noCounts,
        ...texts.earlier,
      ],
    };
    built.set(scene, {
      layout,
      bars: barsKit.parts as BlockPart[],
      card: cardKit.parts[0] as BlockPart,
      earlier: earlierParts,
      text: texts,
    });
    return scene;
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const { layout, bars, card: cardPart, earlier, text: texts } = built.get(scene)!;
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
      const height = shown ? next.p * growth * slot.maxHeight : 0;
      placeBar(bars[i]!.transform, slot, height);
      const labelled = shown && growth > 0.05;
      texts.words[i]!.text = labelled ? named(next.word) : "";
      texts.shares[i]!.text = labelled ? share(next.p) : "";
      // The share rides just above its bar's top, in the room its slot keeps for it.
      texts.shares[i]!.local[1] = slot.floor + height + SHARE_GAP;
      dynamics.intensity[1 + i] = i === 0 ? 1 + flash * FLASH_GAIN : 1;
    }

    const card = layout.card;
    const x = card.x + (1 - slide) * CARD_TRAVEL;
    placeCard(cardPart.transform, x, card.y, card.z);
    texts.card.text = onCard?.word ?? "";
    // A word the model never kept has no row: say so once the bars would have risen.
    const empty = step !== undefined && step.next.length === 0 && growth > 0.5;
    texts.noCounts.text = empty ? `never seen “${step.word}”: no counts` : "";
    // The bars are one row of the tally: the row for the word they were looked up after.
    texts.header.text = step ? `After “${step.word}”…` : "";

    // The earlier words stay put while the lit card slides. A word the text just gained (the
    // one the lit card last held) unfolds on its dim card as the new last word slides in.
    const cards = onCard ? earlierCards(onCard.before, layout) : [];
    const prev = onCard ? steps[steps.indexOf(onCard) - 1] : undefined;
    const gained = prev !== undefined && onCard!.before.at(-1) === prev.word;
    for (let i = 0; i < EARLIER; i++) {
      const dim = cards[i];
      const unfold = dim && gained && i === cards.length - 1 ? slide : 1;
      placeCard(
        earlier[i]!.transform,
        dim?.x ?? card.x,
        card.y,
        card.z,
        dim?.width,
        dim ? unfold : 0,
      );
      const label = texts.earlier[i]!;
      label.text = dim && unfold > 0.6 ? dim.word : "";
      label.maxWidth = dim ? dim.width - DIM_CARD.margin / 2 : undefined;
    }
  },
};
