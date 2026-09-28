/**
 * Orbit, zoom and pan, as a pure state machine: pointer and wheel events in, a damped
 * `OrbitPose` out. No DOM access, so it is driven the same way by the app and by tests.
 */
import type { Vec3 } from "math";
import type { Box3 } from "math/shapes";
import { copyPose, createPose, orbitDirection } from "./camera.ts";
import type { OrbitPose } from "./frame-input.ts";

export interface OrbitLimits {
  minPitch: number;
  maxPitch: number;
  minDistance: number;
  maxDistance: number;
  /** Radians per CSS pixel of drag. */
  rotateSpeed: number;
  /** Fraction of the distance per CSS pixel of drag. */
  panSpeed: number;
  /** Distance multiplier per 100 units of wheel delta. */
  zoomStep: number;
  /** Exponential approach rate toward the goal, per second. */
  damping: number;
  /**
   * World box both the target and the eye stay inside (an environment room, less a margin
   * for the near plane): the eye comes closer rather than leave it.
   */
  bounds?: Box3;
}

export const DEFAULT_ORBIT_LIMITS: OrbitLimits = {
  minPitch: -0.2,
  maxPitch: 1.35,
  minDistance: 1.5,
  maxDistance: 40,
  rotateSpeed: 0.006,
  panSpeed: 0.0015,
  zoomStep: 1.12,
  damping: 12,
};

export interface OrbitPointer {
  pointerId: number;
  x: number;
  y: number;
  /** 0 rotates; 2 (or `shiftKey`) pans. */
  button: number;
  shiftKey?: boolean;
}

export class OrbitController {
  /** Where the camera is heading. */
  readonly goal: OrbitPose;
  /** Where the camera is; approaches `goal` in `update`. */
  readonly pose: OrbitPose;
  #drag: { pointerId: number; x: number; y: number; pan: boolean } | null = null;
  #direction: Vec3 = [0, 0, 0];
  /** The distance the user asked for; `goal.distance` is it, shortened to stay in `bounds`. */
  #wanted: number;

  constructor(
    pose: OrbitPose,
    readonly limits: OrbitLimits = DEFAULT_ORBIT_LIMITS,
  ) {
    this.goal = copyPose(createPose(), pose);
    this.#wanted = pose.distance;
    this.#clamp();
    this.pose = copyPose(createPose(), this.goal);
  }

  get dragging(): boolean {
    return this.#drag !== null;
  }

  /** Cuts to `pose` with no easing. */
  jumpTo(pose: OrbitPose): void {
    copyPose(this.goal, pose);
    this.#wanted = pose.distance;
    this.#clamp();
    copyPose(this.pose, this.goal);
  }

  pointerDown(e: OrbitPointer): void {
    this.#drag = { pointerId: e.pointerId, x: e.x, y: e.y, pan: e.button === 2 || !!e.shiftKey };
  }

  pointerMove(e: OrbitPointer): void {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.x - drag.x;
    const dy = e.y - drag.y;
    drag.x = e.x;
    drag.y = e.y;
    if (drag.pan) this.#pan(dx, dy);
    else {
      this.goal.yaw -= dx * this.limits.rotateSpeed;
      this.goal.pitch += dy * this.limits.rotateSpeed;
    }
    this.#clamp();
  }

  pointerUp(e: OrbitPointer): void {
    if (this.#drag?.pointerId === e.pointerId) this.#drag = null;
  }

  wheel(deltaY: number): void {
    this.#wanted *= Math.pow(this.limits.zoomStep, deltaY / 100);
    this.#clamp();
  }

  /** Advances the damped pose by `dtSec` and returns it. */
  update(dtSec: number): OrbitPose {
    const k = 1 - Math.exp(-this.limits.damping * Math.max(0, dtSec));
    const p = this.pose;
    const g = this.goal;
    for (let i = 0; i < 3; i++) p.target[i] = p.target[i]! + (g.target[i]! - p.target[i]!) * k;
    p.yaw += (g.yaw - p.yaw) * k;
    p.pitch += (g.pitch - p.pitch) * k;
    p.distance += (g.distance - p.distance) * k;
    // Easing between two poses inside the room can swing the eye outside it; keep it in.
    this.#keepInside(p);
    p.fovY = g.fovY;
    return p;
  }

  /** Moves the target in the camera's screen plane, scaled by distance. */
  #pan(dx: number, dy: number): void {
    const g = this.goal;
    const s = g.distance * this.limits.panSpeed;
    const cy = Math.cos(g.yaw);
    const sy = Math.sin(g.yaw);
    const sp = Math.sin(g.pitch);
    const cp = Math.cos(g.pitch);
    // Screen right is (cos yaw, 0, −sin yaw); screen up is (−sin p sin yaw, cos p, −sin p cos yaw).
    g.target[0] += -dx * s * cy + dy * s * -sp * sy;
    g.target[1] += dy * s * cp;
    g.target[2] += dx * s * sy + dy * s * -sp * cy;
  }

  #clamp(): void {
    const { minPitch, maxPitch, minDistance, maxDistance } = this.limits;
    this.goal.pitch = Math.min(maxPitch, Math.max(minPitch, this.goal.pitch));
    this.#wanted = Math.min(maxDistance, Math.max(minDistance, this.#wanted));
    this.goal.distance = this.#wanted;
    this.#keepInside(this.goal);
  }

  /** Pulls `pose`'s target into `bounds`, then its eye in along the view ray. Allocation-free. */
  #keepInside(pose: OrbitPose): void {
    const b = this.limits.bounds;
    if (!b) return;
    const t = pose.target;
    for (let i = 0; i < 3; i++) t[i] = Math.min(b[i + 3]!, Math.max(b[i]!, t[i]!));
    // How far the eye can go from the target along its view ray.
    const direction = orbitDirection(pose, this.#direction);
    let reach = pose.distance;
    for (let i = 0; i < 3; i++) {
      const dir = direction[i]!;
      if (dir > 1e-6) reach = Math.min(reach, (b[i + 3]! - t[i]!) / dir);
      else if (dir < -1e-6) reach = Math.min(reach, (b[i]! - t[i]!) / dir);
    }
    pose.distance = Math.max(0.05, reach);
  }
}
