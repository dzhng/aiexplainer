/**
 * The `pins` primitive (chapter 2's PinField): pins stuck in a floor map, each a needle
 * standing on the map with a round head at its point, and an arrow from a shared origin to
 * each head. Every pin has its own dynamics slot (a head can glow alone). All heads and all
 * arrows are the same unit tube placed by their transforms, so each draws as one instanced
 * draw, whatever the number of pins. Scenes move pins every frame with `placePin`; its anchor
 * is the first pin's head.
 */
import { type Mat4, type Vec3, mat4 } from "math";
import type { BlockPart, Part, TubePart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive, PARKED_Y } from "./primitive.ts";

/** Pin proportions, metres. */
const PIN = {
  headRadius: 0.032,
  headHeight: 0.028,
  needle: 0.009,
  arrowRadius: 0.0045,
} as const;

/** Unit paths: one unit up +y (heads, radius 1, scaled to size) and along +x (arrows, at their own radius). */
const UP: Vec3[] = [
  [0, 0, 0],
  [0, 1, 0],
];
const ALONG: Vec3[] = [
  [0, 0, 0],
  [1, 0, 0],
];

/** Parts per pin, in build order: head, needle, arrow. */
export const PIN_PARTS = 3;

export interface PinFieldParams extends KitCommon {
  /** Where the pins stand as built (their heads); one pin each. */
  heads: Vec3[];
  /** Height of the map's surface, where every needle stands. */
  floor: number;
  /** Where every arrow starts. */
  origin: Vec3;
  headMaterial: string;
  needleMaterial: string;
  arrowMaterial: string;
  /** One dynamics slot for every arrow (they glow together); by default each pin's own. */
  arrowSlot?: number;
}

/**
 * Places pin `i` of a built field (`parts` as `build` returned them): its head at `head`
 * (null parks the pin out of sight), its needle down to `floor`, and its arrow from `origin`
 * grown to `arrow` (0 none, 1 reaching the head). Allocation-free.
 */
export function placePin(
  parts: readonly Part[],
  i: number,
  head: Vec3 | null,
  floor: number,
  origin: Vec3,
  arrow: number,
): void {
  const [h, n, a] = [0, 1, 2].map((k) => parts[i * PIN_PARTS + k]!.transform) as [Mat4, Mat4, Mat4];
  if (!head) {
    for (const t of [h, n, a]) axes(t, 1e-4, 0, 0, 0, 1e-4, 0, 0, 0, 1e-4, 0, PARKED_Y, 0);
    return;
  }
  const [x, y, z] = head;
  const r = PIN.headRadius;
  axes(h, r, 0, 0, 0, PIN.headHeight, 0, 0, 0, r, x, y - PIN.headHeight / 2, z);
  const tall = Math.max(1e-4, y - floor);
  axes(n, PIN.needle, 0, 0, 0, tall, 0, 0, 0, PIN.needle, x, floor + tall / 2, z);
  // The arrow: the unit tube's +x axis along origin → head, its cross-section kept round.
  const dx = x - origin[0];
  const dy = y - origin[1];
  const dz = z - origin[2];
  const length = Math.hypot(dx, dy, dz);
  const grow = Math.max(1e-4, Math.min(1, arrow));
  if (length < 1e-6 || arrow <= 0) {
    axes(a, 1e-4, 0, 0, 0, 1e-4, 0, 0, 0, 1e-4, 0, PARKED_Y, 0);
    return;
  }
  const fx = dx / length;
  const fy = dy / length;
  const fz = dz / length;
  // A unit vector not parallel to the arrow, then two perpendiculars by cross products.
  const [sx, sy, sz] = Math.abs(fy) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  let ux = fy * sz - fz * sy;
  let uy = fz * sx - fx * sz;
  let uz = fx * sy - fy * sx;
  const un = Math.hypot(ux, uy, uz);
  ux /= un;
  uy /= un;
  uz /= un;
  const wx = fy * uz - fz * uy;
  const wy = fz * ux - fx * uz;
  const wz = fx * uy - fy * ux;
  const s = length * grow;
  // The cross-section stays unscaled (the part carries the arrow radius), so label occlusion
  // treats the arrow as the thin tube it is.
  axes(a, fx * s, fy * s, fz * s, ux, uy, uz, wx, wy, wz, ...origin);
}

/** Writes a transform from its three column axes and a translation. */
function axes(
  t: Mat4,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
  cx: number,
  cy: number,
  cz: number,
  x: number,
  y: number,
  z: number,
): void {
  t[0] = ax;
  t[1] = ay;
  t[2] = az;
  t[3] = 0;
  t[4] = bx;
  t[5] = by;
  t[6] = bz;
  t[7] = 0;
  t[8] = cx;
  t[9] = cy;
  t[10] = cz;
  t[11] = 0;
  t[12] = x;
  t[13] = y;
  t[14] = z;
  t[15] = 1;
}

export const pins: KitPrimitive<PinFieldParams> = {
  build(p) {
    const common = { primitive: "pins" };
    const parts: Part[] = p.heads.flatMap((_, i) => {
      const slot = p.slot + i;
      const id = `${p.id}.${i}`;
      const head: TubePart = {
        ...common,
        kind: "tube",
        id: `${id}.head`,
        slot,
        material: p.headMaterial,
        path: UP,
        radius: 1,
        transform: mat4.create(),
      };
      const needle: BlockPart = {
        ...common,
        kind: "block",
        id: `${id}.needle`,
        slot,
        material: p.needleMaterial,
        transform: mat4.create(),
      };
      const arrow: TubePart = {
        ...common,
        kind: "tube",
        id: `${id}.arrow`,
        slot: p.arrowSlot ?? slot,
        material: p.arrowMaterial,
        path: ALONG,
        radius: PIN.arrowRadius,
        transform: mat4.create(),
      };
      return [head, needle, arrow];
    });
    p.heads.forEach((head, i) => placePin(parts, i, head, p.floor, p.origin, 1));
    const r = PIN.headRadius;
    return {
      parts,
      bounds: unionBounds([
        ...p.heads.map(([x, y, z]) => [
          x - r,
          p.floor,
          z - r,
          x + r,
          y + PIN.headHeight / 2,
          z + r,
        ]),
        [...p.origin, ...p.origin],
      ] as [number, number, number, number, number, number][]),
      anchors: [{ id: p.id, part: `${p.id}.0.head`, local: [0, 1, 0], priority: 1 }],
    };
  },
  example: () => ({
    id: "pins",
    slot: 0,
    heads: [
      [-0.5, 0.45, 0.1],
      [-0.35, 0.5, 0.2],
      [0.4, 0.3, -0.2],
      [0.2, 0.62, 0.3],
      [0.55, 0.38, 0.05],
    ],
    floor: 0,
    origin: [0, 0.2, 0],
    headMaterial: "pin",
    needleMaterial: "metal",
    arrowMaterial: "arrow",
  }),
};
