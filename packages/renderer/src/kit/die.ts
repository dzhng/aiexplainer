/**
 * The `die` primitive (chapter 3's LoadedDie): a barrel die, a short drum lying on its side
 * whose rim is split into faces, one per outcome, each as wide around the rim as its
 * probability. Rolled, it stops at a random angle, so the face on top is each outcome exactly
 * as often as its share of the rim: face size is likelihood. Each face is `staves` blocks
 * around its arc (all faces keep the same number, so the part list never changes while the
 * shares do); a core tube fills the drum. Face `f`'s staves share dynamics slot `slot + f`,
 * so a face can glow alone. Its anchor is the centre of the drum's −x end.
 *
 * `placeDie` sets the shares, the roll angle and the drum's centre every frame
 * (allocation-free). Angles run from +y towards +z around the drum's axis (+x); face 0 starts
 * at `angle` and the faces follow in order.
 */
import type { Mat4, Vec3 } from "math";
import type { BlockPart, Part, TubePart } from "../frame-input.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";

export interface DieParams extends KitCommon {
  center: Vec3;
  radius: number;
  /** Along the drum's axis (x). */
  length: number;
  /** Radial depth of the face staves. */
  thickness: number;
  /** One material per face, in face order. */
  materials: string[];
  /** Staves per face. */
  staves: number;
  coreMaterial: string;
  /** Face shares as built (default: equal). */
  shares?: number[];
}

export interface DiePose {
  center: Vec3;
  radius: number;
  length: number;
  thickness: number;
  /** Face shares, summing to 1, in face order. */
  shares: ArrayLike<number>;
  /** Where face 0 starts, radians from +y towards +z. */
  angle: number;
}

/**
 * Places a built die (`parts` as `build` returned them: every face's staves, face by face,
 * then the core). A face with no share keeps a sliver so its staves stay valid transforms.
 */
export function placeDie(parts: readonly Part[], faces: number, staves: number, pose: DiePose) {
  const { center, radius, length, thickness, shares, angle } = pose;
  let start = angle;
  for (let f = 0; f < faces; f++) {
    const span = Math.max(1e-7, shares[f] ?? 0) * Math.PI * 2;
    const step = span / staves;
    // A stave spans its arc at the rim: its width is the chord's tangent length there.
    const width = 2 * radius * Math.tan(Math.min(step / 2, 1.2));
    for (let s = 0; s < staves; s++) {
      const phi = start + (s + 0.5) * step;
      const c = Math.cos(phi);
      const n = Math.sin(phi);
      const r = radius - thickness / 2;
      set(
        parts[f * staves + s]!.transform,
        // x: along the axis; y: radial out; z: tangential.
        [length, 0, 0],
        [0, c * thickness, n * thickness],
        [0, -n * width, c * width],
        [center[0], center[1] + c * r, center[2] + n * r],
      );
    }
    start += span;
  }
  // The core tube is built at its own radius, not a unit one, so label occlusion (which scales
  // a tube by its largest axis) sees a tube about its girth rather than one as wide as it is long.
  const corePart = parts[faces * staves] as TubePart;
  const core = corePart.transform;
  const coreRadius = (radius - thickness * 0.98) / corePart.radius;
  set(
    core,
    [length, 0, 0],
    [0, coreRadius, 0],
    [0, 0, coreRadius],
    [center[0] - length / 2, center[1], center[2]],
  );
}

function set(t: Mat4, x: number[], y: number[], z: number[], at: number[]) {
  t[0] = x[0]!;
  t[1] = x[1]!;
  t[2] = x[2]!;
  t[3] = 0;
  t[4] = y[0]!;
  t[5] = y[1]!;
  t[6] = y[2]!;
  t[7] = 0;
  t[8] = z[0]!;
  t[9] = z[1]!;
  t[10] = z[2]!;
  t[11] = 0;
  t[12] = at[0]!;
  t[13] = at[1]!;
  t[14] = at[2]!;
  t[15] = 1;
}

/**
 * Which face is under the `reading` direction (radians from +y towards +z; 0 is the top) when
 * face 0 starts at `angle`.
 */
export function faceAt(shares: ArrayLike<number>, angle: number, reading = 0): number {
  const turn = Math.PI * 2;
  // How far round from face 0's start the reading direction is, in turns.
  const at = ((((reading - angle) % turn) + turn) % turn) / turn;
  let sum = 0;
  for (let f = 0; f < shares.length; f++) {
    sum += shares[f]!;
    if (at < sum) return f;
  }
  return shares.length - 1;
}

export const die: KitPrimitive<DieParams> = {
  build(p) {
    const faces = p.materials.length;
    const common = { explode: p.explode, cutaway: p.cutaway, primitive: "die" };
    const identity = (): Mat4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const parts: Part[] = [];
    for (let f = 0; f < faces; f++)
      for (let s = 0; s < p.staves; s++) {
        const stave: BlockPart = {
          ...common,
          kind: "block",
          id: `${p.id}.face.${f}.${s}`,
          slot: p.slot + f,
          material: p.materials[f]!,
          transform: identity(),
        };
        parts.push(stave);
      }
    const core: TubePart = {
      ...common,
      kind: "tube",
      id: `${p.id}.core`,
      slot: p.slot + faces,
      material: p.coreMaterial,
      path: [
        [0, 0, 0],
        [1, 0, 0],
      ],
      radius: p.radius - p.thickness * 0.98,
      transform: identity(),
    };
    parts.push(core);
    const shares = p.shares ?? p.materials.map(() => 1 / faces);
    placeDie(parts, faces, p.staves, { ...p, shares, angle: 0 });
    const [x, y, z] = p.center;
    const r = p.radius;
    return {
      parts,
      bounds: [x - p.length / 2, y - r, z - r, x + p.length / 2, y + r, z + r],
      anchors: [{ id: p.id, part: core.id, local: [0, 0, 0], priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "die",
    slot: 0,
    center: [0, 0.4, 0],
    radius: 0.35,
    length: 0.6,
    thickness: 0.06,
    materials: ["dieA", "dieB", "dieA", "dieB", "dieA", "dieB", "dieOther"],
    staves: 8,
    coreMaterial: "housing",
    shares: [0.46, 0.18, 0.1, 0.08, 0.06, 0.04, 0.08],
  }),
};
