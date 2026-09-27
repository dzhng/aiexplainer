/**
 * Turns a `SceneDesc` into GPU-ready arrays: one vertex pool, one index pool, one instance
 * table and a draw list (one draw per geometry and pass). Pure, so it is bun-testable;
 * `renderer.ts` only uploads what this returns.
 */
import { mat3, mat4, type Mat3, type Mat4 } from "math";
import { box3, type Box3 } from "math/shapes";
import { partWorld } from "./camera.ts";
import type { FrameInput, LookConfig, Part, SceneDesc } from "./frame-input.ts";
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
  /** Parts in instance order (opaque draws first), so instance `i` is `parts[i]`. */
  parts: Part[];
  materialIndex: Uint32Array;
  draws: Draw[];
  slotCount: number;
}

const cube = blockGeometry();

function partGeometry(part: Part): Geometry {
  return part.kind === "block" ? cube : tubeGeometry(part.path, part.radius);
}

/** A part's bounds in its own space, from the same geometry the GPU draws. */
export function partLocalBounds(part: Part): Box3 {
  return partGeometry(part).bounds;
}

const model: Mat4 = mat4.create();

/** World-space bounds of a part in the current view. */
export function partWorldBounds(part: Part, view: FrameInput["view"], out: Box3): Box3 {
  return box3.transformMat4(out, partLocalBounds(part), partWorld(part, view, model));
}

export function compileScene(scene: SceneDesc, look: LookConfig): CompiledScene {
  const materials = Object.keys(look.materials);
  const translucent = (part: Part) => {
    const material = look.materials[part.material];
    if (!material)
      throw new Error(`scene: part ${part.id} uses unknown material "${part.material}"`);
    return material.opacity < 1;
  };

  // Blocks share one cube and draw instanced; every tube is its own geometry.
  const groups: { geometry: Geometry; parts: Part[]; translucent: boolean }[] = [];
  for (const pass of [false, true]) {
    const blocks = scene.parts.filter((p) => p.kind === "block" && translucent(p) === pass);
    if (blocks.length) groups.push({ geometry: cube, parts: blocks, translucent: pass });
    for (const part of scene.parts) {
      if (part.kind !== "block" && translucent(part) === pass)
        groups.push({ geometry: partGeometry(part), parts: [part], translucent: pass });
    }
  }

  const unique = [...new Set(groups.map((g) => g.geometry))];
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

  const parts: Part[] = [];
  const draws: Draw[] = groups.map((group) => {
    const at = placed.get(group.geometry)!;
    const firstInstance = parts.length;
    parts.push(...group.parts);
    return {
      firstIndex: at.firstIndex,
      indexCount: group.geometry.indices.length,
      baseVertex: at.baseVertex,
      firstInstance,
      instanceCount: group.parts.length,
      translucent: group.translucent,
    };
  });

  return {
    vertices,
    indices,
    parts,
    materialIndex: new Uint32Array(parts.map((p) => materials.indexOf(p.material))),
    draws,
    slotCount: parts.reduce((n, p) => Math.max(n, p.slot + 1), 1),
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
  for (let i = 0; i < compiled.parts.length; i++) {
    const part = compiled.parts[i]!;
    partWorld(part, view, model);
    mat3.normalFromMat4(normalMatrix, model);
    packInstance(f32, u32, i, model, normalMatrix, compiled.materialIndex[i]!, part.slot);
  }
}
