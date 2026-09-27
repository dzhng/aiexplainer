/** `/lab/calib`: a unit grid on the floor plane and an X/Y/Z axis gizmo at the origin. */
import type { Part } from "@repo/renderer";
import { lookConfig } from "../look/look.ts";
import { frameFromParts } from "./fixtures.ts";

const GRID_HALF = 5;
const LINE = 0.02;
const LIFT = 0.004;
/** The grid sits just below the gizmo so the axis shafts never intersect it. */
const GRID_Y = -0.08;
const AXIS_LENGTH = 1.5;

function block(id: string, material: string, center: number[], size: number[]): Part {
  const [x, y, z] = center as [number, number, number];
  const [sx, sy, sz] = size as [number, number, number];
  return {
    kind: "block",
    id,
    slot: 0,
    material,
    transform: [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1],
  };
}

export function calibScene() {
  const parts: Part[] = [];
  for (let i = -GRID_HALF; i <= GRID_HALF; i++) {
    // Lines along Z are lifted a little so no two crossing lines share a top face.
    const major = i === 0;
    const material = major ? "gridMajor" : "grid";
    const w = major ? LINE * 1.5 : LINE;
    parts.push(block(`grid.x${i}`, material, [i, GRID_Y + w / 2 + LIFT, 0], [w, w, GRID_HALF * 2]));
    parts.push(block(`grid.z${i}`, material, [0, GRID_Y + w / 2, i], [GRID_HALF * 2, w, w]));
  }
  const axes = [
    ["x", [1, 0, 0]],
    ["y", [0, 1, 0]],
    ["z", [0, 0, 1]],
  ] as const;
  for (const [name, dir] of axes) {
    parts.push({
      kind: "tube",
      id: `axis.${name}`,
      slot: 0,
      material: `axis${name.toUpperCase()}`,
      radius: 0.04,
      path: [[0, 0, 0], dir.map((c) => c * AXIS_LENGTH) as [number, number, number]],
      transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    });
    parts.push(
      block(
        `axis.${name}.tip`,
        `axis${name.toUpperCase()}`,
        dir.map((c) => c * AXIS_LENGTH),
        [0.14, 0.14, 0.14],
      ),
    );
  }
  return {
    look: lookConfig({
      grid: { color: "floorEdge", opacity: 1 },
      gridMajor: { color: "ink", opacity: 1 },
      axisX: { color: "#e5484d", opacity: 1 },
      axisY: { color: "#46a758", opacity: 1 },
      axisZ: { color: "#3e63dd", opacity: 1 },
    }),
    input: frameFromParts(
      { target: [0, 0.5, 0], yaw: 0.6, pitch: 0.5, distance: 9, fovY: 0.75 },
      parts,
    ),
  };
}
