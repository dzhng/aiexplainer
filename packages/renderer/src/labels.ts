/**
 * Label placement, CPU only. Anchors are projected with the same `project` the GPU packing
 * uses and hidden when they fall behind the eye, off-screen, or behind solid geometry.
 * Occlusion is a ray from the eye to each anchor against the app's own shapes (never a
 * pixel readback): block bounds, tube capsules, and mesh triangles behind a bounds test.
 * Label text never reaches this module; only anchor ids.
 */
import { mat4, vec3, type Mat4, type Vec3 } from "math";
import { box3, raycast3, type Box3 } from "math/shapes";
import { createProjected, partWorld, project, type CameraMatrices } from "./camera.ts";
import type { FrameInput, LookConfig, SceneDesc } from "./frame-input.ts";
import { meshMaterial, meshNodes, partLocalBounds } from "./scene.ts";

export type Occluder =
  | { kind: "box"; part: string; bounds: Box3 }
  | { kind: "capsule"; part: string; a: Vec3; b: Vec3; radius: number }
  | { kind: "mesh"; part: string; bounds: Box3; positions: Float32Array; indices: Uint32Array };

export interface WorldAnchor {
  id: string;
  part: string;
  position: Vec3;
  /** Higher wins when labels overlap. */
  priority: number;
  /** The pill's measured width in CSS pixels, when the label layer knows it. */
  pillWidth?: number;
}

export interface LabelPlacement {
  id: string;
  /** The anchor's projected position (where the dot sits), CSS pixels. */
  x: number;
  y: number;
  visible: boolean;
  hiddenBy?: "occluded" | "offscreen" | "behind" | "overlap";
}

/** A label's pill relative to its dot (up and to the right), and its widest size. */
export interface LabelBox {
  dx: number;
  dy: number;
  width: number;
  height: number;
}

export const DEFAULT_LABEL_BOX: LabelBox = { dx: 18, dy: -40, width: 150, height: 26 };

const model: Mat4 = mat4.create();

/**
 * Occluders for every solid part in the current view, in world space. Translucent parts
 * (glass) never hide a label; `look` says which materials are translucent.
 */
export function sceneOccluders(
  scene: SceneDesc,
  view: FrameInput["view"],
  look: LookConfig,
): Occluder[] {
  const solid = (material: string) => (look.materials[material]?.opacity ?? 1) >= 1;
  const out: Occluder[] = [];
  for (const part of scene.parts) {
    partWorld(part, view, model);
    if (part.kind !== "mesh" && !solid(part.material)) continue;
    if (part.kind === "block") {
      out.push({
        kind: "box",
        part: part.id,
        bounds: box3.transformMat4(box3.create(), partLocalBounds(part, scene.assets), model),
      });
    } else if (part.kind === "tube") {
      // A tube's radius scales with its transform; take the largest axis scale.
      const scale = Math.max(...mat4.getScaling([0, 0, 0], model));
      for (let i = 0; i + 1 < part.path.length; i++) {
        out.push({
          kind: "capsule",
          part: part.id,
          a: vec3.transformMat4([0, 0, 0], part.path[i]!, model),
          b: vec3.transformMat4([0, 0, 0], part.path[i + 1]!, model),
          radius: part.radius * scale,
        });
      }
    } else {
      for (const node of meshNodes(part, scene.assets)) {
        if (!solid(meshMaterial(node, look))) continue;
        const positions = new Float32Array(node.positions.length);
        const p: Vec3 = [0, 0, 0];
        for (let i = 0; i < positions.length; i += 3) {
          vec3.transformMat4(
            p,
            [node.positions[i]!, node.positions[i + 1]!, node.positions[i + 2]!],
            model,
          );
          positions.set(p, i);
        }
        out.push({
          kind: "mesh",
          part: part.id,
          bounds: box3.transformMat4(box3.create(), node.bounds, model),
          positions,
          indices: node.indices,
        });
      }
    }
  }
  return out;
}

/** Anchors resolved to world space through each part's current transform. */
export function sceneAnchors(scene: SceneDesc, view: FrameInput["view"]): WorldAnchor[] {
  const parts = new Map(scene.parts.map((p) => [p.id, p]));
  return scene.anchors.map((anchor) => {
    const part = parts.get(anchor.part);
    if (!part) throw new Error(`labels: anchor ${anchor.id} names unknown part "${anchor.part}"`);
    return {
      id: anchor.id,
      part: anchor.part,
      position: vec3.transformMat4([0, 0, 0], anchor.local, partWorld(part, view, model)),
      priority: anchor.priority,
    };
  });
}

/** Squared distance between segments p0→p1 and q0→q1 (Ericson, Real-Time Collision Detection 5.1.9). */
function segmentDistanceSq(p0: Vec3, p1: Vec3, q0: Vec3, q1: Vec3): number {
  const d1 = vec3.subtract(scratch.d1, p1, p0);
  const d2 = vec3.subtract(scratch.d2, q1, q0);
  const r = vec3.subtract(scratch.r, p0, q0);
  const a = vec3.dot(d1, d1);
  const e = vec3.dot(d2, d2);
  const f = vec3.dot(d2, r);
  let s = 0;
  let t = 0;
  if (a <= 1e-12 && e <= 1e-12) return vec3.dot(r, r);
  if (a <= 1e-12) t = clamp01(f / e);
  else {
    const c = vec3.dot(d1, r);
    if (e <= 1e-12) s = clamp01(-c / a);
    else {
      const b = vec3.dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const c1 = vec3.scaleAndAdd(scratch.c1, p0, d1, s);
  const c2 = vec3.scaleAndAdd(scratch.c2, q0, d2, t);
  return vec3.squaredDistance(c1, c2);
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

const scratch = {
  d1: [0, 0, 0] as Vec3,
  d2: [0, 0, 0] as Vec3,
  r: [0, 0, 0] as Vec3,
  c1: [0, 0, 0] as Vec3,
  c2: [0, 0, 0] as Vec3,
  dir: [0, 0, 0] as Vec3,
  end: [0, 0, 0] as Vec3,
  a: [0, 0, 0] as Vec3,
  b: [0, 0, 0] as Vec3,
  c: [0, 0, 0] as Vec3,
};
const triangleHit = raycast3.createIntersectsTriangleResult();

/** A ray stops this far short of its anchor, so a part never hides its own surface point. */
const SURFACE_EPSILON = 0.02;

/** Whether the ray `origin` → `origin + dir × length` hits the occluder. */
export function occludes(occluder: Occluder, origin: Vec3, dir: Vec3, length: number): boolean {
  switch (occluder.kind) {
    case "box":
      return raycast3.intersectsBox3(origin, dir, length, occluder.bounds);
    case "capsule": {
      const end = vec3.scaleAndAdd(scratch.end, origin, dir, length);
      return (
        segmentDistanceSq(origin, end, occluder.a, occluder.b) <= occluder.radius * occluder.radius
      );
    }
    case "mesh": {
      if (!raycast3.intersectsBox3(origin, dir, length, occluder.bounds)) return false;
      const { positions: p, indices } = occluder;
      for (let i = 0; i < indices.length; i += 3) {
        const ia = indices[i]! * 3;
        const ib = indices[i + 1]! * 3;
        const ic = indices[i + 2]! * 3;
        vec3.set(scratch.a, p[ia]!, p[ia + 1]!, p[ia + 2]!);
        vec3.set(scratch.b, p[ib]!, p[ib + 1]!, p[ib + 2]!);
        vec3.set(scratch.c, p[ic]!, p[ic + 1]!, p[ic + 2]!);
        raycast3.intersectsTriangle(
          triangleHit,
          origin,
          dir,
          length,
          scratch.a,
          scratch.b,
          scratch.c,
          false,
        );
        if (triangleHit.hit) return true;
      }
      return false;
    }
  }
}

const projected = createProjected();

/**
 * Places every anchor: projects it, then hides it when behind the eye, off-screen,
 * occluded, or overlapping a higher-priority label. `out` is reused and returned.
 */
export function placeLabels(
  matrices: CameraMatrices,
  anchors: WorldAnchor[],
  occluders: Occluder[],
  out: LabelPlacement[],
  box: LabelBox = DEFAULT_LABEL_BOX,
): LabelPlacement[] {
  out.length = anchors.length;
  const eye = matrices.eye;
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]!;
    const placement = (out[i] ??= { id: anchor.id, x: 0, y: 0, visible: false });
    placement.id = anchor.id;
    placement.hiddenBy = undefined;
    project(matrices, anchor.position, projected);
    placement.x = projected.x;
    placement.y = projected.y;
    if (projected.behind) placement.hiddenBy = "behind";
    else if (
      projected.x < 0 ||
      projected.y < 0 ||
      projected.x > matrices.width ||
      projected.y > matrices.height
    )
      placement.hiddenBy = "offscreen";
    else {
      const dir = vec3.subtract(scratch.dir, anchor.position, eye);
      const length = vec3.length(dir) - SURFACE_EPSILON;
      vec3.normalize(dir, dir);
      for (let o = 0; length > 0 && o < occluders.length; o++) {
        if (occludes(occluders[o]!, eye, dir, length)) {
          placement.hiddenBy = "occluded";
          break;
        }
      }
    }
    placement.visible = placement.hiddenBy === undefined;
  }
  hideOverlaps(anchors, out, box);
  return out;
}

const order: number[] = [];
const kept: number[] = [];

/** Radius around a dot that another label's pill may not cover, CSS pixels. */
const DOT_CLEARANCE = 6;

/** A pill's rectangle: offset from its dot by the shared box, as wide as measured. */
function pillCoversDot(
  pill: LabelPlacement,
  width: number,
  dot: LabelPlacement,
  box: LabelBox,
): boolean {
  const x = pill.x + box.dx;
  const y = pill.y + box.dy;
  return (
    dot.x + DOT_CLEARANCE > x &&
    dot.x - DOT_CLEARANCE < x + width &&
    dot.y + DOT_CLEARANCE > y &&
    dot.y - DOT_CLEARANCE < y + box.height
  );
}

/** Two labels clash when their pills intersect or either pill covers the other's dot. */
function labelsOverlap(
  a: LabelPlacement,
  aWidth: number,
  b: LabelPlacement,
  bWidth: number,
  box: LabelBox,
): boolean {
  const pillsMeet = a.x < b.x + bWidth && b.x < a.x + aWidth && Math.abs(a.y - b.y) < box.height;
  return pillsMeet || pillCoversDot(a, aWidth, b, box) || pillCoversDot(b, bWidth, a, box);
}

/** Visits labels by priority (highest first); one that clashes with a kept label hides. */
function hideOverlaps(anchors: WorldAnchor[], out: LabelPlacement[], box: LabelBox): void {
  order.length = 0;
  for (let i = 0; i < anchors.length; i++) order.push(i);
  order.sort((a, b) => anchors[b]!.priority - anchors[a]!.priority);
  kept.length = 0;
  for (const i of order) {
    const p = out[i]!;
    if (!p.visible) continue;
    const width = anchors[i]!.pillWidth ?? box.width;
    let hit = false;
    for (const k of kept) {
      if (labelsOverlap(out[k]!, anchors[k]!.pillWidth ?? box.width, p, width, box)) hit = true;
    }
    if (hit) {
      p.visible = false;
      p.hiddenBy = "overlap";
    } else kept.push(i);
  }
}
