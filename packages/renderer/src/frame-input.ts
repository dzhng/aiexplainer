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
  /** World offset in the Exploded view, scaled by `view.t` (default: stays put). */
  explode?: Vec3;
  /** Whether the Cutaway view clips this part against the cut plane (default: keep). */
  cutaway?: "keep" | "clip";
  /** The kit primitive that built the part (`kit/`), for the chapter vocabulary checks. */
  primitive?: string;
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

/**
 * A soft footprint on the floor (`kit/contact-shadow.ts`): a unit quad in xz whose coverage
 * fades to its edge, placed by `transform`, drawn with a translucent `material`.
 */
export interface ShadowPart extends PartBase {
  kind: "shadow";
  material: string;
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
}

export type Part = BlockPart | TubePart | MeshPart | ShadowPart;

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
  /**
   * Bump when parts have moved in a way that changes what hides what (bricks laid out anew),
   * so label occlusion is re-tested; transforms alone, re-read every frame, do not re-test it.
   */
  layout?: number;
  parts: Part[];
  anchors: SceneAnchor[];
  /** Parsed props (`parseGlb`), loaded by the app. */
  assets: Record<AssetId, MeshAsset>;
  /**
   * The room the scene stands in: a prop drawn around every chapter's parts at the origin.
   * It never occludes labels or gets crops, and its emission is not scaled by `dynamics`.
   */
  environment?: AssetId;
}

export interface FrameDynamics {
  /** Per part slot, uploaded every frame. */
  intensity: Float32Array;
  /**
   * A tube's radius multiplier about its centreline, applied on the GPU: 1 draws the radius it
   * was built with, 0 closes it. Other parts ignore it.
   */
  widthScale: Float32Array;
  flowPhase: Float32Array;
}

/** Bits of `FrameInput.debug.layers`; a cleared bit hides that layer. */
export const Layer = { emissive: 1, flows: 2 } as const;

/** A plane: `normal · p = offset`. The Cutaway view removes the side `normal` points to. */
export interface CutPlane {
  normal: Vec3;
  offset: number;
}

/**
 * The view vocabulary, applied only by `partWorld` and `partCut`: Whole places
 * parts as authored; Exploded moves each by its `explode` × `t`; Cutaway sweeps the cut
 * plane in by `t`, clipping `cutaway: "clip"` parts, whose cut faces show the look's cap.
 */
export interface FrameView {
  mode: ViewMode;
  /** 0 → 1 as the view comes in (the app eases it over `look.views` duration). */
  t: number;
  /** The Cutaway plane for this scene; defaults to `look.cutaway.plane`. */
  cut?: CutPlane;
}

export interface FrameInput {
  timeSec: number;
  viewport: Viewport;
  camera: OrbitPose;
  view: FrameView;
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
  /**
   * The surface shows only flow pulses: dashes `LookConfig.flow.spacing` apart along the part
   * (a tube's arc length), each `flow.duty` of a spacing long, brightest at its leading end,
   * shifted along by the slot's `flowPhase` (in spacings). Needs `opacity` < 1 (it draws in
   * the translucent pass, adding light); hidden with the flows layer.
   */
  pulses?: boolean;
  /**
   * Scales specular (lights and reflection); default 1. A contact shadow is 0: it only
   * darkens what is under it.
   */
  specular?: number;
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
    /** The void beyond the room, top to bottom; specular surfaces reflect this gradient too. */
    wallTop: LinearRgb;
    wallBottom: LinearRgb;
    /** How much baked ambient occlusion darkens (0 = ignored, 1 = fully). */
    ao: number;
    /**
     * Irradiance at a baked light value of 1, for a prop's warm and cool bake channels (the
     * room's practicals: where their light falls is baked, its colour and strength are here).
     */
    bake: { warm: LinearRgb; cool: LinearRgb };
    /** How strongly specular surfaces reflect the gradient (0 = not at all). */
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
    /**
     * The direct lights fall off outside a pool around the subject (horizontal distance from
     * `center`) to `spill` of their strength, so the room around it stays dim and the subject
     * reads first. `stretch` elongates it along x (the ceiling tubes' axis): distance along x
     * counts `1 / stretch` as much.
     */
    pool: { center: Vec3; radius: number; falloff: number; spill: number; stretch: number };
  };
  ambient: LinearRgb;
  /** Presets bound by name: kit parts name one, prop nodes by their name's segments. */
  materials: Record<string, MaterialLook>;
  /** `saturation` is AgX's look saturation: 1 is the base look, higher keeps glows coloured. */
  /** The Cutaway view's default plane and the colour its cut faces are capped with. */
  cutaway: { plane: CutPlane; cap: LinearRgb };
  tonemap: { exposure: number; saturation: number };
  /** Flow pulses: world-space gap from one pulse to the next, and the lit share of that gap. */
  flow: { spacing: number; duty: number };
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
