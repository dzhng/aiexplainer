/**
 * The `dial` primitive (chapter 5's ClockDial): a clock face standing on each given point,
 * facing +z, with a tick at twelve o'clock and a hand. The scene turns each hand every frame
 * with `placeHand` (clockwise from twelve, radians), so the angle it shows is its own number.
 * Dial `i` is `<id>.<i>` (face), `<id>.<i>.tick` and `<id>.<i>.hand`, all in slot `slot + i`
 * (its glow).
 */
import type { Mat4, Vec3 } from "math";
import type { BlockPart, Part, TubePart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";

export interface DialParams extends KitCommon {
  /** Each dial's centre (the middle of its face's front). */
  centres: Vec3[];
  radius: number;
  faceMaterial: string;
  handMaterial: string;
}

/** The face's thickness, and the hand's and tick's sizes, as shares of the radius. */
const DIAL = { thickness: 0.18, handLength: 0.88, handWidth: 0.22, tick: 0.22 };

/**
 * Turns a hand `angle` radians clockwise from twelve o'clock on a dial of `radius` at
 * `centre`, just proud of its face (allocation-free; for per-frame updates).
 */
export function placeHand(transform: Mat4, centre: Vec3, radius: number, angle: number): void {
  const length = radius * DIAL.handLength;
  const width = radius * DIAL.handWidth;
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  // Columns: the hand's width axis, its length axis (pointing at the angle), its depth.
  transform[0] = c * width;
  transform[1] = -s * width;
  transform[2] = 0;
  transform[3] = 0;
  transform[4] = s * length;
  transform[5] = c * length;
  transform[6] = 0;
  transform[7] = 0;
  transform[8] = 0;
  transform[9] = 0;
  transform[10] = width * 0.5;
  transform[11] = 0;
  transform[12] = centre[0] + (s * length) / 2;
  transform[13] = centre[1] + (c * length) / 2;
  transform[14] = centre[2] + width * 0.3;
  transform[15] = 1;
}

export const dial: KitPrimitive<DialParams> = {
  build(p) {
    const r = p.radius;
    const parts: Part[] = p.centres.flatMap(([x, y, z], i): Part[] => {
      const face: TubePart = {
        kind: "tube",
        id: `${p.id}.${i}`,
        slot: p.slot + i,
        material: p.faceMaterial,
        path: [
          [x, y, z - r * DIAL.thickness],
          [x, y, z],
        ],
        radius: r,
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        explode: p.explode,
        cutaway: p.cutaway,
        primitive: "dial",
      };
      const block = (id: string): BlockPart => ({
        kind: "block",
        id,
        slot: p.slot + i,
        material: p.handMaterial,
        transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
        explode: p.explode,
        cutaway: p.cutaway,
        primitive: "dial",
      });
      const tick = block(`${p.id}.${i}.tick`);
      const t = r * DIAL.tick;
      tick.transform = [
        t * 0.4,
        0,
        0,
        0,
        0,
        t,
        0,
        0,
        0,
        0,
        t * 0.3,
        0,
        x,
        y + r - t / 2,
        z + t * 0.1,
        1,
      ];
      const hand = block(`${p.id}.${i}.hand`);
      placeHand(hand.transform, [x, y, z], r, 0);
      return [face, tick, hand];
    });
    return {
      parts,
      bounds: unionBounds(
        p.centres.map(([x, y, z]) => [
          x - r,
          y - r,
          z - r * DIAL.thickness,
          x + r,
          y + r,
          z + r * 0.2,
        ]),
      ),
      anchors: [{ id: p.id, part: parts[0]!.id, local: [...p.centres[0]!] as Vec3, priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "dial",
    slot: 0,
    centres: [0, 1, 2].map((i): Vec3 => [(i - 1) * 0.3, 0.2, 0]),
    radius: 0.1,
    faceMaterial: "card",
    handMaterial: "focusWord",
  }),
};
