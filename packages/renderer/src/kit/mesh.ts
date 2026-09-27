/**
 * The `mesh` primitive: a Blender prop, whole or split into one part per node so each node
 * can explode and be cut on its own. Node names follow the prop's convention
 * (`<prop>.<piece>`); explode offsets and clipping are chosen per node by name prefix.
 */
import { vec3, type Mat4, type Vec3 } from "math";
import { box3 } from "math/shapes";
import type { MeshPart } from "../frame-input.ts";
import type { MeshAsset } from "../gltf.ts";
import type { KitCommon, KitPrimitive } from "./primitive.ts";

export interface MeshParams extends KitCommon {
  /** The prop's key in `SceneDesc.assets`, and the parsed prop itself. */
  assetId: string;
  asset: MeshAsset;
  transform?: Mat4;
  /** One part per node (`<id>.<piece>`) rather than one part for the whole prop. */
  split?: boolean;
  /** Per-node Exploded offsets, by node-name prefix (the longest match wins). */
  nodeExplode?: Record<string, Vec3>;
  /** Node-name prefixes the Cutaway view clips (default: `cutaway` for every node). */
  clip?: string[];
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** The value keyed by the longest prefix of `name`, if any. */
function byPrefix<T>(name: string, table: Record<string, T> | undefined): T | undefined {
  const key = Object.keys(table ?? {})
    .filter((prefix) => name.startsWith(prefix))
    .sort((a, b) => b.length - a.length)[0];
  return key === undefined ? undefined : table![key];
}

export const mesh: KitPrimitive<MeshParams> = {
  build(p) {
    const transform = p.transform ?? IDENTITY;
    const cutFor = (name: string) =>
      p.clip ? (p.clip.some((prefix) => name.startsWith(prefix)) ? "clip" : "keep") : p.cutaway;
    const base = { kind: "mesh", slot: p.slot, asset: p.assetId, primitive: "mesh" } as const;
    // A node split into primitives (`name#0`, `name#1`) is still one piece.
    const pieces = [...new Set(p.asset.nodes.map((n) => n.name.replace(/#\d+$/, "")))];
    const parts: MeshPart[] = p.split
      ? pieces.map((name) => ({
          ...base,
          id: `${p.id}.${name.split(".").slice(1).join(".") || name}`,
          node: name,
          transform: [...transform] as Mat4,
          explode: byPrefix(name, p.nodeExplode) ?? p.explode,
          cutaway: cutFor(name),
        }))
      : [
          {
            ...base,
            id: p.id,
            transform: [...transform] as Mat4,
            explode: p.explode,
            cutaway: p.cutaway,
          },
        ];
    const b = p.asset.bounds;
    return {
      parts,
      bounds: box3.transformMat4(box3.create(), b, transform),
      // The top of the prop, centred: on the first part, in the prop's own space.
      anchors: [
        {
          id: p.id,
          part: parts[0]!.id,
          local: vec3.lerp([0, 0, 0], [b[0], b[4], b[2]], [b[3], b[4], b[5]], 0.5),
          priority: 1,
        },
      ],
      explode: p.explode ?? [0, 0, 0],
    };
  },
  example: (assets) => {
    const [assetId, asset] = Object.entries(assets)[0] ?? [];
    if (!asset) throw new Error("kit mesh: the example needs a loaded prop");
    return { id: "mesh", slot: 0, assetId: assetId!, asset, split: true };
  },
};
