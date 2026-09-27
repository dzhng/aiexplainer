import { expect, test } from "bun:test";
import path from "node:path";
import { mat4, vec3, type Vec3 } from "math";
import { partWorld } from "../src/camera.ts";
import { parseGlb } from "../src/gltf.ts";
import { blockGeometry } from "../src/kit/block.ts";
import { KIT, KIT_ENTRIES } from "../src/kit/catalog.ts";
import { shadowGeometry } from "../src/kit/contact-shadow.ts";
import type { Geometry } from "../src/kit/geometry.ts";
import { PIPE_SAMPLES, pipeEntries, pipePath } from "../src/kit/pipes.ts";
import { tubeGeometry } from "../src/kit/tube.ts";

const at = (a: Float32Array, i: number): Vec3 => [a[i * 3]!, a[i * 3 + 1]!, a[i * 3 + 2]!];

/** Every triangle winds counter-clockwise when seen from the side its normals point to. */
function expectOutwardWinding(g: Geometry) {
  for (let t = 0; t < g.indices.length; t += 3) {
    const a = g.indices[t]!;
    const b = g.indices[t + 1]!;
    const c = g.indices[t + 2]!;
    const pa = at(g.positions, a);
    const face = vec3.cross(
      [0, 0, 0],
      vec3.subtract([0, 0, 0], at(g.positions, b), pa),
      vec3.subtract([0, 0, 0], at(g.positions, c), pa),
    );
    expect(vec3.dot(face, at(g.normals, a))).toBeGreaterThan(0);
  }
}

test("block: a unit cube with outward-wound faces", () => {
  const g = blockGeometry();
  expect(g.indices.length).toBe(36);
  expect(g.bounds).toEqual([-0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);
  expectOutwardWinding(g);
});

test("tube: outward winding, capped ends, and a constant radius through a right-angle bend", () => {
  const path: Vec3[] = [
    [0, 0, 0],
    [2, 0, 0],
    [2, 2, 0],
  ];
  const g = tubeGeometry(path, 0.25, 16);
  expectOutwardWinding(g);
  // Ring vertices of the straight end segments sit exactly `radius` from the axis.
  for (let s = 0; s < 16; s++) {
    const p = at(g.positions, s);
    expect(Math.hypot(p[1], p[2])).toBeCloseTo(0.25, 5);
  }
  // The miter ring at the bend reaches √2·r along the bend's diagonal.
  const corner = [...Array(16).keys()].map((s) => vec3.distance(at(g.positions, 16 + s), path[1]!));
  expect(Math.max(...corner)).toBeCloseTo(0.25 * Math.SQRT2, 3);
  expect(Math.min(...corner)).toBeCloseTo(0.25, 5);
  expect(g.bounds[3]).toBeCloseTo(2.25, 5);
});

test("tube: every vertex scales about its ring's centreline point (widthScale)", () => {
  const path: Vec3[] = [
    [0, 0, 0],
    [1, 1, 0],
    [2, 1, 1],
  ];
  const g = tubeGeometry(path, 0.2, 12);
  const axis = g.axis!;
  for (let v = 0; v < g.positions.length / 3; v++) {
    const a = at(axis, v);
    expect(path.some((p) => vec3.distance(p, a) < 1e-6)).toBe(true);
    // Straight-segment rings sit exactly one radius out; the miter ring and caps no further
    // than the miter allows.
    expect(vec3.distance(at(g.positions, v), a)).toBeLessThanOrEqual(0.2 * Math.SQRT2 + 1e-6);
  }
  for (let s = 0; s < 12; s++)
    expect(vec3.distance(at(g.positions, s), at(axis, s))).toBeCloseTo(0.2, 5);
});

test("pipes: each leaves its source straight up and ends at the sink, one slot per pipe", () => {
  const sources: Vec3[] = [
    [-1, 0, 0],
    [0.5, 0.2, 0.4],
  ];
  const sink: Vec3 = [0, 2, 0];
  const built = KIT.pipes.build({ id: "p", slot: 3, material: "pipe", sources, sink, radius: 0.1 });
  expect(built.parts.map((p) => [p.id, p.slot])).toEqual([
    ["p.0", 3],
    ["p.1", 4],
  ]);
  built.parts.forEach((part, i) => {
    const path = (part as { path: Vec3[] }).path;
    expect(path.length).toBe(PIPE_SAMPLES);
    expect(vec3.distance(path[0]!, sources[i]!)).toBeLessThan(1e-9);
    expect(vec3.distance(path.at(-1)!, sink)).toBeLessThan(1e-9);
    // Leaving the source, the pipe heads up; arriving, it comes up from below.
    const out = vec3.normalize([0, 0, 0], vec3.subtract([0, 0, 0], path[1]!, path[0]!));
    const into = vec3.normalize([0, 0, 0], vec3.subtract([0, 0, 0], path.at(-1)!, path.at(-2)!));
    expect(out[1]).toBeGreaterThan(0.9);
    expect(into[1]).toBeGreaterThan(0.9);
  });
  expect(pipePath(sources[0]!, sink)).toEqual((built.parts[0] as { path: Vec3[] }).path);
});

test("pipes: entries spread across the sink's underside in their sources' arrangement", () => {
  const sources: Vec3[] = [
    [-2, 0, 0.5],
    [0, 0, 0],
    [2, 0, -0.5],
  ];
  const entries = pipeEntries({ sources, sink: [1, 3, 0], spread: [0.8, 0.2] });
  expect(entries).toEqual([
    [0.6, 3, 0.1],
    [1, 3, 0],
    [1.4, 3, -0.1],
  ]);
  // Without a spread, every pipe meets at the sink.
  for (const e of pipeEntries({ sources, sink: [1, 3, 0] })) expect(e).toEqual([1, 3, 0]);
});

test("sealed: a short stub rises from each source and ends in a wider cap, one slot each", () => {
  const sources: Vec3[] = [
    [0, 0, 0],
    [1, 0.2, 0],
  ];
  const built = KIT.sealed.build({
    id: "s",
    slot: 2,
    material: "pipe",
    capMaterial: "sealed",
    sources,
    radius: 0.02,
  });
  expect(built.parts.map((p) => [p.id, p.slot])).toEqual([
    ["s.0", 2],
    ["s.0.cap", 2],
    ["s.1", 3],
    ["s.1.cap", 3],
  ]);
  for (let i = 0; i < 2; i++) {
    const stub = built.parts[2 * i] as { path: Vec3[]; radius: number };
    const cap = built.parts[2 * i + 1] as { path: Vec3[]; radius: number };
    expect(stub.path[0]).toEqual(sources[i]!);
    expect(stub.path.at(-1)![1]).toBeGreaterThan(sources[i]![1]);
    expect(cap.radius).toBeGreaterThan(stub.radius);
    // The cap straddles the stub's top.
    const mid = vec3.lerp([0, 0, 0], cap.path[0]!, cap.path[1]!, 0.5);
    expect(vec3.distance(mid, stub.path.at(-1)!)).toBeLessThan(1e-9);
  }
});

test("tube: a path needs two points", () => {
  expect(() => tubeGeometry([[0, 0, 0]], 1)).toThrow();
});

test("every kit primitive's anchors lie inside its bounds, and its parts are tagged", async () => {
  const board = parseGlb(
    await Bun.file(
      path.resolve(import.meta.dirname, "../../../apps/explainer/public/props/counter_board.glb"),
    ).arrayBuffer(),
  );
  const whole = { mode: "whole" as const, t: 0 };
  for (const [id, primitive] of KIT_ENTRIES) {
    const built = primitive.build(primitive.example({ board }));
    expect(built.parts.length).toBeGreaterThan(0);
    expect(built.anchors.length).toBeGreaterThan(0);
    for (const part of built.parts) expect(part.primitive).toBe(id);
    for (const anchor of built.anchors) {
      const part = built.parts.find((p) => p.id === anchor.part);
      expect(part).toBeDefined();
      const world = vec3.transformMat4(
        [0, 0, 0],
        anchor.local,
        partWorld(part!, whole, mat4.create()),
      );
      for (let a = 0; a < 3; a++) {
        expect(world[a]!).toBeGreaterThanOrEqual(built.bounds[a]! - 1e-5);
        expect(world[a]!).toBeLessThanOrEqual(built.bounds[a + 3]! + 1e-5);
      }
    }
  }
});

test("the mesh primitive splits a prop into one part per node, with per-node views", async () => {
  const board = parseGlb(
    await Bun.file(
      path.resolve(import.meta.dirname, "../../../apps/explainer/public/props/counter_board.glb"),
    ).arrayBuffer(),
  );
  const built = KIT.mesh.build({
    id: "board",
    slot: 0,
    assetId: "board",
    asset: board,
    split: true,
    nodeExplode: { "board.": [0, 0, -1], "board.rail": [0, 0, 1] },
    clip: ["board.housing"],
  });
  const byId = Object.fromEntries(built.parts.map((p) => [p.id, p]));
  expect(Object.keys(byId)).toContain("board.housing");
  expect(Object.keys(byId)).toContain("board.slot.3");
  expect(byId["board.rail"]!.explode).toEqual([0, 0, 1]);
  expect(byId["board.stand"]!.explode).toEqual([0, 0, -1]);
  expect(byId["board.housing"]!.cutaway).toBe("clip");
  expect(byId["board.rail"]!.cutaway).toBe("keep");
});

test("contact shadow: faces up, solid at the centre, fading to nothing at the edge", () => {
  const g = shadowGeometry();
  expectOutwardWinding(g);
  const coverage = (x: number, z: number) => {
    let best = 0;
    let dist = Infinity;
    for (let i = 0; i < g.ao!.length; i++) {
      const d = Math.hypot(g.positions[i * 3]! - x, g.positions[i * 3 + 2]! - z);
      if (d < dist) [dist, best] = [d, g.ao![i]!];
    }
    return best;
  };
  expect(coverage(0, 0)).toBe(1);
  expect(coverage(0.5, 0)).toBe(0);
  expect(coverage(0.5, 0.5)).toBe(0);
  expect(coverage(0.3, 0)).toBeGreaterThan(0);
  expect(coverage(0.3, 0)).toBeLessThan(1);
});

test("contact shadow sits just above the floor under the subject's footprint, with a soft margin", () => {
  const built = KIT.contactShadow.build({
    id: "s",
    slot: 0,
    bounds: [-1, 0, -0.4, 1, 2, 0.3],
    softness: 0.3,
  });
  const [x0, y0, z0, x1, , z1] = built.bounds;
  expect([x0, z0, x1, z1].map((v) => Math.round(v * 100) / 100)).toEqual([-1.3, -0.7, 1.3, 0.6]);
  expect(y0).toBeGreaterThan(0);
  expect(y0).toBeLessThan(0.01);
});
