/**
 * The `river` primitive (chapter 7): a translucent channel running along a row of stations,
 * one stretch before the first station, one between each pair, and one after the last, plus
 * a pour chute from each station down into it. The scene sizes each stretch by how much
 * signal it carries (`placeStretch`) and each chute by what its station adds (`placePour`),
 * every frame.
 *
 * Slots: stretches `slot + i` (i = 0…stations), pours `slot + stations + 1 + k`. Parts:
 * `<id>.stretch.<i>`, `<id>.pour.<k>`. Anchor: `<id>` on the stretch after the first station.
 */
import { mat4, type Vec3 } from "math";
import type { BlockPart, Part, TubePart } from "../frame-input.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";
import { placeSegment, UNIT_SEGMENT } from "./tube.ts";

export interface RiverParams extends KitCommon {
  /** Stations' x positions, left to right; the river flows toward +X. */
  stations: number[];
  /** The river's centre line: height and depth, and how far it runs past the end stations. */
  y: number;
  z: number;
  run: number;
  /** The channel's front-to-back width; its height is what the scene varies. */
  width: number;
  /** Where each station's chute starts (the station's underside). */
  pourFrom: number;
  /** The tallest stretch, so bounds hold every pose. */
  maxHeight: number;
  materials: { water: string; pour: string };
}

/** Stretch i's left and right ends along X. */
export function stretchSpan(p: RiverParams, i: number): [number, number] {
  const xs = p.stations;
  const left = i === 0 ? xs[0]! - p.run : xs[i - 1]!;
  const right = i === xs.length ? xs.at(-1)! + p.run : xs[i]!;
  return [left, right];
}

/**
 * Sizes stretch i to `height` (its top and bottom move symmetrically about the centre line).
 * An empty stretch shrinks to nothing across as well, so no flat sheet is left behind.
 */
export function placeStretch(transform: number[], p: RiverParams, i: number, height: number) {
  const [left, right] = stretchSpan(p, i);
  const empty = height < 1e-3;
  transform[0] = right - left;
  transform[5] = Math.max(height, 1e-4);
  transform[10] = empty ? 1e-4 : p.width;
  transform[12] = (left + right) / 2;
  transform[13] = p.y;
  transform[14] = p.z;
}

/** Sizes station k's chute: from its underside down onto the river's surface. */
export function placePour(
  transform: number[],
  p: RiverParams,
  k: number,
  radius: number,
  top: number,
) {
  const x = p.stations[k]!;
  const from: Vec3 = [x, p.pourFrom, p.z];
  const to: Vec3 = [x, Math.min(p.pourFrom - 1e-3, top), p.z];
  placeSegment(transform, from, to, Math.max(radius, 1e-4));
}

export const river: KitPrimitive<RiverParams> = {
  build(p) {
    const n = p.stations.length;
    const stretches: BlockPart[] = Array.from({ length: n + 1 }, (_, i) => {
      const part: BlockPart = {
        kind: "block",
        id: `${p.id}.stretch.${i}`,
        slot: p.slot + i,
        material: p.materials.water,
        transform: mat4.create(),
        explode: p.explode,
        cutaway: p.cutaway,
        primitive: "river",
      };
      placeStretch(part.transform, p, i, p.maxHeight / 2);
      return part;
    });
    const pours: TubePart[] = p.stations.map((_, k) => {
      const part: TubePart = {
        kind: "tube",
        id: `${p.id}.pour.${k}`,
        slot: p.slot + n + 1 + k,
        material: p.materials.pour,
        path: UNIT_SEGMENT,
        radius: 1,
        transform: mat4.create(),
        explode: p.explode,
        primitive: "river",
      };
      placePour(part.transform, p, k, 0.03, p.y + p.maxHeight / 4);
      return part;
    });
    const parts: Part[] = [...stretches, ...pours];
    const [left] = stretchSpan(p, 0);
    const [, right] = stretchSpan(p, n);
    return {
      parts,
      bounds: [
        left,
        p.y - p.maxHeight / 2,
        p.z - p.width / 2,
        right,
        Math.max(p.pourFrom, p.y + p.maxHeight / 2),
        p.z + p.width / 2,
      ],
      anchors: [
        { id: p.id, part: stretches[Math.min(1, n)]!.id, local: [0, 0.5, 0.5], priority: 1 },
      ],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "river",
    slot: 0,
    stations: [-1.2, -0.4, 0.4, 1.2],
    y: 0.3,
    z: 0,
    run: 0.6,
    width: 0.5,
    pourFrom: 0.9,
    maxHeight: 0.4,
    materials: { water: "river", pour: "bar" },
  }),
};
