/**
 * Chapter 2's map: the PCA computed offline (`scripts/embed-map.ts`) from the `embed` model's
 * real `tok_emb` rows, and the pinned words' positions on it (`embed-map.json`). Any other
 * token (the loop's words, typed text) is projected at run time with the same stored basis,
 * so every pin is its word's embedding seen from the same three directions.
 */
import raw from "./embed-map.json";

export type Vec3Tuple = [number, number, number];

export interface EmbedMap {
  model: string;
  weightsSha256: string;
  fittedTo: string;
  mean: number[];
  components: [number[], number[], number[]];
  variances: number[];
  /** The neighbour-probe pairs pinned, in probe order. */
  pairs: [string, string][];
  /** Two per pair, pair by pair: each word, its token id and its projection. */
  pins: { word: string; id: number; at: Vec3Tuple }[];
}

export const EMBED_MAP = raw as EmbedMap;

/** A `tok_emb` row's shadow on the map's three directions. */
export function projectRow(row: ArrayLike<number>, map: EmbedMap = EMBED_MAP): Vec3Tuple {
  const out: Vec3Tuple = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const component = map.components[c]!;
    let sum = 0;
    for (let k = 0; k < component.length; k++) sum += component[k]! * (row[k]! - map.mean[k]!);
    out[c] = sum;
  }
  return out;
}

/** The most tokens of one input the map pins (typed text can be long). */
export const MAX_PINNED_INPUT = 8;

/** The all-zeros embedding's shadow: where every arrow starts. */
export const ORIGIN = projectRow(new Array<number>(EMBED_MAP.mean.length).fill(0));
