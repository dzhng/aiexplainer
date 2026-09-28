/**
 * `/lab/kit/<name>`: a Blender prop (`board`, `bus`, `axis`) or a kit primitive (`block`, `tube`,
 * `mesh`, `bars`: its `example` build) on a turntable. The camera turns 45° per second, so a
 * held clock at t = 0…7 gives the eight review azimuths.
 */
import { isKitPrimitive, KIT_ENTRIES, type OrbitPose, type Part } from "@repo/renderer";
import { box3 } from "math/shapes";
import { lookConfig } from "../look/look.ts";
import { frameFromParts, loadAsset } from "./fixtures.ts";
import type { StageScene } from "./pages/StagePage.tsx";

const PROPS: Record<string, { file: string; camera: OrbitPose }> = {
  board: {
    file: "/props/counter_board.glb",
    camera: { target: [0, 1.2, 0], yaw: 0, pitch: 0.18, distance: 6.2, fovY: 0.75 },
  },
  bus: {
    file: "/props/bus.glb",
    camera: { target: [0, 1.1, 0], yaw: 0, pitch: 0.18, distance: 7, fovY: 0.75 },
  },
  axis: {
    file: "/props/axis_probe.glb",
    camera: { target: [0, 0.3, 0], yaw: 0.6, pitch: 0.45, distance: 4.5, fovY: 0.75 },
  },
};

export const TURNTABLE_RAD_PER_SEC = Math.PI / 4;

const turntable: StageScene["pose"] = (pose, t) => {
  pose.yaw += t * TURNTABLE_RAD_PER_SEC;
};

/** A primitive's example build (the `mesh` example is the board prop), framed on its bounds. */
async function primitiveScene(name: string): Promise<StageScene> {
  const board = await loadAsset(PROPS.board!.file);
  const primitive = KIT_ENTRIES.find(([id]) => id === name)![1];
  const built = primitive.build(primitive.example({ board }));
  const size = Math.max(...box3.size([0, 0, 0], built.bounds));
  const camera: OrbitPose = {
    target: box3.center([0, 0, 0], built.bounds),
    yaw: 0.5,
    pitch: 0.25,
    distance: 1.6 + size * 1.8,
    fovY: 0.75,
  };
  const input = frameFromParts(camera, built.parts, undefined, { board }, built.anchors);
  return { look: lookConfig(), input, pose: turntable };
}

export async function kitScene(name: string): Promise<StageScene> {
  if (isKitPrimitive(name)) return primitiveScene(name);
  const prop = PROPS[name];
  if (!prop) {
    const names = [...Object.keys(PROPS), ...KIT_ENTRIES.map(([id]) => id)];
    throw new Error(`unknown kit entry "${name}"; have ${names.join(", ")}`);
  }
  const asset = await loadAsset(prop.file);
  const part: Part = {
    kind: "mesh",
    id: name,
    slot: 0,
    asset: name,
    transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
  };
  return {
    // The axis probe's markers use its own glTF material names.
    look: lookConfig({
      axisX: { color: "#e5484d", opacity: 1 },
      axisY: { color: "#46a758", opacity: 1 },
      axisZ: { color: "#3e63dd", opacity: 1 },
    }),
    input: frameFromParts(structuredClone(prop.camera), [part], undefined, { [name]: asset }),
    pose: turntable,
  };
}
