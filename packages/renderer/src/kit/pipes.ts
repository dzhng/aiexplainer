/**
 * The `pipes` primitive (chapter 4's PipeNetwork): one tube from each source point up into a
 * sink, one dynamics slot per pipe. Each pipe is built at `radius`; the scene sets its width
 * every frame through `FrameDynamics.widthScale`, a radius multiplier, so a pipe's width is
 * proportional to the value it carries. Pipes leave their source straight up and enter the
 * sink's underside from below on a cubic Bézier curve, like the mock's
 * (explore/directions.html). Their entry points spread across the sink's underside in the same
 * arrangement as their sources, so a fan of many pipes never knots into one bundle and each
 * stays traceable from its word into the sink.
 */
import { vec3, type Vec3, mat4 } from "math";
import type { TubePart } from "../frame-input.ts";
import { unionBounds, type KitCommon, type KitPrimitive } from "./primitive.ts";
import { tubeGeometry } from "./tube.ts";

export interface PipeFan {
  /** Where each pipe starts (pipe i is `<id>.<i>`, in dynamics slot `slot + i`). */
  sources: Vec3[];
  /** The centre of the sink's underside. */
  sink: Vec3;
  /** How far the entry points spread across the sink's underside: x and z extents, metres. */
  spread?: [number, number];
  /** How far each pipe runs straight up out of its source and into the sink, metres. */
  lift?: number;
}

export interface PipesParams extends KitCommon, PipeFan {
  material: string;
  /** The radius at widthScale 1. */
  radius: number;
}

/** Points along each pipe's centreline (the Bézier sampled evenly in its parameter). */
export const PIPE_SAMPLES = 28;
const DEFAULT_LIFT = 0.45;

/**
 * The centreline from `from` to `to`: up out of `from`, then curving into `to` from below.
 * Everything that follows a pipe (its sealed stub, its flow) uses this same path.
 */
export function pipePath(
  from: Vec3,
  to: Vec3,
  lift = DEFAULT_LIFT,
  samples = PIPE_SAMPLES,
): Vec3[] {
  // Control points: straight up from the source, straight down from the sink, each by `lift`
  // (never more than about half the rise, so a short pipe doesn't overshoot its sink).
  const rise = Math.max(0.05, to[1] - from[1]);
  const up = Math.min(lift, rise * 0.6);
  const down = Math.min(lift, rise * 0.5);
  const c1: Vec3 = [from[0], from[1] + up, from[2]];
  const c2: Vec3 = [to[0], to[1] - down, to[2]];
  const path: Vec3[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    const u = 1 - t;
    const a = u * u * u;
    const b = 3 * u * u * t;
    const c = 3 * u * t * t;
    const d = t * t * t;
    path.push([
      a * from[0] + b * c1[0] + c * c2[0] + d * to[0],
      a * from[1] + b * c1[1] + c * c2[1] + d * to[1],
      a * from[2] + b * c1[2] + c * c2[2] + d * to[2],
    ]);
  }
  return path;
}

/**
 * Each source's entry point on the sink's underside: the sources' own layout, squeezed into
 * `spread` around `sink` (a source at the far left enters at the underside's left edge).
 */
export function pipeEntries(fan: PipeFan): Vec3[] {
  const [sx, sz] = fan.spread ?? [0, 0];
  const lo: Vec3 = [Infinity, 0, Infinity];
  const hi: Vec3 = [-Infinity, 0, -Infinity];
  for (const s of fan.sources)
    for (const a of [0, 2] as const) {
      lo[a] = Math.min(lo[a], s[a]);
      hi[a] = Math.max(hi[a], s[a]);
    }
  const across = (v: number, a: 0 | 2, extent: number) =>
    hi[a] > lo[a] ? ((v - lo[a]) / (hi[a] - lo[a]) - 0.5) * extent : 0;
  return fan.sources.map((s) => [
    fan.sink[0] + across(s[0], 0, sx),
    fan.sink[1],
    fan.sink[2] + across(s[2], 2, sz),
  ]);
}

/** Every pipe's centreline, in source order. */
export function pipePaths(fan: PipeFan): Vec3[][] {
  const entries = pipeEntries(fan);
  return fan.sources.map((source, i) => pipePath(source, entries[i]!, fan.lift));
}

export const pipes: KitPrimitive<PipesParams> = {
  build(p) {
    const paths = pipePaths(p);
    const parts: TubePart[] = paths.map((path, i) => ({
      kind: "tube",
      id: `${p.id}.${i}`,
      slot: p.slot + i,
      material: p.material,
      path,
      radius: p.radius,
      transform: mat4.create(),
      explode: p.explode,
      cutaway: p.cutaway,
      primitive: "pipes",
    }));
    // The first pipe's midpoint (its anchor is on the path, inside the bounds).
    const first = parts[0]!.path;
    const middle = first[Math.floor(first.length / 2)]!;
    return {
      parts,
      bounds: unionBounds(parts.map((part) => tubeGeometry(part.path, part.radius).bounds)),
      anchors: [{ id: p.id, part: parts[0]!.id, local: vec3.clone(middle), priority: 1 }],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: () => ({
    id: "pipes",
    slot: 0,
    material: "pipe",
    sources: Array.from({ length: 7 }, (_, i): Vec3 => [(i - 3) * 0.32, 0, (i % 2) * 0.3 - 0.15]),
    sink: [0.4, 1.3, 0],
    spread: [0.8, 0.15],
    radius: 0.07,
  }),
};
