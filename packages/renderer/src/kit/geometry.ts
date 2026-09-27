import type { Box3 } from "math/shapes";

/** Indexed triangle geometry in a part's local space. */
export interface Geometry {
  /** xyz per vertex. */
  positions: Float32Array;
  /** Unit xyz per vertex. */
  normals: Float32Array;
  /** Baked ambient occlusion per vertex (1 = open); absent means fully open. */
  ao?: Float32Array;
  /** Baked (warm, cool) practical light per vertex, 0–1; absent means none. */
  light?: Float32Array;
  indices: Uint32Array;
  bounds: Box3;
}

export function boundsOf(positions: Float32Array): Box3 {
  const box: Box3 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      box[a] = Math.min(box[a]!, positions[i + a]!);
      box[a + 3] = Math.max(box[a + 3]!, positions[i + a]!);
    }
  }
  return box;
}
