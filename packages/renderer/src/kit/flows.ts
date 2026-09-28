/**
 * The `flows` primitive (chapter 4's FlowPulses): a sleeve over each given pipe path, drawn
 * only where a flow pulse is (a material with `pulses`), so light travels along the pipe.
 * Sleeve `i` is `<id>.<i>` in dynamics slot `slot + i`: its `flowPhase` moves the pulses (in
 * pulse spacings; speed and spacing are look tokens), its `widthScale` follows the pipe's width
 * and its `intensity` sets how bright they are. The sleeve is a little wider than its pipe, so
 * the pulses wrap the pipe's surface.
 */
import { vec3, type Vec3, mat4 } from "math";
import type { TubePart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";
import { tubeGeometry } from "./tube.ts";

export interface FlowsParams extends KitCommon {
  /** A material with `pulses` (and opacity < 1). */
  material: string;
  /** The pipes' centrelines, in the direction the flow runs. */
  paths: Vec3[][];
  /** The pipes' radius at widthScale 1. */
  radius: number;
}

/** A sleeve is this much wider than the pipe it wraps. */
const SLEEVE = 1.12;

export const flows: KitPrimitive<FlowsParams> = {
  build(p) {
    const parts: TubePart[] = p.paths.map((path, i) => ({
      kind: "tube",
      id: `${p.id}.${i}`,
      slot: p.slot + i,
      material: p.material,
      path,
      radius: p.radius * SLEEVE,
      transform: mat4.create(),
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "flows",
    }));
    const first = parts[0]!.path;
    return {
      parts,
      bounds: unionBounds(parts.map((part) => tubeGeometry(part.path, part.radius).bounds)),
      anchors: [
        {
          id: p.id,
          part: parts[0]!.id,
          local: vec3.clone(first[Math.floor(first.length / 2)]!),
          priority: 1,
        },
      ],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "flows",
    slot: 0,
    material: "pulse",
    paths: [0, 1, 2].map((i) => [
      [(i - 1) * 0.5, 0, 0] as Vec3,
      [(i - 1) * 0.5, 0.6, 0] as Vec3,
      [(i - 1) * 0.2, 1.1, 0] as Vec3,
    ]),
    radius: 0.06,
  }),
};
