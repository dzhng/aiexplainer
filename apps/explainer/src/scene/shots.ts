/**
 * Camera shot presets (`look/shots.json`, eye/target/field of view) as the renderer's orbit
 * pose, so the orbit controls start exactly at the shot and can return to it.
 */
import { orbitPoseAt, type OrbitPose } from "@repo/renderer";
import type { ShotId } from "../chapters/types.ts";
import shots from "../look/shots.json";

export function shotPose(id: ShotId): OrbitPose {
  const shot = shots[id];
  const eye = shot.eye as [number, number, number];
  const target = shot.target as [number, number, number];
  return orbitPoseAt(eye, target, (shot.fovDeg * Math.PI) / 180);
}
