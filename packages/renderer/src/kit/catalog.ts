/**
 * The kit catalogue: the only primitives a chapter's scene may build from (slice 13). The
 * validator rejects a scene that declares anything else; adding one is a kit sub-step in the
 * chapter slice that needs it.
 */
import { bars } from "./bars.ts";
import { block } from "./block.ts";
import { brick } from "./brick.ts";
import { contactShadow } from "./contact-shadow.ts";
import { mesh } from "./mesh.ts";
import type { KitPrimitive } from "./primitive.ts";
import { tube } from "./tube.ts";

export const KIT = { block, tube, mesh, bars, contactShadow, brick } as const;
export type KitPrimitiveId = keyof typeof KIT;

export function isKitPrimitive(id: string): id is KitPrimitiveId {
  return Object.hasOwn(KIT, id);
}

/** Every primitive, untyped params: for the catalogue's tests and the kit turntable. */
export const KIT_ENTRIES = Object.entries(KIT) as [KitPrimitiveId, KitPrimitive<unknown>][];
