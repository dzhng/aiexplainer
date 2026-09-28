/**
 * The `questionPanel` primitive (chapter 6): a standing panel with a grid of lamps, one per
 * MLP neuron shown, and a push pipe from each lamp to the token arrow that runs across in front
 * of the panel. The scene lights each lamp by its neuron's activation (dynamics
 * intensity, one slot per lamp) and sizes each pipe by its push with `placePush`, every frame.
 *
 * Slots: the housing, rim and legs share `slot`; lamp i is `slot + 1 + i`; push i is
 * `slot + 1 + count + i`. Parts: `<id>.housing`, `<id>.rim.{0-3}`, `<id>.leg.{0,1}`, `<id>.lamp.<i>`,
 * `<id>.push.<i>`. Anchors: `<id>` (the rim's top edge) and `<id>.lamps` (the first lamp).
 */
import { mat4, type Vec3 } from "math";
import type { BlockPart, Part, TubePart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";
import { placeSegment, UNIT_SEGMENT } from "./tube.ts";

export interface QuestionPanelParams extends KitCommon {
  /** Centre of the panel housing. */
  center: Vec3;
  cols: number;
  rows: number;
  /** Lamp centre spacing, metres. */
  pitch: number;
  lampSize: number;
  /** The token arrow the pushes land on: a line along X at this height and depth. */
  arrow: { y: number; z: number };
  materials: { housing: string; rim: string; lamp: string; push: string };
}

const HOUSING_DEPTH = 0.14;
const LAMP_DEPTH = 0.05;
/** Housing margin around the lamp grid, metres. */
const MARGIN = 0.22;

export function panelSize(p: QuestionPanelParams): { width: number; height: number } {
  return { width: p.cols * p.pitch + 2 * MARGIN, height: p.rows * p.pitch + 2 * MARGIN };
}

/** Lamp i's centre on the panel face; lamps fill rows left to right, top row first. */
export function lampCenter(p: QuestionPanelParams, i: number): Vec3 {
  const col = i % p.cols;
  const row = Math.floor(i / p.cols);
  return [
    p.center[0] + (col - (p.cols - 1) / 2) * p.pitch,
    p.center[1] + ((p.rows - 1) / 2 - row) * p.pitch,
    p.center[2] + HOUSING_DEPTH / 2 + LAMP_DEPTH / 2,
  ];
}

/**
 * Where push i leaves its lamp and where it lands on the arrow. The row nearest the arrow on
 * each side drops straight from its lamp's edge; rows further out run down the gutter left of
 * their column, so no pipe crosses another lamp.
 */
function pushEnds(p: QuestionPanelParams, i: number): { from: Vec3; to: Vec3 } {
  const [x, y, z] = lampCenter(p, i);
  const sign = y > p.arrow.y ? 1 : -1;
  // Rows between this lamp and the arrow.
  const between = Math.floor(Math.abs(y - p.arrow.y) / p.pitch - 0.5 + 1e-6);
  const face = z + LAMP_DEPTH / 2;
  if (between <= 0) {
    return { from: [x, y - (sign * p.lampSize) / 2, face], to: [x, p.arrow.y, p.arrow.z] };
  }
  const gutter = x - p.pitch / 2;
  return { from: [gutter, y, face], to: [gutter, p.arrow.y, p.arrow.z] };
}

/** Sizes push i: a pipe of `radius` from its lamp, reaching `reach` (0–1) of the way to the arrow. */
export function placePush(
  transform: number[],
  p: QuestionPanelParams,
  i: number,
  radius: number,
  reach: number,
): void {
  const { from, to } = pushEnds(p, i);
  for (let a = 0; a < 3; a++) to[a] = from[a]! + (to[a]! - from[a]!) * reach;
  placeSegment(transform, from, to, radius);
}

export const questionPanel: KitPrimitive<QuestionPanelParams> = {
  build(p) {
    const count = p.cols * p.rows;
    const { width, height } = panelSize(p);
    const [cx, cy, cz] = p.center;
    const housing: BlockPart = {
      kind: "block",
      id: `${p.id}.housing`,
      slot: p.slot,
      material: p.materials.housing,
      transform: [width, 0, 0, 0, 0, height, 0, 0, 0, 0, HOUSING_DEPTH, 0, cx, cy, cz, 1],
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "questionPanel",
    };
    // Two legs from the floor (y = 0) to the housing's underside.
    const legHeight = cy - height / 2;
    const legs: BlockPart[] = [-1, 1].map((side, i) => ({
      kind: "block",
      id: `${p.id}.leg.${i}`,
      slot: p.slot,
      material: p.materials.rim,
      transform: [
        0.08,
        0,
        0,
        0,
        0,
        legHeight,
        0,
        0,
        0,
        0,
        0.08,
        0,
        cx + side * (width / 2 - 0.12),
        legHeight / 2,
        cz,
        1,
      ],
      explode: p.explode,
      primitive: "questionPanel",
    }));
    const lamps: BlockPart[] = Array.from({ length: count }, (_, i) => {
      const [x, y, z] = lampCenter(p, i);
      return {
        kind: "block",
        id: `${p.id}.lamp.${i}`,
        slot: p.slot + 1 + i,
        material: p.materials.lamp,
        transform: [p.lampSize, 0, 0, 0, 0, p.lampSize, 0, 0, 0, 0, LAMP_DEPTH, 0, x, y, z, 1],
        explode: p.explode,
        primitive: "questionPanel",
      };
    });
    const pushes: TubePart[] = Array.from({ length: count }, (_, i) => {
      const part: TubePart = {
        kind: "tube",
        id: `${p.id}.push.${i}`,
        slot: p.slot + 1 + count + i,
        material: p.materials.push,
        path: UNIT_SEGMENT,
        radius: 1,
        transform: mat4.create(),
        explode: p.explode,
        primitive: "questionPanel",
      };
      placePush(part.transform, p, i, 0.02, 1);
      return part;
    });
    // A raised metal rim around the face, so the panel reads as a built instrument.
    const rim = 0.05;
    const faceZ = cz + HOUSING_DEPTH / 2 + 0.015;
    const rims: BlockPart[] = [
      [cx, cy + height / 2 - rim / 2, width, rim],
      [cx, cy - height / 2 + rim / 2, width, rim],
      [cx - width / 2 + rim / 2, cy, rim, height],
      [cx + width / 2 - rim / 2, cy, rim, height],
    ].map(([x, y, w, h], i) => ({
      kind: "block",
      id: `${p.id}.rim.${i}`,
      slot: p.slot,
      material: p.materials.rim,
      transform: [w!, 0, 0, 0, 0, h!, 0, 0, 0, 0, 0.03, 0, x!, y!, faceZ, 1],
      explode: p.explode,
      primitive: "questionPanel",
    }));
    const parts: Part[] = [housing, ...rims, ...legs, ...lamps, ...pushes];
    const reachDown = Math.min(p.arrow.y, cy - height / 2);
    const bounds = unionBounds([
      [cx - width / 2, 0, cz - HOUSING_DEPTH / 2, cx + width / 2, cy + height / 2, p.arrow.z],
      [cx - width / 2, reachDown, cz, cx + width / 2, cy, p.arrow.z],
    ]);
    return {
      parts,
      bounds,
      anchors: [
        // The housing's top edge, left of centre.
        { id: p.id, part: rims[0]!.id, local: [-0.3, 0.5, 0.5], priority: 2 },
        { id: `${p.id}.lamps`, part: lamps[0]!.id, local: [0, 0.5, 0.5], priority: 1 },
      ],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "questionPanel",
    slot: 0,
    center: [0, 1.2, 0],
    cols: 6,
    rows: 4,
    pitch: 0.3,
    lampSize: 0.2,
    arrow: { y: 1.2, z: 0.4 },
    materials: { housing: "housing", rim: "metal", lamp: "neuron", push: "bar" },
  }),
};
