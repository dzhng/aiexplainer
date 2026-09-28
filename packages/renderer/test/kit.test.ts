import { expect, test } from "bun:test";
import path from "node:path";
import { mat4, vec3, type Vec3 } from "math";
import type { Box3 } from "math/shapes";
import type { ShadowPart } from "../src/frame-input.ts";
import { parseGlb } from "../src/gltf.ts";
import { blockGeometry } from "../src/kit/block.ts";
import { placeBrick } from "../src/kit/brick.ts";
import { KIT, KIT_ENTRIES } from "../src/kit/catalog.ts";
import { TRIAGE_SLOTS, bayCenter } from "../src/kit/triage-bays.ts";
import { PARTS_PER_TILE, setDraftTile } from "../src/kit/draft-strip.ts";
import { shadowGeometry } from "../src/kit/contact-shadow.ts";
import { faceAt } from "../src/kit/die.ts";
import { PIN_PARTS, placePin } from "../src/kit/pins.ts";
import { PIPE_SAMPLES, pipeEntries, pipePath } from "../src/kit/pipes.ts";
import type { Geometry } from "../src/kit/geometry.ts";
import { placeSegment, tubeGeometry } from "../src/kit/tube.ts";

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

test("placeSegment stretches the unit segment between two points without mirroring it", () => {
  const cases: [Vec3, Vec3][] = [
    [
      [0, 0, 0],
      [1, 2, 3],
    ],
    [
      [1, 1, 1],
      [1, 5, 1],
    ],
    [
      [0, 2, 0],
      [0.5, 0.4, 0.8],
    ],
  ];
  for (const [from, to] of cases) {
    const m = mat4.create();
    placeSegment(m as unknown as number[], from, to, 0.1);
    const start = vec3.transformMat4([0, 0, 0], [0, 0, 0], m);
    const end = vec3.transformMat4([0, 0, 0], [0, 1, 0], m);
    const rim = vec3.transformMat4([0, 0, 0], [1, 0, 0], m);
    for (let a = 0; a < 3; a++) {
      expect(start[a]!).toBeCloseTo(from[a]!, 6);
      expect(end[a]!).toBeCloseTo(to[a]!, 6);
    }
    expect(vec3.distance(rim, from)).toBeCloseTo(0.1, 6);
    expect(mat4.determinant(m)).toBeGreaterThan(0);
  }
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

test("tube: each vertex carries the arc length to its ring, for flow pulses", () => {
  const path: Vec3[] = [
    [0, 0, 0],
    [0, 3, 0],
    [4, 3, 0],
  ];
  const g = tubeGeometry(path, 0.1, 8);
  const along = g.along!;
  for (let s = 0; s < 8; s++) {
    expect(along[s]).toBe(0);
    expect(along[8 + s]).toBe(3);
    expect(along[16 + s]).toBe(7);
  }
  // Cap vertices take their end's length.
  expect(Math.max(...along)).toBe(7);
  expect(along[along.length - 1]).toBe(7);
});

test("flows: a sleeve over each path, a little wider than its pipe, one slot each", () => {
  const paths: Vec3[][] = [
    [
      [0, 0, 0],
      [0, 1, 0],
    ],
    [
      [1, 0, 0],
      [1, 1, 0],
    ],
  ];
  const built = KIT.flows.build({ id: "f", slot: 5, material: "pulse", paths, radius: 0.1 });
  expect(built.parts.map((p) => [p.id, p.slot])).toEqual([
    ["f.0", 5],
    ["f.1", 6],
  ]);
  for (const part of built.parts) {
    const tube = part as { path: Vec3[]; radius: number };
    expect(tube.radius).toBeGreaterThan(0.1);
  }
  expect((built.parts[1] as { path: Vec3[] }).path).toEqual(paths[1]!);
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
  for (const [id, primitive] of KIT_ENTRIES) {
    const built = primitive.build(primitive.example({ board }));
    expect(built.parts.length).toBeGreaterThan(0);
    expect(built.anchors.length).toBeGreaterThan(0);
    for (const part of built.parts) expect(part.primitive).toBe(id);
    for (const anchor of built.anchors) {
      const part = built.parts.find((p) => p.id === anchor.part);
      expect(part).toBeDefined();
      const world = vec3.transformMat4([0, 0, 0], anchor.local, part!.transform);
      for (let a = 0; a < 3; a++) {
        expect(world[a]!).toBeGreaterThanOrEqual(built.bounds[a]! - 1e-5);
        expect(world[a]!).toBeLessThanOrEqual(built.bounds[a + 3]! + 1e-5);
      }
    }
  }
});

test("the mesh primitive splits a prop into one part per node", async () => {
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
  });
  const byId = Object.fromEntries(built.parts.map((p) => [p.id, p]));
  expect(Object.keys(byId)).toContain("board.housing");
  expect(Object.keys(byId)).toContain("board.slot.3");
  expect(byId["board.rail"]).toMatchObject({ kind: "mesh", node: "board.rail" });
});

test("equal tubes share one geometry (one instanced draw); a changed path gets its own", () => {
  const unit = (top: number): Vec3[] => [
    [0, 0, 0],
    [0, top, 0],
  ];
  expect(tubeGeometry(unit(1), 1)).toBe(tubeGeometry(unit(1), 1));
  expect(tubeGeometry(unit(1), 1)).not.toBe(tubeGeometry(unit(2), 1));
});

test("brick: studs follow its length, and the ones past it are parked out of sight", () => {
  const built = KIT.brick.build({
    id: "b",
    slot: 0,
    material: "m",
    center: [0, 1, 0],
    unit: 0.2,
    length: 3,
    studs: 3,
  });
  placeBrick(built.parts, { center: [0, 1, 0], unit: 0.2, length: 1 });
  const [body, ...studs] = built.parts;
  expect(body!.transform[0]).toBeCloseTo(0.2, 6);
  // The stud's base sits on the body's top face (1 + half of 1.2 × 0.2).
  expect(studs[0]!.transform[13]).toBeCloseTo(1.12, 6);
  expect(studs[1]!.transform[13]).toBeLessThan(-10);
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

test("contact shadow on feet: a tight footprint per foot over a faint one under the body", () => {
  const feet: Box3[] = [
    [-1, 0, -0.4, -0.9, 0.7, -0.3],
    [0.9, 0, 0.2, 1, 0.7, 0.3],
  ];
  const built = KIT.contactShadow.build({
    id: "s",
    slot: 0,
    bounds: [-1, 0, -0.4, 1, 2, 0.3],
    softness: 0.3,
    feet,
    footSoftness: 0.1,
  });
  expect(built.parts.map((part) => [part.id, (part as ShadowPart).material])).toEqual([
    ["s", "shadowAmbient"],
    ["s.0", "shadow"],
    ["s.1", "shadow"],
  ]);
  feet.forEach((foot, i) => {
    const t = built.parts[i + 1]!.transform;
    // Centred on the foot, its soft edge reaching `footSoftness` past it.
    expect(t[12]).toBeCloseTo((foot[0] + foot[3]) / 2, 6);
    expect(t[14]).toBeCloseTo((foot[2] + foot[5]) / 2, 6);
    expect(t[0]).toBeCloseTo(foot[3] - foot[0] + 0.2, 6);
    // Above the body's footprint, so it draws over it rather than fighting it.
    expect(t[13]).toBeGreaterThan(built.parts[0]!.transform[13]!);
  });
});

test("pins: each arrow runs from the origin exactly to its head, at its own thin radius", () => {
  const origin: Vec3 = [0.1, 0.2, -0.3];
  const head: Vec3 = [0.8, 0.9, 0.4];
  const built = KIT.pins.build({
    id: "p",
    slot: 0,
    heads: [head],
    floor: 0,
    origin,
    headMaterial: "m",
    needleMaterial: "m",
    arrowMaterial: "m",
  });
  const arrow = built.parts[PIN_PARTS - 1]!;
  const tip = vec3.transformMat4([0, 0, 0], [1, 0, 0], arrow.transform);
  for (let a = 0; a < 3; a++) expect(tip[a]!).toBeCloseTo(head[a]!, 6);
  // The cross-section axes are unit length: the tube's own radius is the arrow's.
  expect(Math.hypot(arrow.transform[4]!, arrow.transform[5]!, arrow.transform[6]!)).toBeCloseTo(
    1,
    6,
  );
  // Half grown, it reaches halfway; parked pins go out of sight.
  placePin(built.parts, 0, head, 0, origin, 0.5);
  const half = vec3.transformMat4([0, 0, 0], [1, 0, 0], arrow.transform);
  expect(half[0]!).toBeCloseTo((origin[0] + head[0]) / 2, 6);
  placePin(built.parts, 0, null, 0, origin, 1);
  expect(built.parts[0]!.transform[13]!).toBeLessThan(-10);
});

test("die: each face spans its share of the rim, and the face read is the one there", () => {
  const shares = [0.5, 0.3, 0.2];
  const built = KIT.die.build({
    id: "d",
    slot: 0,
    center: [0, 1, 0],
    radius: 0.3,
    length: 0.5,
    thickness: 0.04,
    materials: ["a", "b", "c"],
    staves: 6,
    coreMaterial: "core",
    shares,
  });
  // Stave k of face f sits at the middle of its step around the rim, from +y towards +z.
  const centre = (f: number, k: number) => {
    const t = built.parts[f * 6 + k]!.transform;
    return Math.atan2(t[14]!, t[13]! - 1);
  };
  expect(centre(0, 0)).toBeCloseTo((0.5 * Math.PI * 2 * 0.5) / 6, 6);
  // atan2 wraps past π: compare on the circle.
  expect(Math.cos(centre(1, 0))).toBeCloseTo(Math.cos(Math.PI * 2 * (0.5 + 0.3 / 12)), 6);
  // Reading straight up with face 0 starting there reads face 0; a quarter turn back, face 1.
  expect(faceAt(shares, 0)).toBe(0);
  expect(faceAt(shares, -Math.PI * 2 * 0.6)).toBe(1);
  expect(faceAt(shares, 0, Math.PI * 2 * 0.9)).toBe(2);
});

test("draft strip: each tile shows exactly one face, the one for its state", () => {
  const params = KIT.draftStrip.example({});
  const { parts } = KIT.draftStrip.build(params);
  expect(parts).toHaveLength(params.count * PARTS_PER_TILE);
  const visible = (i: number) =>
    parts
      .slice(i * PARTS_PER_TILE, (i + 1) * PARTS_PER_TILE)
      .filter((p) => p.transform[13]! > -1)
      .map((p) => p.id);
  expect(visible(0)).toEqual(["draft.0.accepted"]);
  expect(visible(2)).toEqual(["draft.2.rejected"]);
  expect(visible(3)).toEqual(["draft.3.added"]);
  expect(visible(4)).toEqual(["draft.4"]);
  setDraftTile(parts, 4, "hidden", [0, 1, 0], params.tile);
  expect(visible(4)).toEqual([]);
});

test("triage bays: a booth and a lamp per bay, each lamp on its own slot, and a desk", () => {
  const params = KIT.triageBays.example({});
  const { parts } = KIT.triageBays.build(params);
  const lamps = parts.filter((p) => p.id.endsWith(".lamp"));
  expect(lamps.map((p) => p.slot)).toEqual(
    Array.from({ length: params.bays }, (_, i) => params.slot + TRIAGE_SLOTS.lamps + i),
  );
  // Each lamp sits over its own bay.
  lamps.forEach((lamp, i) => expect(lamp.transform[12]).toBeCloseTo(bayCenter(params, i)[0], 6));
  expect(parts.filter((p) => p.id.endsWith(".desk"))).toHaveLength(1);
});
