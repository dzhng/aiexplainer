/**
 * One-part shorthands over the kit, for builders that place many single blocks and pipes: the
 * part itself rather than its `KitBuild`, so the builder can keep it and move it per frame.
 */
import { KIT, UNIT_SEGMENT, type BlockPart, type TubePart } from "@repo/renderer";
import type { Vec3 } from "math";

/** One `KIT.block`. */
export function box(
  id: string,
  slot: number,
  material: string,
  center: Vec3,
  size: Vec3,
  explode?: Vec3,
): BlockPart {
  return KIT.block.build({ id, slot, material, center, size, explode }).parts[0] as BlockPart;
}

/** A straight pipe the scene stretches every frame (`placeSegment`). */
export function segment(id: string, slot: number, material: string): TubePart {
  return KIT.tube.build({ id, slot, material, path: UNIT_SEGMENT, radius: 1 }).parts[0] as TubePart;
}
