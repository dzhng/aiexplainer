/**
 * The one camera. GPU packing, label placement, crops and picking all call these functions,
 * so CPU and GPU agree. Depth is reverse-Z: near maps to 1, far to 0.
 */
import { mat4, type Mat4, type Vec3 } from "math";
import type { Box3 } from "math/shapes";
import type { OrbitPose, Part, ViewMode, Viewport } from "./frame-input.ts";

export const CAMERA_NEAR = 0.05;
export const CAMERA_FAR = 400;
const UP: Vec3 = [0, 1, 0];

export interface CameraMatrices {
  view: Mat4;
  proj: Mat4;
  viewProj: Mat4;
  invViewProj: Mat4;
  eye: Vec3;
  /** CSS pixels, so projected points land in the same space as the DOM. */
  width: number;
  height: number;
}

export function createCameraMatrices(): CameraMatrices {
  return {
    view: mat4.create(),
    proj: mat4.create(),
    viewProj: mat4.create(),
    invViewProj: mat4.create(),
    eye: [0, 0, 0],
    width: 1,
    height: 1,
  };
}

/** A pose to write into: the origin, from one unit away. */
export function createPose(): OrbitPose {
  return { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 1, fovY: 1 };
}

export function copyPose(out: OrbitPose, from: OrbitPose): OrbitPose {
  out.target[0] = from.target[0];
  out.target[1] = from.target[1];
  out.target[2] = from.target[2];
  out.yaw = from.yaw;
  out.pitch = from.pitch;
  out.distance = from.distance;
  out.fovY = from.fovY;
  return out;
}

/** The unit direction from `pose`'s target to its eye. */
export function orbitDirection(pose: OrbitPose, out: Vec3): Vec3 {
  const cp = Math.cos(pose.pitch);
  out[0] = cp * Math.sin(pose.yaw);
  out[1] = Math.sin(pose.pitch);
  out[2] = cp * Math.cos(pose.yaw);
  return out;
}

/** The orbit pose that looks from `eye` at `target` (the inverse of `orbitEye`). */
export function orbitPoseAt(eye: Vec3, target: Vec3, fovY: number): OrbitPose {
  const dx = eye[0] - target[0];
  const dy = eye[1] - target[1];
  const dz = eye[2] - target[2];
  const distance = Math.hypot(dx, dy, dz);
  return {
    target: [target[0], target[1], target[2]],
    yaw: Math.atan2(dx, dz),
    pitch: Math.asin(dy / distance),
    distance,
    fovY,
  };
}

export function orbitEye(pose: OrbitPose, out: Vec3): Vec3 {
  const cp = Math.cos(pose.pitch);
  out[0] = pose.target[0] + pose.distance * cp * Math.sin(pose.yaw);
  out[1] = pose.target[1] + pose.distance * Math.sin(pose.pitch);
  out[2] = pose.target[2] + pose.distance * cp * Math.cos(pose.yaw);
  return out;
}

function fround16(m: Mat4): void {
  for (let i = 0; i < 16; i++) m[i] = Math.fround(m[i]!);
}

/** Fills `out` for `pose`; every matrix is rounded to float32, exactly as the GPU sees it. */
export function cameraMatrices(
  pose: OrbitPose,
  viewport: Viewport,
  out: CameraMatrices,
): CameraMatrices {
  orbitEye(pose, out.eye);
  mat4.lookAt(out.view, out.eye, pose.target, UP);
  // Near and far swapped: reverse-Z.
  mat4.perspectiveZO(
    out.proj,
    pose.fovY,
    viewport.width / viewport.height,
    CAMERA_FAR,
    CAMERA_NEAR,
  );
  fround16(out.view);
  fround16(out.proj);
  mat4.multiply(out.viewProj, out.proj, out.view);
  fround16(out.viewProj);
  mat4.invert(out.invViewProj, out.viewProj);
  fround16(out.invViewProj);
  out.width = viewport.width;
  out.height = viewport.height;
  return out;
}

export interface Projected {
  /** CSS pixels from the canvas's top-left. */
  x: number;
  y: number;
  /** Reverse-Z NDC depth: 1 at the near plane, 0 at the far plane. */
  depth: number;
  /** The point is behind the eye; `x` and `y` are meaningless. */
  behind: boolean;
}

export function createProjected(): Projected {
  return { x: 0, y: 0, depth: 0, behind: false };
}

export function project(m: CameraMatrices, p: Vec3, out: Projected): Projected {
  const e = m.viewProj;
  const x = p[0];
  const y = p[1];
  const z = p[2];
  const cx = e[0] * x + e[4] * y + e[8] * z + e[12];
  const cy = e[1] * x + e[5] * y + e[9] * z + e[13];
  const cz = e[2] * x + e[6] * y + e[10] * z + e[14];
  const cw = e[3] * x + e[7] * y + e[11] * z + e[15];
  out.behind = cw <= 0;
  const iw = 1 / cw;
  out.x = (cx * iw * 0.5 + 0.5) * m.width;
  out.y = (0.5 - cy * iw * 0.5) * m.height;
  out.depth = cz * iw;
  return out;
}

export interface ScreenRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const corner: Vec3 = [0, 0, 0];
const projected = createProjected();

/**
 * The screen rectangle covering a world-space box. Returns `null` when any corner is behind
 * the eye, because the rectangle would then be unbounded.
 */
export function projectBox(m: CameraMatrices, box: Box3): ScreenRect | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < 8; i++) {
    corner[0] = i & 1 ? box[3] : box[0];
    corner[1] = i & 2 ? box[4] : box[1];
    corner[2] = i & 4 ? box[5] : box[2];
    project(m, corner, projected);
    if (projected.behind) return null;
    minX = Math.min(minX, projected.x);
    minY = Math.min(minY, projected.y);
    maxX = Math.max(maxX, projected.x);
    maxY = Math.max(maxY, projected.y);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * The single part → world transform: the one place the Exploded view is applied (each part
 * moves by its `explode` × `view.t`). Whole and Cutaway place parts as authored.
 */
export function partWorld(part: Part, view: { mode: ViewMode; t: number }, out: Mat4): Mat4 {
  mat4.copy(out, part.transform);
  if (view.mode === "exploded" && part.explode) {
    out[12] = out[12]! + part.explode[0] * view.t;
    out[13] = out[13]! + part.explode[1] * view.t;
    out[14] = out[14]! + part.explode[2] * view.t;
  }
  return out;
}

/**
 * How far the Cutaway view has cut into a part, 0 (whole) → 1 (cut at the plane): the one
 * place the Cutaway view is decided. Only `cutaway: "clip"` parts are cut.
 */
export function partCut(part: Part, view: { mode: ViewMode; t: number }): number {
  return view.mode === "cutaway" && part.cutaway === "clip" ? view.t : 0;
}
