/**
 * In-world text, the kit's way of writing on a part: `text()` makes a `SceneText` (the words
 * on a card, a bar, a board face, a die face), and `faceBasis` is the one owner of how a face
 * turns into the text's directions in the world, shared by the GPU packing and the CPU
 * screen boxes. The renderer's text pass draws it (`passes/text.ts`) from the glyph atlas
 * (`text/atlas.ts`). Unlike the other primitives it builds no part: text lives on parts.
 */
import type { Mat4, Vec3 } from "math";
import type { SceneText, TextFace } from "../frame-input.ts";

/** Default lift off the face, metres: clear of the surface in the depth test, never seen. */
export const TEXT_LIFT = 0.003;

export interface TextParams {
  id: string;
  /** The part written on. */
  part: string;
  /** In the part's local space, e.g. [0, 0, 0.5] for the middle of a block's front face. */
  local: Vec3;
  /** Default `front`. */
  face?: TextFace;
  /** Font size (em), metres. */
  size: number;
  style: string;
  /** Default [0.5, 0.5]: centred on `local`. */
  align?: [number, number];
  maxWidth?: number;
  /** Default `TEXT_LIFT`. */
  lift?: number;
  /** Default "": nothing drawn until the scene writes it. */
  text?: string;
  /** Default false (see `SceneText.yields`). */
  yields?: boolean;
}

export function text(p: TextParams): SceneText {
  return {
    id: p.id,
    part: p.part,
    local: [p.local[0], p.local[1], p.local[2]],
    face: p.face ?? "front",
    lift: p.lift ?? TEXT_LIFT,
    size: p.size,
    style: p.style,
    align: p.align ?? [0.5, 0.5],
    maxWidth: p.maxWidth,
    text: p.text ?? "",
    yields: p.yields,
  };
}

/** Column `c` of `m`'s linear part, unit length (an axis of the part, its scale removed). */
function axis(out: Vec3, m: Mat4, c: number, sign: number): Vec3 {
  const x = m[c * 4]!;
  const y = m[c * 4 + 1]!;
  const z = m[c * 4 + 2]!;
  const length = Math.hypot(x, y, z);
  const k = length > 1e-12 ? sign / length : 0;
  out[0] = x * k;
  out[1] = y * k;
  out[2] = z * k;
  if (k === 0) out[c] = sign;
  return out;
}

/**
 * The text's unit directions in the world for `face` of a part placed by `model`: `right`
 * along its lines, `up` toward its top, and `normal` out of the face (right × up). `view` (the
 * camera's view matrix) turns a `camera` face toward the eye.
 */
export function faceBasis(
  face: TextFace,
  model: Mat4,
  view: Mat4,
  right: Vec3,
  up: Vec3,
  normal: Vec3,
): void {
  switch (face) {
    case "camera":
      for (let i = 0; i < 3; i++) {
        right[i] = view[i * 4]!;
        up[i] = view[i * 4 + 1]!;
        normal[i] = view[i * 4 + 2]!;
      }
      return;
    case "front":
      axis(right, model, 0, 1);
      axis(up, model, 1, 1);
      break;
    case "back":
      axis(right, model, 0, -1);
      axis(up, model, 1, 1);
      break;
    case "top":
      axis(right, model, 0, 1);
      axis(up, model, 2, -1);
      break;
    case "bottom":
      axis(right, model, 0, 1);
      axis(up, model, 2, 1);
      break;
    case "right":
      axis(right, model, 2, -1);
      axis(up, model, 1, 1);
      break;
    case "left":
      axis(right, model, 2, 1);
      axis(up, model, 1, 1);
      break;
  }
  normal[0] = right[1] * up[2] - right[2] * up[1];
  normal[1] = right[2] * up[0] - right[0] * up[2];
  normal[2] = right[0] * up[1] - right[1] * up[0];
}
