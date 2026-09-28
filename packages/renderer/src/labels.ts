/**
 * Label placement, CPU only. Anchors are projected with the same `project` the GPU packing
 * uses and hidden when they fall behind the eye, off-screen, or behind solid geometry.
 * Occlusion is a ray from the eye to each anchor against the app's own shapes (never a
 * pixel readback): block bounds, tube capsules, and mesh triangles behind a bounds test.
 * Label text never reaches this module; only anchor ids.
 */
import { type Mat4, type Vec3, clamp, vec3 } from "math";
import { box3, raycast3, type Box3 } from "math/shapes";
import { createProjected, project, type CameraMatrices, type ScreenRect } from "./camera.ts";
import type { LookConfig, Part, SceneAnchor, SceneDesc } from "./frame-input.ts";
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

/** Where a label's pill sits relative to its dot. */
export type LabelSide = "up-right" | "up-left" | "down-right" | "down-left";
const SIDES: readonly LabelSide[] = ["up-right", "up-left", "down-right", "down-left"];

export interface LabelPlacement {
  id: string;
  /** The anchor's projected position (where the dot sits), CSS pixels. */
  x: number;
  y: number;
  visible: boolean;
  hiddenBy?: "occluded" | "offscreen" | "behind" | "overlap";
  /** The first side (in `SIDES` order) whose pill clashes with nothing already placed. */
  side: LabelSide;
}

/** A label's pill relative to its dot for the up-right side (mirrored for the others), and its widest size. */
export interface LabelBox {
  dx: number;
  dy: number;
  width: number;
  height: number;
}

export const DEFAULT_LABEL_BOX: LabelBox = { dx: 18, dy: -40, width: 220, height: 26 };

/**
 * How much `model` scales a tube's radius around the segment `a`→`b`: the largest stretch
 * of the two directions across it (a pipe stretched along its length keeps its radius).
 */
function crossScale(model: Mat4, a: Vec3, b: Vec3): number {
  const d = vec3.normalize([0, 0, 0], vec3.subtract([0, 0, 0], b, a));
  const seed: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = vec3.normalize([0, 0, 0], vec3.cross([0, 0, 0], d, seed));
  const v = vec3.cross([0, 0, 0], d, u);
  const across = (w: Vec3) =>
    Math.hypot(
      model[0]! * w[0] + model[4]! * w[1] + model[8]! * w[2],
      model[1]! * w[0] + model[5]! * w[1] + model[9]! * w[2],
      model[2]! * w[0] + model[6]! * w[1] + model[10]! * w[2],
    );
  return Math.max(across(u), across(v));
}

/**
 * Occluders for every solid part, in world space. Translucent parts (glass) never hide a
 * label; `look` says which materials are translucent.
 */
export function sceneOccluders(scene: SceneDesc, look: LookConfig): Occluder[] {
  const solid = (material: string) => (look.materials[material]?.opacity ?? 1) >= 1;
  const out: Occluder[] = [];
  for (const part of scene.parts) {
    const model = part.transform;
    if (part.kind !== "mesh" && !solid(part.material)) continue;
    if (part.kind === "block") {
      out.push({
        kind: "box",
        part: part.id,
        bounds: box3.transformMat4(box3.create(), partLocalBounds(part, scene.assets), model),
      });
    } else if (part.kind === "tube") {
      for (let i = 0; i + 1 < part.path.length; i++) {
        const a = part.path[i]!;
        const b = part.path[i + 1]!;
        out.push({
          kind: "capsule",
          part: part.id,
          a: vec3.transformMat4([0, 0, 0], a, model),
          b: vec3.transformMat4([0, 0, 0], b, model),
          radius: part.radius * crossScale(model, a, b),
        });
      }
    } else if (part.kind === "mesh") {
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

/**
 * Anchors resolved to world space through each part's current transform, written into `out`
 * (reused across frames, so per-frame placement allocates nothing once warm). `anchors`
 * defaults to the scene's label anchors; overlays with their own anchors pass them.
 */
export function sceneAnchors(
  scene: SceneDesc,
  anchors: readonly SceneAnchor[] = scene.anchors,
  out: WorldAnchor[] = [],
): WorldAnchor[] {
  out.length = anchors.length;
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]!;
    let part: Part | undefined;
    for (const p of scene.parts) if (p.id === anchor.part) part = p;
    if (!part) throw new Error(`labels: anchor ${anchor.id} names unknown part "${anchor.part}"`);
    const world = (out[i] ??= { id: "", part: "", position: [0, 0, 0], priority: 0 });
    world.id = anchor.id;
    world.part = anchor.part;
    world.priority = anchor.priority;
    vec3.transformMat4(world.position, anchor.local, part.transform);
  }
  return out;
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
  if (a <= 1e-12) t = clamp(f / e, 0, 1);
  else {
    const c = vec3.dot(d1, r);
    if (e <= 1e-12) s = clamp(-c / a, 0, 1);
    else {
      const b = vec3.dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > 1e-12 ? clamp((b * f - c * e) / denom, 0, 1) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp(-c / a, 0, 1);
      } else if (t > 1) {
        t = 1;
        s = clamp((b - c) / a, 0, 1);
      }
    }
  }
  const c1 = vec3.scaleAndAdd(scratch.c1, p0, d1, s);
  const c2 = vec3.scaleAndAdd(scratch.c2, q0, d2, t);
  return vec3.squaredDistance(c1, c2);
}

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
function occludes(occluder: Occluder, origin: Vec3, dir: Vec3, length: number): boolean {
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
 * Places every anchor: projects it, then hides it when behind the eye, off-screen or
 * occluded. Visible labels then take, by priority, the first side whose pill stays on screen
 * and clashes with no kept label and no `obstacle` (e.g. scene text); a label with no such
 * side hides as `overlap`. `out` is reused and returned.
 */
export function placeLabels(
  matrices: CameraMatrices,
  anchors: WorldAnchor[],
  occluders: Occluder[],
  out: LabelPlacement[],
  box: LabelBox = DEFAULT_LABEL_BOX,
  obstacles: readonly ScreenRect[] = [],
): LabelPlacement[] {
  out.length = anchors.length;
  const eye = matrices.eye;
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i]!;
    const placement = (out[i] ??= { id: anchor.id, x: 0, y: 0, visible: false, side: "up-right" });
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
  resolveOverlaps(anchors, out, box, obstacles, matrices);
  return out;
}

const order: number[] = [];
const kept: number[] = [];
const pill = { x: 0, y: 0, width: 0, height: 0 };
const other = { x: 0, y: 0, width: 0, height: 0 };

/** Radius around a dot that another label's pill may not cover, CSS pixels. */
const DOT_CLEARANCE = 6;

/** The pill's rectangle for a placement on its side. */
function pillRect(p: LabelPlacement, width: number, box: LabelBox, out: ScreenRect): ScreenRect {
  const left = p.side === "up-left" || p.side === "down-left";
  const down = p.side === "down-right" || p.side === "down-left";
  out.x = left ? p.x - box.dx - width : p.x + box.dx;
  out.y = down ? p.y - box.dy - box.height : p.y + box.dy;
  out.width = width;
  out.height = box.height;
  return out;
}

function intersects(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function coversDot(rect: ScreenRect, dot: LabelPlacement): boolean {
  return (
    dot.x + DOT_CLEARANCE > rect.x &&
    dot.x - DOT_CLEARANCE < rect.x + rect.width &&
    dot.y + DOT_CLEARANCE > rect.y &&
    dot.y - DOT_CLEARANCE < rect.y + rect.height
  );
}

/**
 * Visits labels by priority (highest first) and gives each the first side that stays on
 * screen and clashes with nothing kept: pills meeting, either pill covering the other's dot,
 * or the pill meeting an obstacle.
 */
function resolveOverlaps(
  anchors: WorldAnchor[],
  out: LabelPlacement[],
  box: LabelBox,
  obstacles: readonly ScreenRect[],
  screen: { width: number; height: number },
): void {
  order.length = 0;
  for (let i = 0; i < anchors.length; i++) order.push(i);
  order.sort((a, b) => anchors[b]!.priority - anchors[a]!.priority);
  kept.length = 0;
  for (const i of order) {
    const p = out[i]!;
    if (!p.visible) continue;
    const width = anchors[i]!.pillWidth ?? box.width;
    let placed = false;
    for (const side of SIDES) {
      p.side = side;
      pillRect(p, width, box, pill);
      let clash =
        pill.x < 0 ||
        pill.y < 0 ||
        pill.x + width > screen.width ||
        pill.y + box.height > screen.height;
      for (let o = 0; !clash && o < obstacles.length; o++) clash = intersects(pill, obstacles[o]!);
      for (let k = 0; !clash && k < kept.length; k++) {
        const q = out[kept[k]!]!;
        pillRect(q, anchors[kept[k]!]!.pillWidth ?? box.width, box, other);
        clash = intersects(pill, other) || coversDot(pill, q) || coversDot(other, p);
      }
      if (!clash) {
        placed = true;
        break;
      }
    }
    if (placed) kept.push(i);
    else {
      p.side = "up-right";
      p.visible = false;
      p.hiddenBy = "overlap";
    }
  }
}
