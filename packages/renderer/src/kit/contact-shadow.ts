/**
 * The `contactShadow` primitive: a soft dark footprint on the floor under a subject, built
 * from the subject's bounds, so machines stand on the floor instead of floating (there are
 * no real shadows). It is a flat quad whose per-vertex coverage (the geometry's `ao` lane)
 * falls off from a solid core to nothing at a rounded edge; it draws in the translucent
 * phase (depth read, no depth write) with a translucent `material`. A subject on legs names
 * its `feet`: each gets a tight footprint of its own, over a faint one under the whole body.
 */
import { clamp } from "math";
import type { Box3 } from "math/shapes";
import type { BlockPart, ShadowPart } from "../frame-input.ts";
import type { Geometry } from "./geometry.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";

/** Vertices per side of the quad; enough for a smooth falloff under interpolation. */
const SIDE = 17;

/**
 * The unit footprint ([-0.5, 0.5] in x and z, at y = 0, facing up). Coverage is 1 inside a
 * rounded core and eases to 0 at the edge (a superellipse, so the corners stay soft).
 */
export function shadowGeometry(): Geometry {
  const n = SIDE * SIDE;
  const positions = new Float32Array(n * 3);
  const normals = new Float32Array(n * 3);
  const ao = new Float32Array(n);
  for (let j = 0; j < SIDE; j++)
    for (let i = 0; i < SIDE; i++) {
      const k = j * SIDE + i;
      const x = i / (SIDE - 1) - 0.5;
      const z = j / (SIDE - 1) - 0.5;
      positions.set([x, 0, z], k * 3);
      normals.set([0, 1, 0], k * 3);
      const r = Math.pow(Math.pow(Math.abs(2 * x), 4) + Math.pow(Math.abs(2 * z), 4), 0.25);
      const e = clamp((r - 0.45) / 0.55, 0, 1);
      ao[k] = 1 - e * e * (3 - 2 * e);
    }
  const indices = new Uint32Array((SIDE - 1) * (SIDE - 1) * 6);
  let o = 0;
  for (let j = 0; j + 1 < SIDE; j++)
    for (let i = 0; i + 1 < SIDE; i++) {
      const a = j * SIDE + i;
      // Counter-clockwise seen from above (+y).
      indices.set([a, a + SIDE, a + 1, a + 1, a + SIDE, a + SIDE + 1], o);
      o += 6;
    }
  return { positions, normals, ao, indices, bounds: [-0.5, 0, -0.5, 0.5, 0, 0.5] };
}

export interface ContactShadowParams extends KitCommon {
  /** The subject's world bounds (Whole view); the shadow lies under their footprint. */
  bounds: Box3;
  /** How far the soft edge reaches past the footprint, metres. */
  softness?: number;
  /**
   * Where the subject touches the floor (legs, posts, feet, wheels), as world boxes. Given
   * these, each contact gets its own tight dark footprint (`<id>.<n>`), and the footprint
   * under the whole body turns into a faint ambient darkening (`ambientMaterial`), so a table
   * reads as four legs on the floor rather than one slab-shaped blob.
   */
  feet?: Box3[];
  /** How far each foot's soft edge reaches past it, metres. */
  footSoftness?: number;
  material?: string;
  ambientMaterial?: string;
}

/** Where a floor-standing block (a leg, a post, a box) meets the floor: its own box. */
export function blockFootprint(part: BlockPart): Box3 {
  const t = part.transform;
  const [x, y, z] = [t[12]!, t[13]!, t[14]!];
  const [hx, hy, hz] = [t[0]! / 2, t[5]! / 2, t[10]! / 2];
  return [x - hx, y - hy, z - hz, x + hx, y + hy, z + hz];
}

/** Lift off the floor so the shadow never z-fights it; feet sit a hair above the body's. */
const LIFT = 0.004;
const FOOT_LIFT = 0.006;

function footprint(
  id: string,
  p: ContactShadowParams,
  b: Box3,
  soft: number,
  y: number,
  material: string,
): ShadowPart {
  const sx = b[3] - b[0] + 2 * soft;
  const sz = b[5] - b[2] + 2 * soft;
  return {
    kind: "shadow",
    id,
    slot: p.slot,
    material,
    transform: [sx, 0, 0, 0, 0, 1, 0, 0, 0, 0, sz, 0, (b[0] + b[3]) / 2, y, (b[2] + b[5]) / 2, 1],
    primitive: "contactShadow",
  };
}

export const contactShadow: KitPrimitive<ContactShadowParams> = {
  build(p) {
    const feet = p.feet ?? [];
    const floor = p.bounds[1];
    const shadow = p.material ?? "shadow";
    const body = footprint(
      p.id,
      p,
      p.bounds,
      p.softness ?? 0.35,
      floor + LIFT,
      feet.length ? (p.ambientMaterial ?? "shadowAmbient") : shadow,
    );
    const contacts = feet.map((foot, i) =>
      footprint(`${p.id}.${i}`, p, foot, p.footSoftness ?? 0.06, floor + FOOT_LIFT, shadow),
    );
    const parts = [body, ...contacts];
    const bounds = unionBounds(
      parts.map(
        ({ transform: t }): Box3 => [
          t[12]! - t[0]! / 2,
          t[13]!,
          t[14]! - t[10]! / 2,
          t[12]! + t[0]! / 2,
          t[13]!,
          t[14]! + t[10]! / 2,
        ],
      ),
    );
    return {
      parts,
      bounds,
      anchors: [{ id: p.id, part: p.id, local: [0, 0, 0], priority: 0 }],
    };
  },
  example: () => ({
    id: "contactShadow",
    slot: 0,
    bounds: [-1, 0, -0.5, 1, 1.2, 0.5],
    feet: [
      [-0.95, 0, -0.45, -0.85, 0.7, -0.35],
      [0.85, 0, -0.45, 0.95, 0.7, -0.35],
      [-0.95, 0, 0.35, -0.85, 0.7, 0.45],
      [0.85, 0, 0.35, 0.95, 0.7, 0.45],
    ],
  }),
};
