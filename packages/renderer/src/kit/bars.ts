/**
 * The `bars` primitive: a row of bar blocks standing in slots, one dynamics slot each, for
 * a value per bar (chapter 0's counts). It builds them at `values` (or empty); the scene
 * sets each bar's height every frame with `placeBar`. Its anchor is on the first bar.
 */
import { type Vec3, mat4 } from "math";
import type { BlockPart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";

export interface BarSlot {
  /** Centre of the slot's floor, and the bar's footprint and tallest height. */
  x: number;
  z: number;
  floor: number;
  width: number;
  depth: number;
  maxHeight: number;
}

export interface BarsParams extends KitCommon {
  material: string;
  slots: BarSlot[];
  /** Starting heights as fractions of each slot's `maxHeight` (default: empty). */
  values?: number[];
}

/** A bar with no value keeps a sliver of height (a zero scale has no normal matrix). */
const BAR_MIN_HEIGHT = 0.004;

/** Places bar `transform` in `slot` at `height` (allocation-free; for per-frame updates). */
export function placeBar(transform: number[], slot: BarSlot, height: number): void {
  const h = Math.max(BAR_MIN_HEIGHT, height);
  transform[0] = slot.width;
  transform[5] = h;
  transform[10] = slot.depth;
  transform[12] = slot.x;
  transform[13] = slot.floor + h / 2;
  transform[14] = slot.z;
}

export const bars: KitPrimitive<BarsParams> = {
  build(p) {
    const parts: BlockPart[] = p.slots.map((slot, i) => {
      const part: BlockPart = {
        kind: "block",
        id: `${p.id}.${i}`,
        slot: p.slot + i,
        material: p.material,
        transform: mat4.create(),
        explode: p.explode,
        cutaway: p.cutaway,
        primitive: "bars",
      };
      placeBar(part.transform, slot, (p.values?.[i] ?? 0) * slot.maxHeight);
      return part;
    });
    return {
      parts,
      bounds: unionBounds(
        p.slots.map((s) => [
          s.x - s.width / 2,
          s.floor,
          s.z - s.depth / 2,
          s.x + s.width / 2,
          s.floor + s.maxHeight,
          s.z + s.depth / 2,
        ]),
      ),
      // The first bar's right face, halfway up, so a pill clears the bar's own word.
      anchors: [{ id: p.id, part: parts[0]!.id, local: [0.5, 0, 0.5], priority: 1 }],
      explode: p.explode ?? ([0, 0, 0] as Vec3),
    };
  },
  example: () => ({
    id: "bars",
    slot: 0,
    material: "bar",
    slots: Array.from({ length: 6 }, (_, i) => ({
      x: (i - 2.5) * 0.3,
      z: 0,
      floor: 0,
      width: 0.2,
      depth: 0.2,
      maxHeight: 1.2,
    })),
    values: [0.9, 0.55, 0.3, 0.15, 0.08, 0.03],
  }),
};
