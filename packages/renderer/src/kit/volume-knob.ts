/**
 * The `volumeKnob` primitive (chapter 7): a round dial on a station's face with a pointer the
 * scene turns (`placeKnob`) to show how far that station turns its input down. Angle 0 points
 * straight up; positive turns clockwise as seen from the front (+Z).
 *
 * Slots: the dial is `slot`, the pointer `slot + 1`. Parts: `<id>.dial`, `<id>.pointer`.
 * Anchor: `<id>` on the dial's rim.
 */
import { mat4, type Vec3 } from "math";
import type { BlockPart, TubePart } from "../frame-input.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";
import { placeSegment, UNIT_SEGMENT } from "./tube.ts";

export interface VolumeKnobParams extends KitCommon {
  /** Centre of the dial's back face, on the surface it is mounted to (facing +Z). */
  center: Vec3;
  radius: number;
  materials: { dial: string; pointer: string };
}

const DIAL_DEPTH = 0.05;

/** Turns the pointer to `angle` radians (0 up, positive clockwise from the front). */
export function placeKnob(transform: number[], p: VolumeKnobParams, angle: number): void {
  const length = p.radius * 0.8;
  const width = p.radius * 0.22;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Local Y (the pointer's length) points (sin, cos) in the face plane; X is its width.
  transform[0] = c * width;
  transform[1] = -s * width;
  transform[2] = 0;
  transform[4] = s * length;
  transform[5] = c * length;
  transform[6] = 0;
  transform[8] = 0;
  transform[9] = 0;
  transform[10] = 0.02;
  transform[12] = p.center[0] + (s * length) / 2;
  transform[13] = p.center[1] + (c * length) / 2;
  transform[14] = p.center[2] + DIAL_DEPTH + 0.01;
}

export const volumeKnob: KitPrimitive<VolumeKnobParams> = {
  build(p) {
    const [x, y, z] = p.center;
    const dial: TubePart = {
      kind: "tube",
      id: `${p.id}.dial`,
      slot: p.slot,
      material: p.materials.dial,
      path: UNIT_SEGMENT,
      radius: 1,
      transform: mat4.create(),
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "volumeKnob",
    };
    placeSegment(dial.transform, [x, y, z], [x, y, z + DIAL_DEPTH], p.radius);
    const pointer: BlockPart = {
      kind: "block",
      id: `${p.id}.pointer`,
      slot: p.slot + 1,
      material: p.materials.pointer,
      transform: mat4.create(),
      explode: p.explode,
      primitive: "volumeKnob",
    };
    placeKnob(pointer.transform, p, 0);
    const r = p.radius;
    return {
      parts: [dial, pointer],
      bounds: [x - r, y - r, z, x + r, y + r, z + DIAL_DEPTH + 0.03],
      // The rim at the top-right, in the unit segment's frame (+Y runs out of the face).
      anchors: [{ id: p.id, part: dial.id, local: [0.7, 1, 0.7], priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "volumeKnob",
    slot: 0,
    center: [0, 0.5, 0],
    radius: 0.3,
    materials: { dial: "housing", pointer: "indicator" },
  }),
};
