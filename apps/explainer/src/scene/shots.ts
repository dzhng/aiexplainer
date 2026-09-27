/**
 * Camera shot presets (`look/shots.json`, eye/target/field of view) as the renderer's orbit
 * pose, so the orbit controls start exactly at the shot and can return to it.
 */
import type { OrbitPose } from "@repo/renderer";
import type { ShotId } from "../chapters/types.ts";
import shots from "../look/shots.json";

export function shotPose(id: ShotId): OrbitPose {
  const shot = shots[id];
  const [ex, ey, ez] = shot.eye as [number, number, number];
  const [tx, ty, tz] = shot.target as [number, number, number];
  const dx = ex - tx;
  const dy = ey - ty;
  const dz = ez - tz;
  const distance = Math.hypot(dx, dy, dz);
  return {
    target: [tx, ty, tz],
    yaw: Math.atan2(dx, dz),
    pitch: Math.asin(dy / distance),
    distance,
    fovY: (shot.fovDeg * Math.PI) / 180,
  };
}
