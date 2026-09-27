import { expect, test } from "bun:test";
import path from "node:path";
import { box3 } from "math/shapes";
import { GltfUnsupportedError, parseGlb, type MeshAsset } from "../src/gltf.ts";

const repo = path.resolve(import.meta.dirname, "../../..");
const load = async (file: string): Promise<MeshAsset> =>
  parseGlb(await Bun.file(path.join(repo, file)).arrayBuffer());

test("Blender +X, +Y, +Z land at glTF (1,0,0), (0,0,−1), (0,1,0)", async () => {
  const asset = await load("apps/explainer/public/props/axis_probe.glb");
  const centre = (name: string) => {
    const node = asset.nodes.find((n) => n.name === name);
    if (!node) throw new Error(`no node ${name}`);
    return box3.center([0, 0, 0], node.bounds).map((c) => Math.round(c * 1e5) / 1e5 + 0);
  };
  expect(centre("marker.+X")).toEqual([1, 0, 0]);
  expect(centre("marker.+Y")).toEqual([0, 0, -1]);
  expect(centre("marker.+Z")).toEqual([0, 1, 0]);
});

test("emission survives export as factor × KHR_materials_emissive_strength", async () => {
  const asset = await load("apps/explainer/public/props/axis_probe.glb");
  const emissive = asset.nodes.find((n) => n.name === "marker.+Z")!.material.emissive;
  // Blender emission (0.05, 0.1, 0.8) at strength 4.
  [0.2, 0.4, 3.2].forEach((v, i) => expect(emissive[i]).toBeCloseTo(v, 5));
  expect(asset.nodes.find((n) => n.name === "marker.+X")!.material.emissive).toEqual([0, 0, 0]);
});

test("a Draco-compressed GLB throws a named error", async () => {
  const draco = load("packages/renderer/test/fixtures/axis_probe.draco.glb");
  expect(draco).rejects.toBeInstanceOf(GltfUnsupportedError);
  expect(draco).rejects.toThrow(/KHR_draco_mesh_compression/);
});

test("the counter board has its named parts, unit normals and fits the triangle budget", async () => {
  const asset = await load("apps/explainer/public/props/counter_board.glb");
  const names = asset.nodes.map((n) => n.name);
  for (const name of ["board.housing", "board.rail", "board.stand"]) expect(names).toContain(name);
  for (let i = 0; i < 10; i++) expect(names).toContain(`board.slot.${i}`);
  const triangles = asset.nodes.reduce((n, node) => n + node.indices.length / 3, 0);
  expect(triangles).toBeLessThanOrEqual(50_000);
  for (const node of asset.nodes) {
    for (let i = 0; i < node.normals.length; i += 3)
      expect(Math.hypot(node.normals[i]!, node.normals[i + 1]!, node.normals[i + 2]!)).toBeCloseTo(
        1,
        4,
      );
    expect(Math.max(...node.indices)).toBeLessThan(node.positions.length / 3);
  }
  // Standing on the floor, facing +Z.
  expect(asset.bounds[1]).toBeCloseTo(0, 3);
});
