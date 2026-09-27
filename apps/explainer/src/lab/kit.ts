/**
 * `/lab/kit/<prop>`: one prop on a turntable. The camera turns 45° per second, so a held
 * clock at t = 0…7 gives the eight review azimuths.
 */
import { parseGlb, type OrbitPose, type Part } from "@repo/renderer";
import { lookConfig } from "../look/look.ts";
import { frameFromParts } from "./fixtures.ts";
import type { StageScene } from "./pages/StagePage.tsx";

const PROPS: Record<string, { file: string; camera: OrbitPose }> = {
  board: {
    file: "/props/counter_board.glb",
    camera: { target: [0, 1.2, 0], yaw: 0, pitch: 0.18, distance: 6.2, fovY: 0.75 },
  },
  axis: {
    file: "/props/axis_probe.glb",
    camera: { target: [0, 0.3, 0], yaw: 0.6, pitch: 0.45, distance: 4.5, fovY: 0.75 },
  },
};

export const TURNTABLE_RAD_PER_SEC = Math.PI / 4;

export async function kitScene(name: string): Promise<StageScene> {
  const prop = PROPS[name];
  if (!prop) throw new Error(`unknown kit prop "${name}"; have ${Object.keys(PROPS).join(", ")}`);
  const response = await fetch(prop.file);
  if (!response.ok) throw new Error(`${prop.file}: HTTP ${response.status}`);
  const asset = parseGlb(await response.arrayBuffer());
  const part: Part = {
    kind: "mesh",
    id: name,
    slot: 0,
    asset: name,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
    explode: [0, 0, 0],
    cutaway: "keep",
  };
  return {
    // The axis probe's markers use its own glTF material names.
    look: lookConfig({
      axisX: { color: "#e5484d", opacity: 1 },
      axisY: { color: "#46a758", opacity: 1 },
      axisZ: { color: "#3e63dd", opacity: 1 },
    }),
    input: frameFromParts(structuredClone(prop.camera), [part], undefined, { [name]: asset }),
    pose: (pose, t) => {
      pose.yaw += t * TURNTABLE_RAD_PER_SEC;
    },
  };
}
