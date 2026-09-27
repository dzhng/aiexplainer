import { vec3, type Vec3 } from "math";
import type { TubePart } from "../frame-input.ts";
import { boundsOf, type Geometry } from "./geometry.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";

export const TUBE_SIDES = 24;

/**
 * Sweeps a circle along a polyline. Rings sit in the bisecting plane at each joint and are
 * stretched across the bend (a miter), so the tube keeps its radius through corners.
 * Frames are parallel-transported so the tube never twists. Both ends get flat caps.
 */
export function tubeGeometry(path: Vec3[], radius: number, sides = TUBE_SIDES): Geometry {
  if (path.length < 2) throw new Error("tube: a path needs at least two points");
  // Equal tubes share one geometry, so the scene draws them as one instanced draw (a brick's
  // studs, a field of pins: one unit tube placed by each part's transform). Keyed by value,
  // so a path edited in place and re-uploaded never reads a stale shape.
  const key = `${radius},${sides}:${path.join(";")}`;
  const cached = geometryCache.get(key);
  if (cached) return cached;
  if (geometryCache.size >= GEOMETRY_CACHE_LIMIT) geometryCache.clear();
  const geometry = sweep(path, radius, sides);
  geometryCache.set(key, geometry);
  return geometry;
}

const GEOMETRY_CACHE_LIMIT = 256;
const geometryCache = new Map<string, Geometry>();

function sweep(path: Vec3[], radius: number, sides: number): Geometry {
  const rings = path.length;
  const vertexCount = rings * sides + 2 * (sides + 1);
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array((rings - 1) * sides * 6 + 2 * sides * 3);

  const tIn: Vec3 = [0, 0, 0];
  const tOut: Vec3 = [0, 0, 0];
  const tangent: Vec3 = [0, 0, 0];
  const bend: Vec3 = [0, 0, 0];
  const normal: Vec3 = [0, 0, 0];
  const binormal: Vec3 = [0, 0, 0];
  const dir: Vec3 = [0, 0, 0];
  const tangents: Vec3[] = [];

  let v = 0;
  const put = (p: Vec3, n: Vec3) => {
    positions.set(p, v * 3);
    normals.set(n, v * 3);
    return v++;
  };

  for (let i = 0; i < rings; i++) {
    const prev = path[Math.max(0, i - 1)]!;
    const next = path[Math.min(rings - 1, i + 1)]!;
    vec3.normalize(tIn, vec3.subtract(tIn, path[i]!, prev));
    vec3.normalize(tOut, vec3.subtract(tOut, next, path[i]!));
    if (i === 0) vec3.copy(tIn, tOut);
    if (i === rings - 1) vec3.copy(tOut, tIn);
    vec3.normalize(tangent, vec3.add(tangent, tIn, tOut));
    tangents.push(vec3.clone(tangent));
    const cosHalf = vec3.dot(tangent, tIn);
    vec3.subtract(bend, tOut, tIn);
    const bent = vec3.length(bend) > 1e-6;
    if (bent) vec3.normalize(bend, bend);

    if (i === 0) {
      // Any vector not parallel to the tangent seeds the frame.
      const seed: Vec3 = Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      vec3.normalize(normal, vec3.cross(normal, vec3.cross(normal, tangent, seed), tangent));
    } else {
      vec3.scaleAndAdd(normal, normal, tangent, -vec3.dot(normal, tangent));
      vec3.normalize(normal, normal);
    }
    vec3.cross(binormal, tangent, normal);

    for (let s = 0; s < sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      vec3.scale(dir, normal, Math.cos(a));
      vec3.scaleAndAdd(dir, dir, binormal, Math.sin(a));
      const p = vec3.scaleAndAdd([0, 0, 0], path[i]!, dir, radius);
      if (bent) vec3.scaleAndAdd(p, p, bend, radius * vec3.dot(dir, bend) * (1 / cosHalf - 1));
      put(p, dir);
    }
  }

  let k = 0;
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < sides; s++) {
      const a = i * sides + s;
      const b = i * sides + ((s + 1) % sides);
      const c = a + sides;
      const e = b + sides;
      indices.set([a, b, e, a, e, c], k);
      k += 6;
    }
  }

  for (const end of [0, rings - 1]) {
    const n = vec3.scale([0, 0, 0], tangents[end]!, end === 0 ? -1 : 1);
    const centre = put(path[end]!, n);
    const first = v;
    for (let s = 0; s < sides; s++) {
      const ring = end * sides + s;
      put([positions[ring * 3]!, positions[ring * 3 + 1]!, positions[ring * 3 + 2]!], n);
    }
    for (let s = 0; s < sides; s++) {
      const a = first + s;
      const b = first + ((s + 1) % sides);
      indices.set(end === 0 ? [centre, b, a] : [centre, a, b], k);
      k += 3;
    }
  }

  return { positions, normals, indices, bounds: boundsOf(positions) };
}

export interface TubeParams extends KitCommon {
  material: string;
  /** World-space centreline (the part's transform is the identity). */
  path: Vec3[];
  radius: number;
}

/** The `tube` primitive: a pipe along a path. Its anchor sits on the path's middle. */
export const tube: KitPrimitive<TubeParams> = {
  build(p) {
    const part: TubePart = {
      kind: "tube",
      id: p.id,
      slot: p.slot,
      material: p.material,
      path: p.path,
      radius: p.radius,
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "tube",
    };
    // The middle of the path by vertex count: a vertex, or the midpoint of the middle segment.
    const a = p.path[Math.floor((p.path.length - 1) / 2)]!;
    const b = p.path[Math.ceil((p.path.length - 1) / 2)]!;
    return {
      parts: [part],
      bounds: tubeGeometry(p.path, p.radius).bounds,
      anchors: [{ id: p.id, part: p.id, local: vec3.lerp([0, 0, 0], a, b, 0.5), priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "tube",
    slot: 0,
    material: "metal",
    path: [
      [-1, 0.2, 0],
      [-0.4, 1.2, 0],
      [0.6, 1.2, 0],
      [1, 0.2, 0],
    ],
    radius: 0.08,
  }),
};
