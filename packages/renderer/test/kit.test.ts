import { expect, test } from "bun:test";
import { vec3, type Vec3 } from "math";
import { blockGeometry } from "../src/kit/block.ts";
import type { Geometry } from "../src/kit/geometry.ts";
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

test("tube: a path needs two points", () => {
  expect(() => tubeGeometry([[0, 0, 0]], 1)).toThrow();
});
