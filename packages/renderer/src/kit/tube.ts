import { vec3, type Vec3, mat4 } from "math";
import type { TubePart } from "../frame-input.ts";
import { boundsOf, type Geometry } from "./geometry.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";

const TUBE_SIDES = 24;

/**
 * Sweeps a circle along a polyline. Rings sit in the bisecting plane at each joint and are
 * stretched across the bend (a miter), so the tube keeps its radius through corners.
 * Frames are parallel-transported so the tube never twists. Both ends get flat caps. Every
 * vertex's `axis` is its ring's centreline point, so `widthScale` widens the tube in place, and its `along` is the arc length to that ring.
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
  const axis = new Float32Array(vertexCount * 3);
  const along = new Float32Array(vertexCount);
  // Arc length to each ring: flow pulses are laid out along it.
  const distance = [0];
  for (let i = 1; i < rings; i++)
    distance.push(distance[i - 1]! + vec3.distance(path[i - 1]!, path[i]!));
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
  const put = (p: Vec3, n: Vec3, ring: number) => {
    positions.set(p, v * 3);
    normals.set(n, v * 3);
    axis.set(path[ring]!, v * 3);
    along[v] = distance[ring]!;
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
      put(p, dir, i);
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
    const centre = put(path[end]!, n, end);
    const first = v;
    for (let s = 0; s < sides; s++) {
      const ring = end * sides + s;
      put([positions[ring * 3]!, positions[ring * 3 + 1]!, positions[ring * 3 + 2]!], n, end);
    }
    for (let s = 0; s < sides; s++) {
      const a = first + s;
      const b = first + ((s + 1) % sides);
      indices.set(end === 0 ? [centre, b, a] : [centre, a, b], k);
      k += 3;
    }
  }

  return { positions, normals, axis, along, indices, bounds: boundsOf(positions) };
}

/** A straight tube of radius 1 from the origin to +Y 1: `placeSegment` stretches it anywhere. */
export const UNIT_SEGMENT: Vec3[] = [
  [0, 0, 0],
  [0, 1, 0],
];

/**
 * Places a `UNIT_SEGMENT` tube's `transform` so it runs from `from` to `to` with `radius`
 * (allocation-free; for straight pipes that move or stretch every frame). A zero-length
 * segment keeps a sliver along +Y, since a zero scale has no normal matrix.
 */
export function placeSegment(transform: number[], from: Vec3, to: Vec3, radius: number): void {
  let ax = to[0] - from[0];
  let ay = to[1] - from[1];
  let az = to[2] - from[2];
  const length = Math.hypot(ax, ay, az);
  if (length < 1e-6) {
    ax = 0;
    ay = 1e-4;
    az = 0;
  }
  const len = Math.max(length, 1e-4);
  // A side axis perpendicular to the segment, from whichever world axis is least parallel.
  const ux = ax / len;
  const uy = ay / len;
  const uz = az / len;
  let sx: number;
  let sy: number;
  let sz: number;
  if (Math.abs(uy) < 0.9) {
    // side = normalize(up × axis) with up = +Y
    sx = uz;
    sy = 0;
    sz = -ux;
  } else {
    // side = normalize(axis × +X)
    sx = 0;
    sy = uz;
    sz = -uy;
  }
  const sl = Math.hypot(sx, sy, sz);
  sx /= sl;
  sy /= sl;
  sz /= sl;
  // other = side × axis, so (side, axis, other) is right-handed and faces keep their winding.
  const ox = sy * uz - sz * uy;
  const oy = sz * ux - sx * uz;
  const oz = sx * uy - sy * ux;
  transform[0] = sx * radius;
  transform[1] = sy * radius;
  transform[2] = sz * radius;
  transform[3] = 0;
  transform[4] = ax;
  transform[5] = ay;
  transform[6] = az;
  transform[7] = 0;
  transform[8] = ox * radius;
  transform[9] = oy * radius;
  transform[10] = oz * radius;
  transform[11] = 0;
  transform[12] = from[0];
  transform[13] = from[1];
  transform[14] = from[2];
  transform[15] = 1;
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
      transform: mat4.create(),
      primitive: "tube",
    };
    // The middle of the path by vertex count: a vertex, or the midpoint of the middle segment.
    const a = p.path[Math.floor((p.path.length - 1) / 2)]!;
    const b = p.path[Math.ceil((p.path.length - 1) / 2)]!;
    return {
      parts: [part],
      bounds: tubeGeometry(p.path, p.radius).bounds,
      anchors: [{ id: p.id, part: p.id, local: vec3.lerp([0, 0, 0], a, b, 0.5), priority: 1 }],
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
