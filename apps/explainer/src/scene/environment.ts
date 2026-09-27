/**
 * The room every chapter's machine stands in (slice 11b): one prop, set once here so the app,
 * `/lab/scene/*` and room fixtures all draw it. The renderer draws it as `SceneDesc.environment`
 * — never a part, so it never occludes labels or gets a crop — and the orbit keeps the camera
 * inside it (`look.room.camera`).
 */
import { DEFAULT_ORBIT_LIMITS, type OrbitLimits, type SceneDesc } from "@repo/renderer";
import type { Box3 } from "math/shapes";
import { look } from "../look/look.ts";

export const ENVIRONMENT = { id: "room", url: "/props/lab_room.glb" } as const;

/** Puts the room around `scene` (its asset must be loaded into `scene.assets`). */
export function withEnvironment(scene: SceneDesc): SceneDesc {
  scene.environment = ENVIRONMENT.id;
  return scene;
}

/** Orbit limits for a camera inside the room: its box, pitch range and farthest pull-back. */
export function roomOrbitLimits(): OrbitLimits {
  const { bounds, minPitch, maxPitch, maxDistance } = look.room.camera;
  if (bounds.length !== 6 || bounds.some((v, i) => i < 3 && !(v < bounds[i + 3]!)))
    throw new Error("look: room.camera.bounds must be [minX, minY, minZ, maxX, maxY, maxZ]");
  if (!(minPitch < maxPitch && maxDistance > DEFAULT_ORBIT_LIMITS.minDistance))
    throw new Error("look: room.camera pitch or distance range is empty");
  return { ...DEFAULT_ORBIT_LIMITS, minPitch, maxPitch, maxDistance, bounds: bounds as Box3 };
}
