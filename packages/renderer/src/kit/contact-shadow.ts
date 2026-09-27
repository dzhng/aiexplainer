/**
 * The `contactShadow` primitive: a soft dark footprint on the floor under a subject, built
 * from the subject's bounds, so machines stand on the floor instead of floating (there are
 * no real shadows). It is a flat quad whose per-vertex coverage (the geometry's `ao` lane)
 * falls off from a solid core to nothing at a rounded edge; it draws in the translucent
 * phase (depth read, no depth write) with a translucent `material`.
 */
import type { Box3 } from "math/shapes";
import type { ShadowPart } from "../frame-input.ts";
import type { Geometry } from "./geometry.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";

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
      const e = Math.min(1, Math.max(0, (r - 0.45) / 0.55));
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
  material?: string;
}

/** Lift off the floor so the shadow never z-fights it. */
const LIFT = 0.004;

export const contactShadow: KitPrimitive<ContactShadowParams> = {
  build(p) {
    const soft = p.softness ?? 0.35;
    const b = p.bounds;
    const sx = b[3] - b[0] + 2 * soft;
    const sz = b[5] - b[2] + 2 * soft;
    const cx = (b[0] + b[3]) / 2;
    const cz = (b[2] + b[5]) / 2;
    const y = b[1] + LIFT;
    const part: ShadowPart = {
      kind: "shadow",
      id: p.id,
      slot: p.slot,
      material: p.material ?? "shadow",
      transform: [sx, 0, 0, 0, 0, 1, 0, 0, 0, 0, sz, 0, cx, y, cz, 1],
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "contactShadow",
    };
    return {
      parts: [part],
      bounds: [cx - sx / 2, y, cz - sz / 2, cx + sx / 2, y, cz + sz / 2],
      anchors: [{ id: p.id, part: p.id, local: [0, 0, 0], priority: 0 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({ id: "contactShadow", slot: 0, bounds: [-1, 0, -0.5, 1, 1.2, 0.5] }),
};
