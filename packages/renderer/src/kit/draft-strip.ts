/**
 * The `draftStrip` primitive (chapter 13's DraftStrip): a row of word tiles for one round of
 * speculative decoding, the drafter's guesses and then the target's own word. Each tile has a
 * face per state, all built in place (`STATE_MATERIALS`: drafted, kept, discarded, and the
 * target's own word); `setDraftTile` shows exactly one of them per tile every frame,
 * allocation-free, and parks the rest out of sight. So a verdict reads as the tile's own
 * colour. A scene writes each tile's word on its face as scene text. Its anchor is the centre
 * of the first tile's face.
 */
import type { Mat4, Vec3 } from "math";
import type { BlockPart, Part } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";

export type DraftTileState = "hidden" | "drafted" | "accepted" | "rejected" | "added";
type Face = Exclude<DraftTileState, "hidden">;

/** The face material for each state (look presets). */
export const STATE_MATERIALS: Record<Face, string> = {
  drafted: "card",
  accepted: "draftAccepted",
  rejected: "draftRejected",
  added: "draftAdded",
};
const FACES = Object.keys(STATE_MATERIALS) as Face[];
/** Parts per tile, in `build`'s order: one face per state. */
export const PARTS_PER_TILE = FACES.length;
const PARKED_Y = -50;

export interface DraftStripParams extends KitCommon {
  /** Centre of the row. */
  center: Vec3;
  /** Tiles in the row (k guesses and the target's word). */
  count: number;
  /** One tile's size, and the gap between tiles, metres. */
  tile: Vec3;
  gap: number;
  /** Each tile's state as built (default: all drafted); scenes then call `setDraftTile`. */
  states?: DraftTileState[];
}

/** Centre of tile `i` in a row of `count` tiles. */
export function draftTileCenter(
  p: Pick<DraftStripParams, "center" | "count" | "tile" | "gap">,
  i: number,
): Vec3 {
  const pitch = p.tile[0] + p.gap;
  return [p.center[0] + (i - (p.count - 1) / 2) * pitch, p.center[1], p.center[2]];
}

function setBox(t: number[], c: readonly number[], s: readonly number[]) {
  t.fill(0);
  t[0] = s[0]!;
  t[5] = s[1]!;
  t[10] = s[2]!;
  t[12] = c[0]!;
  t[13] = c[1]!;
  t[14] = c[2]!;
  t[15] = 1;
}

/**
 * Shows tile `i` of a built strip (`parts` as `build` returned them) at `center` in `state`,
 * `lift` metres above it. Allocation-free.
 */
export function setDraftTile(
  parts: readonly Part[],
  i: number,
  state: DraftTileState,
  center: Vec3,
  size: Vec3,
  lift = 0,
): void {
  FACES.forEach((face, k) => {
    const t = parts[i * PARTS_PER_TILE + k]!.transform;
    if (face === state) setBox(t, [center[0], center[1] + lift, center[2]], size);
    else setBox(t, [center[0], PARKED_Y, center[2]], [1e-4, 1e-4, 1e-4]);
  });
}

/** The part id of tile `i`'s face for `state`: `<id>.<i>` for drafted, else `<id>.<i>.<state>`. */
export function faceId(id: string, i: number, state: DraftTileState = "drafted"): string {
  return state === "drafted" || state === "hidden" ? `${id}.${i}` : `${id}.${i}.${state}`;
}

export const draftStrip: KitPrimitive<DraftStripParams> = {
  build(p) {
    const parts: BlockPart[] = [];
    const identity: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    for (let i = 0; i < p.count; i++) {
      FACES.forEach((face, k) =>
        parts.push({
          kind: "block",
          id: faceId(p.id, i, face),
          // One slot per state, shared by every tile, so a scene can dim a state as a whole.
          slot: p.slot + k,
          material: STATE_MATERIALS[face],
          transform: [...identity] as Mat4,
          explode: p.explode,
          cutaway: p.cutaway,
          primitive: "draftStrip",
        }),
      );
      setDraftTile(parts, i, p.states?.[i] ?? "drafted", draftTileCenter(p, i), p.tile);
    }
    const boxes = Array.from({ length: p.count }, (_, i) => {
      const [x, y, z] = draftTileCenter(p, i);
      const [w, h, d] = [p.tile[0] / 2, p.tile[1] / 2, p.tile[2] / 2];
      return [x - w, y - h, z - d, x + w, y + h, z + d] as [
        number,
        number,
        number,
        number,
        number,
        number,
      ];
    });
    return {
      parts,
      bounds: unionBounds(boxes),
      // On the first tile's face as built (the one of its states that is showing).
      anchors: [
        { id: p.id, part: faceId(p.id, 0, p.states?.[0]), local: [0, 0, 0.5], priority: 1 },
      ],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "draft",
    slot: 0,
    center: [0, 0.6, 0],
    count: 5,
    tile: [0.42, 0.26, 0.08],
    gap: 0.06,
    states: ["accepted", "accepted", "rejected", "added", "drafted"],
  }),
};
