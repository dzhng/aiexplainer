/**
 * The renderer boundary. The app builds a `FrameInput` from its own state every frame;
 * the renderer draws exactly that and reports a `FrameReceipt`. Nothing else crosses.
 */
import type { Mat4, Vec3 } from "math";
import type { MeshAsset } from "./gltf.ts";

/** Linear-light RGB, as handed over by the app's look module (never sRGB). */
export type LinearRgb = Vec3;

export interface OrbitPose {
  target: Vec3;
  /** Radians around +Y; 0 puts the eye on +Z looking toward −Z. */
  yaw: number;
  /** Radians above the horizon. */
  pitch: number;
  distance: number;
  /** Vertical field of view, radians. */
  fovY: number;
}

export interface Viewport {
  /** CSS pixels. */
  width: number;
  height: number;
  dpr: number;
}

export type ViewMode = "whole" | "cutaway" | "exploded";

interface PartBase {
  id: string;
  /** Index into `FrameInput.dynamics`. Several parts may share a slot. */
  slot: number;
  /** Placement of the part's local geometry in the world. */
  transform: Mat4;
}

/** A unit cube centred on the origin, placed by `transform`. */
export interface BlockPart extends PartBase {
  kind: "block";
  material: string;
}

/** A circle of `radius` swept along `path` (local space), with flat end caps. */
export interface TubePart extends PartBase {
  kind: "tube";
  material: string;
  path: Vec3[];
  radius: number;
}

/** A loaded prop, keyed in `SceneDesc.assets`. */
export type AssetId = string;

/**
 * One node of a prop (or, without `node`, every node). Materials bind by name: the last
 * dotted segment of the node name that names a look preset wins (`board.housing` →
 * `housing`); otherwise the node's glTF material name must name one.
 */
export interface MeshPart extends PartBase {
  kind: "mesh";
  asset: AssetId;
  node?: string;
  /** Offset applied in the Exploded view, scaled by `view.t`. */
  explode: Vec3;
  /** Whether the Cutaway view clips this part. */
  cutaway: "keep" | "clip";
}

export type Part = BlockPart | TubePart | MeshPart;

export interface SceneDesc {
  /** Bump to make the renderer re-upload the scene; unchanged means reuse. */
  revision: number;
  parts: Part[];
  /** Parsed props (`parseGlb`), loaded by the app. */
  assets: Record<AssetId, MeshAsset>;
}

export interface FrameDynamics {
  /** Per part slot, uploaded every frame. */
  intensity: Float32Array;
  widthScale: Float32Array;
  flowPhase: Float32Array;
}

export interface FrameInput {
  timeSec: number;
  viewport: Viewport;
  camera: OrbitPose;
  view: { mode: ViewMode; t: number };
  scene: SceneDesc;
  dynamics: FrameDynamics;
  debug?: { layers?: number; bloom?: boolean };
}

export interface RegistryStats {
  count: number;
  bytes: number;
}

export interface FrameReceipt {
  drawCalls: number;
  triangles: number;
  registry: RegistryStats;
}

export interface MaterialLook {
  baseColor: LinearRgb;
  /** 1 is opaque; anything lower draws in the translucent pass. */
  opacity: number;
}

/** The renderer's slice of the app's look tokens, already resolved to linear numbers. */
export interface LookConfig {
  room: { wallTop: LinearRgb; wallBottom: LinearRgb };
  materials: Record<string, MaterialLook>;
}

export interface Renderer {
  frame(input: FrameInput): FrameReceipt;
  /** Re-reads the canvas size and rebuilds the size-dependent targets. */
  resize(): void;
  /** Swaps in new look numbers (materials, room); the scene re-uploads on the next frame. */
  setLook(look: LookConfig): void;
  dispose(): void;
}
