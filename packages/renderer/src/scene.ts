/**
 * Turns a `SceneDesc` into GPU-ready arrays: one vertex pool, one index pool, one instance
 * table and a draw list (one instanced draw per geometry and pass). Pure, so it is
 * bun-testable; `renderer.ts` only uploads what this returns.
 */
import { mat3, mat4, type Mat3, type Mat4 } from "math";
import { box3, type Box3 } from "math/shapes";
import { partWorld } from "./camera.ts";
import type { FrameInput, LookConfig, MeshPart, Part, SceneDesc } from "./frame-input.ts";
import type { MeshAsset, MeshNode } from "./gltf.ts";
import { blockGeometry } from "./kit/block.ts";
import type { Geometry } from "./kit/geometry.ts";
import { tubeGeometry } from "./kit/tube.ts";
import { packInstance, VERTEX_BYTES } from "./pack.ts";

export interface Draw {
  firstIndex: number;
  indexCount: number;
  baseVertex: number;
  firstInstance: number;
  instanceCount: number;
  translucent: boolean;
}

export interface CompiledScene {
  /** `Vertex` records: position, pad, normal, pad. */
  vertices: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  /** The part each instance draws, in instance order (opaque draws first). */
  instanceParts: Part[];
  materialIndex: Uint32Array;
  draws: Draw[];
  slotCount: number;
}

type Assets = SceneDesc["assets"];

/** One drawable piece of a part: its geometry and the look preset it binds. */
interface Piece {
  geometry: Geometry;
  material: string;
}

const cube = blockGeometry();

function meshNodes(part: MeshPart, assets: Assets): MeshNode[] {
  const asset: MeshAsset | undefined = assets[part.asset];
  if (!asset) throw new Error(`scene: part ${part.id} uses unloaded asset "${part.asset}"`);
  if (part.node === undefined) return asset.nodes;
  const node = asset.nodes.find((n) => n.name === part.node);
  if (!node) throw new Error(`scene: asset "${part.asset}" has no node "${part.node}"`);
  return [node];
}

/** The node-name convention: the last dotted segment naming a preset, else the glTF material. */
export function meshMaterial(node: MeshNode, look: LookConfig): string {
  const segments = node.name.split(".").reverse();
  const preset = [...segments, node.material.name].find((name) => name in look.materials);
  if (!preset)
    throw new Error(
      `scene: node "${node.name}" (material "${node.material.name}") names no look preset`,
    );
  return preset;
}

function pieces(part: Part, assets: Assets, look: LookConfig): Piece[] {
  switch (part.kind) {
    case "block":
      return [{ geometry: cube, material: part.material }];
    case "tube":
      return [{ geometry: tubeGeometry(part.path, part.radius), material: part.material }];
    case "mesh":
      return meshNodes(part, assets).map((node) => ({
        geometry: node,
        material: meshMaterial(node, look),
      }));
  }
}

/** A part's bounds in its own space, from the same geometry the GPU draws. */
export function partLocalBounds(part: Part, assets: Assets): Box3 {
  switch (part.kind) {
    case "block":
      return cube.bounds;
    case "tube":
      return tubeGeometry(part.path, part.radius).bounds;
    case "mesh": {
      const nodes = meshNodes(part, assets);
      return nodes.length === 1 ? nodes[0]!.bounds : assets[part.asset]!.bounds;
    }
  }
}

const model: Mat4 = mat4.create();

/** World-space bounds of a part in the current view. */
export function partWorldBounds(
  part: Part,
  assets: Assets,
  view: FrameInput["view"],
  out: Box3,
): Box3 {
  return box3.transformMat4(out, partLocalBounds(part, assets), partWorld(part, view, model));
}

export function compileScene(scene: SceneDesc, look: LookConfig): CompiledScene {
  const materials = Object.keys(look.materials);
  // Every piece that shares a geometry and a pass becomes one instanced draw.
  const groups = new Map<
    string,
    { geometry: Geometry; instances: { part: Part; material: string }[] }
  >();
  const geometryIds = new Map<Geometry, number>();
  for (const part of scene.parts) {
    for (const piece of pieces(part, scene.assets, look)) {
      const preset = look.materials[piece.material];
      if (!preset)
        throw new Error(`scene: part ${part.id} uses unknown material "${piece.material}"`);
      if (!geometryIds.has(piece.geometry)) geometryIds.set(piece.geometry, geometryIds.size);
      const key = `${preset.opacity < 1 ? 1 : 0}:${geometryIds.get(piece.geometry)}`;
      const group = groups.get(key) ?? { geometry: piece.geometry, instances: [] };
      group.instances.push({ part, material: piece.material });
      groups.set(key, group);
    }
  }
  const ordered = [...groups.entries()]
    .sort(([a], [b]) => Number(a.split(":")[0]) - Number(b.split(":")[0]))
    .map(([key, group]) => ({ ...group, translucent: key.startsWith("1:") }));

  const unique = [...geometryIds.keys()];
  const vertexCount = unique.reduce((n, g) => n + g.positions.length / 3, 0);
  const indexCount = unique.reduce((n, g) => n + g.indices.length, 0);
  const vertices = new Float32Array((vertexCount * VERTEX_BYTES) / 4);
  const indices = new Uint32Array(indexCount);
  const placed = new Map<Geometry, { baseVertex: number; firstIndex: number }>();
  let vertexCursor = 0;
  let indexCursor = 0;
  for (const g of unique) {
    placed.set(g, { baseVertex: vertexCursor, firstIndex: indexCursor });
    for (let i = 0; i < g.positions.length / 3; i++) {
      const o = (vertexCursor + i) * (VERTEX_BYTES / 4);
      vertices.set(g.positions.subarray(i * 3, i * 3 + 3), o);
      vertices.set(g.normals.subarray(i * 3, i * 3 + 3), o + 4);
    }
    indices.set(g.indices, indexCursor);
    vertexCursor += g.positions.length / 3;
    indexCursor += g.indices.length;
  }

  const instanceParts: Part[] = [];
  const materialIndex: number[] = [];
  const draws: Draw[] = ordered.map((group) => {
    const at = placed.get(group.geometry)!;
    const firstInstance = instanceParts.length;
    for (const instance of group.instances) {
      instanceParts.push(instance.part);
      materialIndex.push(materials.indexOf(instance.material));
    }
    return {
      firstIndex: at.firstIndex,
      indexCount: group.geometry.indices.length,
      baseVertex: at.baseVertex,
      firstInstance,
      instanceCount: group.instances.length,
      translucent: group.translucent,
    };
  });

  return {
    vertices,
    indices,
    instanceParts,
    materialIndex: new Uint32Array(materialIndex),
    draws,
    slotCount: scene.parts.reduce((n, p) => Math.max(n, p.slot + 1), 1),
  };
}

const normalMatrix: Mat3 = mat3.create();

/** Packs every instance's world transform for the current view. Allocation-free. */
export function packInstances(
  compiled: CompiledScene,
  view: FrameInput["view"],
  f32: Float32Array,
  u32: Uint32Array,
): void {
  for (let i = 0; i < compiled.instanceParts.length; i++) {
    const part = compiled.instanceParts[i]!;
    partWorld(part, view, model);
    mat3.normalFromMat4(normalMatrix, model);
    packInstance(f32, u32, i, model, normalMatrix, compiled.materialIndex[i]!, part.slot);
  }
}
