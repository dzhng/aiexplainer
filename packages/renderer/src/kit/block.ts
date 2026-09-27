import type { Vec3 } from "math";
import type { BlockPart } from "../frame-input.ts";
import type { Geometry } from "./geometry.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";

/** Face normal n, then in-plane axes u and v with u × v = n, so faces wind CCW from outside. */
const FACES: [number[], number[], number[]][] = [
  [
    [1, 0, 0],
    [0, 0, -1],
    [0, 1, 0],
  ],
  [
    [-1, 0, 0],
    [0, 0, 1],
    [0, 1, 0],
  ],
  [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, -1],
  ],
  [
    [0, -1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ],
  [
    [0, 0, 1],
    [1, 0, 0],
    [0, 1, 0],
  ],
  [
    [0, 0, -1],
    [-1, 0, 0],
    [0, 1, 0],
  ],
];

/** The unit cube ([-0.5, 0.5]³) every block part instances. Flat normals, 24 vertices. */
export function blockGeometry(): Geometry {
  const positions = new Float32Array(24 * 3);
  const normals = new Float32Array(24 * 3);
  const indices = new Uint32Array(36);
  FACES.forEach(([n, u, v], face) => {
    for (let corner = 0; corner < 4; corner++) {
      const su = corner === 1 || corner === 2 ? 0.5 : -0.5;
      const sv = corner >= 2 ? 0.5 : -0.5;
      const i = (face * 4 + corner) * 3;
      for (let a = 0; a < 3; a++) {
        positions[i + a] = n[a]! * 0.5 + u[a]! * su + v[a]! * sv;
        normals[i + a] = n[a]!;
      }
    }
    const base = face * 4;
    indices.set([base, base + 1, base + 2, base, base + 2, base + 3], face * 6);
  });
  return { positions, normals, indices, bounds: [-0.5, -0.5, -0.5, 0.5, 0.5, 0.5] };
}

export interface BlockParams extends KitCommon {
  material: string;
  center: Vec3;
  size: Vec3;
}

/** The `block` primitive: one box. Its anchor is the centre of its top face. */
export const block: KitPrimitive<BlockParams> = {
  build(p) {
    const [x, y, z] = p.center;
    const [sx, sy, sz] = p.size;
    const part: BlockPart = {
      kind: "block",
      id: p.id,
      slot: p.slot,
      material: p.material,
      transform: [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1],
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "block",
    };
    return {
      parts: [part],
      bounds: [x - sx / 2, y - sy / 2, z - sz / 2, x + sx / 2, y + sy / 2, z + sz / 2],
      anchors: [{ id: p.id, part: p.id, local: [0, 0.5, 0], priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "block",
    slot: 0,
    material: "housing",
    center: [0, 0.5, 0],
    size: [1.2, 1, 0.8],
  }),
};
