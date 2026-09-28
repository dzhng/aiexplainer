/**
 * The kit contract: every primitive is one module whose `build(params)` returns
 * its parts, their bounds, its anchors and its explode vector from a single source, so the
 * meshes the GPU draws, the label occluders, the anchors and the Cutaway/Exploded views all
 * agree. A chapter composes scenes only from `KIT` (`kit/catalog.ts`).
 */
import type { Vec3 } from "math";
import type { Box3 } from "math/shapes";
import type { MeshAsset } from "../gltf.ts";
import type { Part, SceneAnchor } from "../frame-input.ts";

export interface KitBuild {
  parts: Part[];
  /** World bounds of every part as built (Whole view). */
  bounds: Box3;
  /** Where labels may pin: at least one, inside `bounds`. */
  anchors: SceneAnchor[];
  /** The primitive's Exploded-view offset as a whole (its parts carry their own). */
  explode: Vec3;
}

export interface KitPrimitive<P> {
  build(params: P): KitBuild;
  /** A representative instance, for the kit's tests and its `/lab/kit/<primitive>` turntable. */
  example(assets: Record<string, MeshAsset>): P;
}

/** Common placement params. */
export interface KitCommon {
  /** The primitive's id; its parts are `<id>` or `<id>.<n>`, its main anchor is `<id>`. */
  id: string;
  /** The dynamics slot of its (first) part. */
  slot: number;
  explode?: Vec3;
  cutaway?: "keep" | "clip";
}

export function unionBounds(boxes: Box3[]): Box3 {
  const out: Box3 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const b of boxes)
    for (let a = 0; a < 3; a++) {
      out[a] = Math.min(out[a]!, b[a]!);
      out[a + 3] = Math.max(out[a + 3]!, b[a + 3]!);
    }
  return out;
}

/** Where pooled parts wait out of sight, below the floor, until a scene shows them. */
export const PARKED_Y = -50;
