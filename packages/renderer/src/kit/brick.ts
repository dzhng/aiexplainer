/**
 * The `brick` primitive (chapter 1's TokenBrick): a toy building brick, a body block with a
 * row of round studs on top, one stud per `unit` of length. A scene writes the brick's piece
 * of text on its face (scene text), and resizes and moves bricks every frame with
 * `placeBrick`: a brick built with room for `studs` studs can show any length up to that, and
 * the studs past its length shrink away. Every stud is the same unit tube, placed by its
 * transform, so all studs in a scene draw as one instanced draw. All of a brick's parts share
 * its dynamics slot, so it glows as one piece. Its anchor is the centre of its face.
 */
import { type Vec3, mat4 } from "math";
import type { BlockPart, Part, TubePart } from "../frame-input.ts";
import { type KitCommon, type KitPrimitive, PARKED_Y } from "./primitive.ts";

/** Brick proportions, as fractions of one unit (a toy brick is 9.6 mm tall on an 8 mm pitch). */
export const BRICK = {
  height: 1.2,
  studRadius: 0.3,
  studHeight: 0.2,
} as const;

/** The unit stud every brick instances: radius 1, height 1, base at the origin. */
const STUD_PATH: Vec3[] = [
  [0, 0, 0],
  [0, 1, 0],
];

/** A stud not in use: far below the room, at a sliver of size (a zero scale has no normal). */

export interface BrickParams extends KitCommon {
  material: string;
  /** Centre of the body. */
  center: Vec3;
  /** The length of one stud's pitch, metres; the brick is `unit` deep and 1.2 `unit` tall. */
  unit: number;
  /** Length in units as built. */
  length: number;
  /** Studs built: the longest this brick can become. */
  studs: number;
}

export interface BrickPlacement {
  center: Vec3;
  unit: number;
  /** Length in units; may be fractional (a brick sliding between lengths). */
  length: number;
}

/**
 * Places a built brick's parts (as `build` returned them: body, then studs) for `placement`.
 * Allocation-free: it writes each part's transform in place.
 */
export function placeBrick(parts: readonly Part[], placement: BrickPlacement): void {
  const { center, unit, length } = placement;
  const [x, y, z] = center;
  const width = length * unit;
  const height = BRICK.height * unit;
  setBox(parts[0]!.transform, x, y, z, width, height, unit);
  const r = BRICK.studRadius * unit;
  const h = BRICK.studHeight * unit;
  const shown = Math.max(1, Math.round(length));
  for (let k = 1; k < parts.length; k++) {
    const t = parts[k]!.transform;
    if (k - 1 < shown) {
      // Evenly along the top; the unit stud's base sits on the body's top face.
      const sx = x - width / 2 + (width / shown) * (k - 0.5);
      setBox(t, sx, y + height / 2, z, r, h, r);
    } else setBox(t, x, PARKED_Y, z, 1e-4, 1e-4, 1e-4);
  }
}

/** A scale-and-translate transform (no rotation), written in place. */
function setBox(t: number[], x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  t.fill(0);
  t[0] = sx;
  t[5] = sy;
  t[10] = sz;
  t[12] = x;
  t[13] = y;
  t[14] = z;
  t[15] = 1;
}

export const brick: KitPrimitive<BrickParams> = {
  build(p) {
    const common = { slot: p.slot, explode: p.explode, cutaway: p.cutaway, primitive: "brick" };
    const body: BlockPart = {
      ...common,
      transform: mat4.create(),
      kind: "block",
      id: p.id,
      material: p.material,
    };
    const studs: TubePart[] = Array.from({ length: p.studs }, (_, k) => ({
      ...common,
      transform: mat4.create(),
      kind: "tube",
      id: `${p.id}.stud.${k}`,
      material: p.material,
      path: STUD_PATH,
      radius: 1,
    }));
    const parts: Part[] = [body, ...studs];
    placeBrick(parts, { center: p.center, unit: p.unit, length: p.length });
    const [x, y, z] = p.center;
    const half = [(p.length * p.unit) / 2, (BRICK.height * p.unit) / 2, p.unit / 2];
    return {
      parts,
      bounds: [
        x - half[0]!,
        y - half[1]!,
        z - half[2]!,
        x + half[0]!,
        y + half[1]! + BRICK.studHeight * p.unit,
        z + half[2]!,
      ],
      anchors: [{ id: p.id, part: p.id, local: [0, 0, 0.5], priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "brick",
    slot: 0,
    material: "brickEarly",
    center: [0, 0.3, 0],
    unit: 0.25,
    length: 4,
    studs: 4,
  }),
};
