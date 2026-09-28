/**
 * The `mesh` primitive: a Blender prop, whole or split into one part per node so each node
 * has its own id (crops, anchors and label targets name it). Node names follow the prop's
 * convention (`<prop>.<piece>`).
 */
import { vec3, type Mat4 } from "math";
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
}

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export const mesh: KitPrimitive<MeshParams> = {
  build(p) {
    const transform = p.transform ?? IDENTITY;
    const base = { kind: "mesh", slot: p.slot, asset: p.assetId, primitive: "mesh" } as const;
    // A node split into primitives (`name#0`, `name#1`) is still one piece.
    const pieces = [...new Set(p.asset.nodes.map((n) => n.name.replace(/#\d+$/, "")))];
    const parts: MeshPart[] = p.split
      ? pieces.map((name) => ({
          ...base,
          id: `${p.id}.${name.split(".").slice(1).join(".") || name}`,
          node: name,
          transform: [...transform] as Mat4,
        }))
      : [
          {
            ...base,
            id: p.id,
            transform: [...transform] as Mat4,
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
    };
  },
  example: (assets) => {
    const [assetId, asset] = Object.entries(assets)[0] ?? [];
    if (!asset) throw new Error("kit mesh: the example needs a loaded prop");
    return { id: "mesh", slot: 0, assetId: assetId!, asset, split: true };
  },
};
