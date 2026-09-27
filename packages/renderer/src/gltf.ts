/**
 * A deliberately small GLB reader for the repo's own Blender props: uncompressed triangle
 * meshes, metallic-roughness factors, `emissiveFactor` and `KHR_materials_emissive_strength`.
 * Everything else throws `GltfUnsupportedError`, so an asset never half-loads.
 * Node transforms are baked into the positions, so every node is ready to draw in asset space.
 */
import { mat3, mat4, quat, vec3, type Mat4, type Vec3 } from "math";
import type { Box3 } from "math/shapes";
import { boundsOf } from "./kit/geometry.ts";

export class GltfUnsupportedError extends Error {
  override name = "GltfUnsupportedError";
}

export interface MeshMaterial {
  name: string;
  /** Linear RGB, as glTF stores it. */
  baseColor: Vec3;
  opacity: number;
  metallic: number;
  roughness: number;
  /** `emissiveFactor × emissiveStrength`, linear. */
  emissive: Vec3;
}

export interface MeshNode {
  name: string;
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
  material: MeshMaterial;
  bounds: Box3;
}

export interface MeshAsset {
  nodes: MeshNode[];
  bounds: Box3;
}

const SUPPORTED_EXTENSIONS = new Set(["KHR_materials_emissive_strength"]);
const GLB_MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const FLOAT = 5126;
const INDEX_TYPES: Record<
  number,
  Uint8ArrayConstructor | Uint16ArrayConstructor | Uint32ArrayConstructor
> = {
  5121: Uint8Array,
  5123: Uint16Array,
  5125: Uint32Array,
};
const TRIANGLES = 4;

interface GltfJson {
  extensionsUsed?: string[];
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    name?: string;
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: {
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      material?: number;
      mode?: number;
    }[];
  }[];
  accessors?: {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    sparse?: unknown;
  }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  materials?: {
    name?: string;
    doubleSided?: boolean;
    alphaMode?: string;
    emissiveFactor?: number[];
    emissiveTexture?: unknown;
    normalTexture?: unknown;
    occlusionTexture?: unknown;
    extensions?: { KHR_materials_emissive_strength?: { emissiveStrength?: number } };
    pbrMetallicRoughness?: {
      baseColorFactor?: number[];
      metallicFactor?: number;
      roughnessFactor?: number;
      baseColorTexture?: unknown;
      metallicRoughnessTexture?: unknown;
    };
  }[];
}

function unsupported(what: string): never {
  throw new GltfUnsupportedError(`glTF: ${what} is not supported`);
}

function readChunks(data: ArrayBuffer): { json: GltfJson; bin: DataView<ArrayBuffer> } {
  const view = new DataView(data);
  if (data.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC)
    unsupported("anything but GLB");
  if (view.getUint32(4, true) !== 2) unsupported(`GLB version ${view.getUint32(4, true)}`);
  let json: GltfJson | null = null;
  let bin: DataView<ArrayBuffer> | null = null;
  for (let at = 12; at + 8 <= view.getUint32(8, true); ) {
    const length = view.getUint32(at, true);
    const type = view.getUint32(at + 4, true);
    if (type === CHUNK_JSON)
      json = JSON.parse(new TextDecoder().decode(new Uint8Array(data, at + 8, length)));
    if (type === CHUNK_BIN) bin = new DataView(data, at + 8, length);
    at += 8 + length;
  }
  if (!json) unsupported("a GLB without a JSON chunk");
  return { json, bin: bin ?? new DataView(new ArrayBuffer(0)) };
}

function readMaterial(json: GltfJson, index: number | undefined): MeshMaterial {
  const m = index === undefined ? undefined : json.materials?.[index];
  if (!m) unsupported("a primitive without a material");
  const pbr = m.pbrMetallicRoughness ?? {};
  if (
    pbr.baseColorTexture ||
    pbr.metallicRoughnessTexture ||
    m.normalTexture ||
    m.occlusionTexture ||
    m.emissiveTexture
  )
    unsupported(`textures (material "${m.name}")`);
  if (m.doubleSided) unsupported(`a double-sided material ("${m.name}")`);
  if (m.alphaMode && m.alphaMode !== "OPAQUE")
    unsupported(`alphaMode ${m.alphaMode} ("${m.name}")`);
  const [r = 1, g = 1, b = 1, a = 1] = pbr.baseColorFactor ?? [];
  const strength = m.extensions?.KHR_materials_emissive_strength?.emissiveStrength ?? 1;
  const [er = 0, eg = 0, eb = 0] = m.emissiveFactor ?? [];
  return {
    name: m.name ?? `material${index}`,
    baseColor: [r, g, b],
    opacity: a,
    metallic: pbr.metallicFactor ?? 1,
    roughness: pbr.roughnessFactor ?? 1,
    emissive: [er * strength, eg * strength, eb * strength],
  };
}

function readFloat3(
  json: GltfJson,
  bin: DataView<ArrayBuffer>,
  index: number,
  what: string,
): Float32Array {
  const accessor = json.accessors?.[index];
  if (!accessor) unsupported(`a missing ${what} accessor`);
  if (accessor.sparse) unsupported(`sparse accessors (${what})`);
  if (accessor.componentType !== FLOAT || accessor.type !== "VEC3")
    unsupported(`${what} that is not float VEC3`);
  const bufferView = json.bufferViews?.[accessor.bufferView ?? -1];
  if (!bufferView) unsupported(`an accessor without a buffer view (${what})`);
  const base = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = bufferView.byteStride ?? 12;
  const out = new Float32Array(accessor.count * 3);
  for (let i = 0; i < accessor.count; i++)
    for (let c = 0; c < 3; c++) out[i * 3 + c] = bin.getFloat32(base + i * stride + c * 4, true);
  return out;
}

function readIndices(
  json: GltfJson,
  bin: DataView<ArrayBuffer>,
  index: number | undefined,
  vertexCount: number,
): Uint32Array {
  if (index === undefined) return Uint32Array.from({ length: vertexCount }, (_, i) => i);
  const accessor = json.accessors?.[index];
  if (!accessor || accessor.sparse || accessor.type !== "SCALAR") unsupported("these indices");
  const Type = INDEX_TYPES[accessor.componentType];
  const bufferView = json.bufferViews?.[accessor.bufferView ?? -1];
  if (!Type || !bufferView) unsupported("these indices");
  const offset = bin.byteOffset + (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  // glTF aligns accessors to their component size, so a typed view is safe.
  return Uint32Array.from(new Type(bin.buffer, offset, accessor.count));
}

function localMatrix(node: NonNullable<GltfJson["nodes"]>[number], out: Mat4): Mat4 {
  if (node.matrix) return mat4.copy(out, node.matrix as Mat4);
  const t = (node.translation ?? [0, 0, 0]) as Vec3;
  const r = (node.rotation ?? [0, 0, 0, 1]) as [number, number, number, number];
  const s = (node.scale ?? [1, 1, 1]) as Vec3;
  return mat4.fromRotationTranslationScale(out, quat.normalize(r, r), t, s);
}

export function parseGlb(data: ArrayBuffer): MeshAsset {
  const { json, bin } = readChunks(data);
  for (const ext of json.extensionsUsed ?? [])
    if (!SUPPORTED_EXTENSIONS.has(ext)) unsupported(`extension ${ext}`);
  const nodes: MeshNode[] = [];
  const scene = json.scenes?.[json.scene ?? 0];
  const visit = (index: number, parent: Mat4) => {
    const node = json.nodes?.[index];
    if (!node) unsupported(`a missing node ${index}`);
    const world = mat4.multiply(mat4.create(), parent, localMatrix(node, mat4.create()));
    if (node.mesh !== undefined) {
      const primitives = json.meshes?.[node.mesh]?.primitives ?? [];
      const normalMatrix = mat3.normalFromMat4(mat3.create(), world)!;
      primitives.forEach((primitive, p) => {
        if ((primitive.mode ?? TRIANGLES) !== TRIANGLES)
          unsupported(`primitive mode ${primitive.mode}`);
        const { POSITION, NORMAL } = primitive.attributes;
        if (POSITION === undefined || NORMAL === undefined)
          unsupported("a primitive without positions and normals");
        const positions = readFloat3(json, bin, POSITION, "POSITION");
        const normals = readFloat3(json, bin, NORMAL, "NORMAL");
        const v: Vec3 = [0, 0, 0];
        for (let i = 0; i < positions.length; i += 3) {
          vec3.transformMat4(v, [positions[i]!, positions[i + 1]!, positions[i + 2]!], world);
          positions.set(v, i);
          vec3.normalize(
            v,
            vec3.transformMat3(v, [normals[i]!, normals[i + 1]!, normals[i + 2]!], normalMatrix),
          );
          normals.set(v, i);
        }
        const name = node.name ?? `node${index}`;
        nodes.push({
          name: primitives.length === 1 ? name : `${name}#${p}`,
          positions,
          normals,
          indices: readIndices(json, bin, primitive.indices, positions.length / 3),
          material: readMaterial(json, primitive.material),
          bounds: boundsOf(positions),
        });
      });
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of scene?.nodes ?? []) visit(root, mat4.create());
  if (!nodes.length) unsupported("an asset with no meshes");
  const bounds: Box3 = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const node of nodes)
    for (let a = 0; a < 3; a++) {
      bounds[a] = Math.min(bounds[a]!, node.bounds[a]!);
      bounds[a + 3] = Math.max(bounds[a + 3]!, node.bounds[a + 3]!);
    }
  return { nodes, bounds };
}
