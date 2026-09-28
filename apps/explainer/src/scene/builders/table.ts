/**
 * The work table the early chapters' machines stand on (chapter 1's bricks, chapter 2's map,
 * chapter 3's die): a top and four legs from the kit's `block`, grounded by a `contactShadow`
 * on the floor. Static: every part is in dynamics slot 0.
 */
import { KIT, type Part } from "@repo/renderer";
import type { Vec3 } from "math";

export interface TableSpec {
  /** Centre of the top slab. */
  center: Vec3;
  size: Vec3;
  legHeight: number;
}

/** The top of the table: where things stand on it. */
export const tableTop = (t: TableSpec) => t.center[1] + t.size[1] / 2;

export function tableParts(t: TableSpec): Part[] {
  const [tx, ty, tz] = t.center;
  const [sx, sy, sz] = t.size;
  const legY = ty - sy / 2 - t.legHeight / 2;
  const legs = [-1, 1].flatMap((i) =>
    [-1, 1].map((j) => ({
      center: [tx + i * (sx / 2 - 0.1), legY, tz + j * (sz / 2 - 0.1)] as Vec3,
      size: [0.07, t.legHeight, 0.07] as Vec3,
    })),
  );
  return [
    // A contact shadow under each leg, over a faint one under the top.
    ...KIT.contactShadow.build({
      id: "shadow",
      slot: 0,
      bounds: [tx - sx / 2, 0, tz - sz / 2, tx + sx / 2, ty, tz + sz / 2],
      softness: 0.3,
      feet: legs.map(({ center: [x, , z], size: [w, h, d] }) => [
        x - w / 2,
        0,
        z - d / 2,
        x + w / 2,
        h,
        z + d / 2,
      ]),
    }).parts,
    ...KIT.block.build({ id: "table", slot: 0, material: "steel", center: t.center, size: t.size })
      .parts,
    ...legs.flatMap(
      (leg, i) =>
        KIT.block.build({ id: `table.leg.${i}`, slot: 0, material: "steel", ...leg }).parts,
    ),
  ];
}
