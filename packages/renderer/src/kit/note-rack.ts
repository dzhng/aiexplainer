/**
 * The `noteRack` primitive (chapter 10): a rack of sticky-note slots, one shelf per layer and
 * one column per position, with `notes` slots per cell (a key and value note per KV head). The
 * scene fills a slot when its note is written (`placeNote`), lights it when it is read, and
 * empties it when it is evicted, every frame.
 *
 * Slots: the frame is `slot`; note (layer, column, n) is `slot + 1 + (layer × columns + column)`,
 * so a whole cell (one position in one layer) glows together. Parts: `<id>.frame.*`,
 * `<id>.note.<layer>.<column>.<n>`. Anchor: `<id>` on the top shelf's left end.
 */
import { mat4, type Vec3 } from "math";
import type { BlockPart, Part } from "../frame-input.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";

export interface NoteRackParams extends KitCommon {
  /** Centre of the rack's back board. */
  center: Vec3;
  layers: number;
  columns: number;
  /** Note slots per cell. */
  notes: number;
  /** Cell width (one position) and shelf height, metres. */
  pitch: [number, number];
  materials: { frame: string; note: string };
}

const BOARD_DEPTH = 0.06;
const NOTE_DEPTH = 0.02;

export function rackSize(p: NoteRackParams): { width: number; height: number } {
  return { width: p.columns * p.pitch[0] + 0.12, height: p.layers * p.pitch[1] + 0.12 };
}

/** The centre of note `n` in (layer, column): shelves bottom to top, columns left to right. */
export function noteCenter(p: NoteRackParams, layer: number, column: number, n: number): Vec3 {
  const [pw, ph] = p.pitch;
  const noteW = pw / p.notes;
  return [
    p.center[0] + (column - (p.columns - 1) / 2) * pw + (n - (p.notes - 1) / 2) * noteW,
    p.center[1] + (layer - (p.layers - 1) / 2) * ph,
    p.center[2] + BOARD_DEPTH / 2 + NOTE_DEPTH / 2,
  ];
}

/** A note's slot in the dynamics: one per cell. */
export function noteSlot(p: NoteRackParams, layer: number, column: number): number {
  return p.slot + 1 + layer * p.columns + column;
}

/** Places note (layer, column, n): `filled` 0 hides it (a sliver), 1 shows it full size. */
export function placeNote(
  transform: number[],
  p: NoteRackParams,
  layer: number,
  column: number,
  n: number,
  filled: number,
): void {
  const [pw, ph] = p.pitch;
  const [x, y, z] = noteCenter(p, layer, column, n);
  const s = Math.max(filled, 1e-4);
  transform[0] = (pw / p.notes) * 0.8 * s;
  transform[5] = ph * 0.7 * s;
  transform[10] = NOTE_DEPTH;
  transform[12] = x;
  transform[13] = y;
  transform[14] = z;
}

export const noteRack: KitPrimitive<NoteRackParams> = {
  build(p) {
    const { width, height } = rackSize(p);
    const [cx, cy, cz] = p.center;
    const frame: BlockPart[] = [
      {
        kind: "block",
        id: `${p.id}.frame.board`,
        slot: p.slot,
        material: p.materials.frame,
        transform: [width, 0, 0, 0, 0, height, 0, 0, 0, 0, BOARD_DEPTH, 0, cx, cy, cz, 1],
        explode: p.explode,
        cutaway: p.cutaway,
        primitive: "noteRack",
      },
      // A thin shelf under each layer's row of notes.
      ...Array.from({ length: p.layers }, (_, l): BlockPart => {
        const y = cy + (l - (p.layers - 1) / 2) * p.pitch[1] - p.pitch[1] * 0.4;
        return {
          kind: "block",
          id: `${p.id}.frame.shelf.${l}`,
          slot: p.slot,
          material: p.materials.frame,
          transform: [width, 0, 0, 0, 0, 0.02, 0, 0, 0, 0, 0.12, 0, cx, y, cz + 0.06, 1],
          explode: p.explode,
          primitive: "noteRack",
        };
      }),
    ];
    const notes: BlockPart[] = [];
    for (let l = 0; l < p.layers; l++)
      for (let c = 0; c < p.columns; c++)
        for (let n = 0; n < p.notes; n++) {
          const note: BlockPart = {
            kind: "block",
            id: `${p.id}.note.${l}.${c}.${n}`,
            slot: noteSlot(p, l, c),
            material: p.materials.note,
            transform: mat4.create(),
            explode: p.explode,
            primitive: "noteRack",
          };
          placeNote(note.transform, p, l, c, n, 1);
          notes.push(note);
        }
    const parts: Part[] = [...frame, ...notes];
    return {
      parts,
      bounds: [
        cx - width / 2,
        cy - height / 2,
        cz - BOARD_DEPTH / 2,
        cx + width / 2,
        cy + height / 2,
        cz + 0.12,
      ],
      anchors: [{ id: p.id, part: frame[0]!.id, local: [-0.4, 0.5, 0.5], priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "noteRack",
    slot: 0,
    center: [0, 1, 0],
    layers: 4,
    columns: 8,
    notes: 2,
    pitch: [0.2, 0.28],
    materials: { frame: "housing", note: "neuron" },
  }),
};
