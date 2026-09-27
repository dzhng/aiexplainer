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
  /** Placement of the part's local geometry in the world; may change every frame. */
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

/** A point on a part where a label pins; the label's text stays with the app. */
export interface SceneAnchor {
  id: string;
  part: string;
  /** In the part's local space. */
  local: Vec3;
  /** Higher wins when labels overlap. */
  priority: number;
}

export interface SceneDesc {
  /**
   * Bump when the scene's structure changes (parts added or removed, materials, geometry);
   * the renderer then re-uploads it. Transforms alone are re-read every frame.
   */
  revision: number;
  parts: Part[];
  anchors: SceneAnchor[];
  /** Parsed props (`parseGlb`), loaded by the app. */
  assets: Record<AssetId, MeshAsset>;
}

export interface FrameDynamics {
  /** Per part slot, uploaded every frame. */
  intensity: Float32Array;
  widthScale: Float32Array;
  flowPhase: Float32Array;
}

/** Bits of `FrameInput.debug.layers`; a cleared bit hides that layer. */
export const Layer = { emissive: 1 } as const;

export interface FrameInput {
  timeSec: number;
  viewport: Viewport;
  camera: OrbitPose;
  view: { mode: ViewMode; t: number };
  scene: SceneDesc;
  dynamics: FrameDynamics;
  /** `layers` defaults to every `Layer`; `bloom: false` skips the bloom passes. */
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
  /** Whole-frame GPU milliseconds of a recent frame, when timing is on; else null. */
  gpuMs: number | null;
}

export interface MaterialLook {
  baseColor: LinearRgb;
  /** Emitted radiance at dynamics intensity 1, linear (token colour × its bloom multiplier). */
  emissive: LinearRgb;
  metallic: number;
  roughness: number;
  /** 1 is opaque; anything lower draws in the translucent pass. */
  opacity: number;
}

export interface LightLook {
  /** Unit vector from the scene toward the light. */
  direction: Vec3;
  /** Colour × intensity, linear. */
  radiance: LinearRgb;
}

/** The renderer's slice of the app's look tokens, already resolved to linear numbers. */
export interface LookConfig {
  room: {
    /** The back wall's gradient, top to bottom. */
    wallTop: LinearRgb;
    wallBottom: LinearRgb;
    /** The room is a floor disc inside a wall cylinder of this radius, in metres. */
    radius: number;
    /** Fraction of the radius by which the lit floor has faded into the wall colour: a pool of light. */
    floorFade: number;
    /** How strongly specular surfaces reflect the room's gradient (0 = not at all). */
    reflection: number;
    /** Darkening at the frame corners (0 = none) and where it starts (0 = centre, 1 = corner). */
    vignette: { strength: number; radius: number };
  };
  lights: {
    key: LightLook;
    rim: LightLook;
    fill: LightLook;
    /** Apparent light size, as a floor on GGX alpha: larger means broader, softer highlights. */
    size: number;
  };
  ambient: LinearRgb;
  /** Presets bound by name; `floor` also shades the room floor. */
  materials: Record<string, MaterialLook> & { floor: MaterialLook };
  /** `saturation` is AgX's look saturation: 1 is the base look, higher keeps glows coloured. */
  tonemap: { exposure: number; saturation: number };
  bloom: {
    /** Brightest-channel radiance where bloom starts, and the width of its soft knee. */
    threshold: number;
    knee: number;
    /** How much of the blurred chain is added back. */
    intensity: number;
    /** Tent-filter spread per upsample, in source texels. */
    radius: number;
  };
}

export interface Renderer {
  frame(input: FrameInput): FrameReceipt;
  /** Re-reads the canvas size and rebuilds the size-dependent targets. */
  resize(): void;
  /** Swaps in new look numbers (materials, room); the scene re-uploads on the next frame. */
  setLook(look: LookConfig): void;
  dispose(): void;
}
