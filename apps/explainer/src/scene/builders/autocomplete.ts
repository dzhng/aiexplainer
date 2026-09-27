/**
 * Chapter 0's scene: the counter board, a count bar in each of its slots, and a word card on
 * its rail. Bar heights are the real `nextWords` shares for the word on the card; the slot and
 * rail positions come from the prop's own nodes, so the Blender script stays their only owner.
 *
 * Loop channels read: `railWord` (which step's word is on the card), `railSlide` (0 → 1 as
 * the card slides in), `bars` (0 → 1 bar growth), `topFlash` (glow on the tallest bar).
 * Typed text shows its word's bars at full height, without the loop's motion.
 */
import type { MeshAsset, Part, SceneAnchor, SceneDesc } from "@repo/renderer";
import type { Mat4 } from "math";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";

const SLOTS = 10;
/** Bars are this share of their slot's width and depth, so the channel walls stay visible. */
const BAR_WIDTH = 0.72;
const BAR_DEPTH = 0.6;
/** Clearance below the slot top and above its floor, metres. */
const SLOT_MARGIN = 0.03;
/** A bar with no count keeps a sliver of height (a zero scale has no normal matrix). */
const MIN_HEIGHT = 0.004;
const CARD = { width: 0.5, height: 0.12, depth: 0.02 };
/** How far right of its resting place the card starts its slide, metres. */
const CARD_TRAVEL = 1.4;
/** Extra glow on the tallest bar at the top of its flash. */
const FLASH_GAIN = 3;

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

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
  slots: { x: number; z: number; floor: number; maxHeight: number; width: number; depth: number }[];
  card: { x: number; y: number; z: number };
}

const layouts = new WeakMap<SceneDesc, Layout>();

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
  return {
    slots,
    card: {
      x: rail.max[0] - CARD.width / 2 - 0.08,
      y: rail.min[1] + CARD.height / 2 + 0.035,
      z: (rail.min[2] + rail.max[2]) / 2,
    },
  };
}

function place(
  transform: Mat4,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  transform[0] = sx;
  transform[5] = sy;
  transform[10] = sz;
  transform[12] = x;
  transform[13] = y;
  transform[14] = z;
}

function block(id: string, slot: number, material: string): Part {
  return { kind: "block", id, slot, material, transform: [...IDENTITY] as Mat4 };
}

/** "37%", "<1%": a share of the kept successors, readable at a glance. */
function share(p: number): string {
  const percent = Math.round(p * 100);
  return percent < 1 ? "<1%" : `${percent}%`;
}

export const autocomplete: SceneBuilder = {
  assets: { board: "/props/counter_board.glb" },
  tagCount: SLOTS + 1,

  create(assets, revision) {
    const board = assets.board;
    if (!board) throw new Error("autocomplete: the board prop is not loaded");
    const parts: Part[] = [
      {
        kind: "mesh",
        id: "board",
        slot: 0,
        asset: "board",
        transform: [...IDENTITY] as Mat4,
        explode: [0, 0, 0],
        cutaway: "clip",
      },
      ...Array.from({ length: SLOTS }, (_, i) => block(`bar.${i}`, 1 + i, "bar")),
      block("card", SLOTS + 1, "card"),
    ];
    const housing = nodeBox(board, "board.housing");
    const anchors: SceneAnchor[] = [
      // The header plate, centred high on the panel face.
      {
        id: "board",
        part: "board",
        local: [0, housing.max[1] - 0.14, housing.max[2]],
        priority: 1,
      },
      // Halfway up the tallest bar's right side, so the pill clears the bar's own word.
      { id: "bars", part: "bar.0", local: [0.5, 0, 0.5], priority: 3 },
      // The card's right edge, so the pill clears the word written above the card.
      { id: "rail", part: "card", local: [0.5, 0, 0.5], priority: 2 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    layouts.set(scene, layoutOf(board));
    const tags: SceneTags = {
      anchors: [
        ...Array.from({ length: SLOTS }, (_, i) => ({
          id: `word.${i}`,
          part: `bar.${i}`,
          local: [0, 0.5, 0.5] as [number, number, number],
          priority: 0,
        })),
        { id: "card", part: "card", local: [0, 0, 0.5], priority: 0 },
      ],
      text: Array.from({ length: SLOTS + 1 }, () => ""),
      emphasis: [...Array.from({ length: SLOTS }, () => false), true],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const layout = layouts.get(scene)!;
    const steps = run?.steps ?? [];
    const typed = ui.text !== null;
    const index = typed
      ? 0
      : Math.min(steps.length - 1, Math.max(0, Math.round(tl.channels.railWord ?? 0)));
    const step = steps[index];
    const growth = typed ? 1 : (tl.channels.bars ?? 1);
    const slide = typed ? 1 : (tl.channels.railSlide ?? 1);
    const flash = typed ? 0 : (tl.channels.topFlash ?? 0);

    for (let i = 0; i < SLOTS; i++) {
      const slot = layout.slots[i]!;
      const next = step?.next[i];
      const shown = next !== undefined && i < ui.slider;
      const height = shown ? Math.max(MIN_HEIGHT, next.p * growth * slot.maxHeight) : MIN_HEIGHT;
      place(
        scene.parts[1 + i]!.transform,
        slot.x,
        slot.floor + height / 2,
        slot.z,
        slot.width,
        height,
        slot.depth,
      );
      frame.tags.text[i] = shown && growth > 0.05 ? `${next.word}\n${share(next.p)}` : "";
      dynamics.intensity[1 + i] = i === 0 ? 1 + flash * FLASH_GAIN : 1;
    }

    const card = layout.card;
    const x = card.x + (1 - slide) * CARD_TRAVEL;
    place(
      scene.parts[1 + SLOTS]!.transform,
      x,
      card.y,
      card.z,
      CARD.width,
      CARD.height,
      CARD.depth,
    );
    frame.tags.text[SLOTS] = step?.word ?? "";
  },
};
