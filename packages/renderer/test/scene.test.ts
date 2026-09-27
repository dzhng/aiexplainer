import { expect, test } from "bun:test";
import type { LookConfig, Part } from "../src/frame-input.ts";
import type { MeshAsset, MeshNode } from "../src/gltf.ts";
import { compileScene, partWorldBounds } from "../src/scene.ts";

const look: LookConfig = {
  room: { wallTop: [0, 0, 0], wallBottom: [0, 0, 0] },
  materials: {
    metal: { baseColor: [0.2, 0.2, 0.3], opacity: 1 },
    glass: { baseColor: [0.2, 0.4, 0.9], opacity: 0.3 },
  },
};

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as Part["transform"];
const block = (id: string, material: string, slot = 0): Part => ({
  kind: "block",
  id,
  slot,
  material,
  transform: identity,
});

test("blocks share one instanced draw per pass; translucent draws come last", () => {
  const compiled = compileScene(
    {
      revision: 1,
      assets: {},
      parts: [
        block("a", "metal"),
        block("g", "glass", 3),
        {
          kind: "tube",
          id: "t",
          slot: 1,
          material: "metal",
          radius: 0.1,
          path: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          transform: identity,
        },
        block("b", "metal"),
      ],
    },
    look,
  );
  expect(compiled.draws.map((d) => [d.instanceCount, d.translucent])).toEqual([
    [2, false],
    [1, false],
    [1, true],
  ]);
  expect(compiled.instanceParts.map((p) => p.id)).toEqual(["a", "b", "t", "g"]);
  expect([...compiled.materialIndex]).toEqual([0, 0, 0, 1]);
  expect(compiled.slotCount).toBe(4);
  // The two block draws share the cube's vertices.
  expect(compiled.draws[0]!.baseVertex).toBe(compiled.draws[2]!.baseVertex);
});

test("an unknown material is rejected with the part named", () => {
  expect(() =>
    compileScene({ revision: 1, parts: [block("x", "chrome")], assets: {} }, look),
  ).toThrow(/x.*chrome/);
});

test("partWorldBounds places local bounds with the part transform", () => {
  const part: Part = {
    ...block("s", "metal"),
    transform: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1],
  };
  const out = partWorldBounds(part, {}, { mode: "whole", t: 0 }, [0, 0, 0, 0, 0, 0]);
  expect(out).toEqual([4, -0.5, -0.5, 6, 0.5, 0.5]);
});

function node(name: string, material: string): MeshNode {
  return {
    name,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    material: {
      name: material,
      baseColor: [1, 1, 1],
      opacity: 1,
      metallic: 0,
      roughness: 1,
      emissive: [0, 0, 0],
    },
    bounds: [0, 0, 0, 1, 1, 0],
  };
}

test("mesh nodes bind presets by name and instance across parts", () => {
  const asset: MeshAsset = {
    nodes: [node("board.glass", "whatever"), node("board.slot.3", "metal")],
    bounds: [0, 0, 0, 1, 1, 0],
  };
  const mesh = (id: string, n?: string): Part => ({
    kind: "mesh",
    id,
    slot: 0,
    asset: "board",
    node: n,
    transform: identity,
    explode: [0, 0, 0],
    cutaway: "keep",
  });
  const compiled = compileScene(
    { revision: 1, assets: { board: asset }, parts: [mesh("whole"), mesh("slot", "board.slot.3")] },
    look,
  );
  // The slot node is drawn by both parts in one instanced draw; the glass node is translucent.
  expect(compiled.draws.map((d) => [d.instanceCount, d.translucent])).toEqual([
    [2, false],
    [1, true],
  ]);
  expect([...compiled.materialIndex]).toEqual([0, 0, 1]);
  const orphan = { ...asset, nodes: [node("board.rail", "chrome")] };
  expect(() =>
    compileScene({ revision: 1, assets: { board: orphan }, parts: [mesh("whole")] }, look),
  ).toThrow(/board.rail/);
});
