/**
 * The `sealed` primitive (chapter 4's SealedCap): from each source point, a short stub of pipe
 * rising straight up, the way every pipe starts, shut by a wider flat cap. It reads as a pipe
 * that is there but blocked, not missing or broken. Stub `i` is `<id>.<i>` (in the pipes'
 * `material`) and its cap `<id>.<i>.cap` (in `capMaterial`), both in dynamics slot `slot + i`,
 * so a scene brings each one in with `widthScale` (0 → 1).
 */
import { vec3, type Vec3 } from "math";
import type { TubePart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";
import { tubeGeometry } from "./tube.ts";

export interface SealedParams extends KitCommon {
  /** The stub's material (the pipes'), and the cap's. */
  material: string;
  capMaterial: string;
  /** Where each sealed stub starts. */
  sources: Vec3[];
  /** Stub radius; the cap is `CAP.radius` times wider. */
  radius: number;
  /** The stub's height, metres. */
  length?: number;
}

/** The cap: this much wider than its stub, and this thick (× the stub radius). */
const CAP = { radius: 2.4, thickness: 1.4 };
const DEFAULT_LENGTH = 0.085;

/** Each stub's centreline and its cap's: straight up from the source, then a flat disc. */
export function sealedPaths(
  sources: Vec3[],
  radius: number,
  length = DEFAULT_LENGTH,
): { stub: Vec3[]; cap: Vec3[] }[] {
  const half = (radius * CAP.thickness) / 2;
  return sources.map(([x, y, z]) => ({
    stub: [
      [x, y, z],
      [x, y + length, z],
    ],
    cap: [
      [x, y + length - half, z],
      [x, y + length + half, z],
    ],
  }));
}

export const sealed: KitPrimitive<SealedParams> = {
  build(p) {
    const tube = (
      id: string,
      slot: number,
      material: string,
      path: Vec3[],
      radius: number,
    ): TubePart => ({
      kind: "tube",
      id,
      slot,
      material,
      path,
      radius,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "sealed",
    });
    const parts = sealedPaths(p.sources, p.radius, p.length).flatMap(({ stub, cap }, i) => [
      tube(`${p.id}.${i}`, p.slot + i, p.material, stub, p.radius),
      tube(`${p.id}.${i}.cap`, p.slot + i, p.capMaterial, cap, p.radius * CAP.radius),
    ]);
    const cap = parts[1]!;
    return {
      parts,
      bounds: unionBounds(parts.map((part) => tubeGeometry(part.path, part.radius).bounds)),
      anchors: [
        {
          id: p.id,
          part: cap.id,
          local: vec3.lerp([0, 0, 0], cap.path[0]!, cap.path[1]!, 0.5),
          priority: 1,
        },
      ],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "sealed",
    slot: 0,
    material: "pipe",
    capMaterial: "sealed",
    sources: Array.from({ length: 3 }, (_, i): Vec3 => [(i - 1) * 0.12, 0, 0]),
    radius: 0.02,
  }),
};
