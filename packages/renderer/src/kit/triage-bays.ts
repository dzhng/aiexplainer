/**
 * The `triageBays` primitive (chapter 14's TriageBays): a row of expert bays behind a router
 * desk, like a hospital's triage desk and its treatment bays. Each bay is an open booth (back
 * wall, two side walls, a floor) with a lamp strip across its top; every bay's lamp has its own
 * dynamics slot, so a scene lights exactly the bays a token goes to. Its anchor is the top of
 * the desk.
 */
import type { Mat4, Vec3 } from "math";
import type { BlockPart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";

export interface TriageBaysParams extends KitCommon {
  /** Centre of the row of bays, on the floor. */
  center: Vec3;
  bays: number;
  /** One bay's inside width, height and depth, and the gap between bays, metres. */
  bay: Vec3;
  gap: number;
  /** The router desk: its size, and where it stands relative to the row's centre (x, z). */
  desk: Vec3;
  deskAt: [number, number];
  /** Materials: the booths, their walls, the desk, and the lamps. */
  materials: { booth: string; wall: string; desk: string; lamp: string };
}

const WALL = 0.03;
const LAMP_H = 0.05;

/** Slots, relative to `slot`: booths and walls share one, the desk one, then one lamp per bay. */
export const TRIAGE_SLOTS = { booths: 0, desk: 1, lamps: 2 } as const;

/** Centre of bay `i`'s floor. */
export function bayCenter(
  p: Pick<TriageBaysParams, "center" | "bays" | "bay" | "gap">,
  i: number,
): Vec3 {
  const pitch = p.bay[0] + p.gap;
  return [p.center[0] + (i - (p.bays - 1) / 2) * pitch, p.center[1], p.center[2]];
}

/** Centre of the desk. */
export function deskCenter(p: Pick<TriageBaysParams, "center" | "desk" | "deskAt">): Vec3 {
  return [p.center[0] + p.deskAt[0], p.center[1] + p.desk[1] / 2, p.center[2] + p.deskAt[1]];
}

const box = (c: readonly number[], s: readonly number[]): Mat4 => [
  s[0]!,
  0,
  0,
  0,
  0,
  s[1]!,
  0,
  0,
  0,
  0,
  s[2]!,
  0,
  c[0]!,
  c[1]!,
  c[2]!,
  1,
];

export const triageBays: KitPrimitive<TriageBaysParams> = {
  build(p) {
    const parts: BlockPart[] = [];
    const add = (id: string, slot: number, material: string, c: Vec3, s: Vec3) => {
      parts.push({
        kind: "block",
        id,
        slot: p.slot + slot,
        material,
        transform: box(c, s),
        explode: p.explode,
        cutaway: p.cutaway,
        primitive: "triageBays",
      });
      return [
        c[0] - s[0] / 2,
        c[1] - s[1] / 2,
        c[2] - s[2] / 2,
        c[0] + s[0] / 2,
        c[1] + s[1] / 2,
        c[2] + s[2] / 2,
      ] as [number, number, number, number, number, number];
    };
    const [w, h, d] = p.bay;
    const boxes = [];
    for (let i = 0; i < p.bays; i++) {
      const [x, y, z] = bayCenter(p, i);
      const id = `${p.id}.bay.${i}`;
      boxes.push(
        add(id, TRIAGE_SLOTS.booths, p.materials.booth, [x, y + h / 2, z - d / 2], [w, h, WALL]),
      );
      for (const side of [-1, 1])
        boxes.push(
          add(
            `${id}.wall.${side < 0 ? "l" : "r"}`,
            TRIAGE_SLOTS.booths,
            p.materials.wall,
            [x + side * (w / 2 + WALL / 2), y + h / 2, z],
            [WALL, h, d],
          ),
        );
      boxes.push(
        add(
          `${id}.floor`,
          TRIAGE_SLOTS.booths,
          p.materials.wall,
          [x, y + WALL / 2, z],
          [w, WALL, d],
        ),
      );
      boxes.push(
        add(
          `${id}.lamp`,
          TRIAGE_SLOTS.lamps + i,
          p.materials.lamp,
          [x, y + h - LAMP_H / 2, z + d / 2 - WALL],
          [w * 0.9, LAMP_H, WALL],
        ),
      );
    }
    boxes.push(add(`${p.id}.desk`, TRIAGE_SLOTS.desk, p.materials.desk, deskCenter(p), p.desk));
    return {
      parts,
      bounds: unionBounds(boxes),
      anchors: [{ id: p.id, part: `${p.id}.desk`, local: [0, 0.5, 0.5], priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "triage",
    slot: 0,
    center: [0, 0, 0],
    bays: 8,
    bay: [0.5, 0.9, 0.5],
    gap: 0.06,
    desk: [0.9, 0.85, 0.45],
    deskAt: [0, 1.1],
    materials: { booth: "housing", wall: "metal", desk: "steel", lamp: "bar" },
  }),
};
