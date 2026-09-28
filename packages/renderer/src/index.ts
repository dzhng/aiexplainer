export * from "./frame-input.ts";
export { probeAdapter, type AdapterReport } from "./device.ts";
export {
  cameraMatrices,
  createCameraMatrices,
  createProjected,
  partCut,
  partWorld,
  project,
  projectBox,
  type CameraMatrices,
  type Projected,
  type ScreenRect,
} from "./camera.ts";
export { OrbitController, DEFAULT_ORBIT_LIMITS, type OrbitLimits } from "./orbit.ts";
export { createRenderer, type RendererOptions } from "./renderer.ts";
export { compileScene, partWorldBounds, type CompiledScene } from "./scene.ts";
export { VERTEX_BYTES } from "./pack.ts";
export { GltfUnsupportedError, parseGlb, type MeshAsset, type MeshNode } from "./gltf.ts";
export {
  DEFAULT_LABEL_BOX,
  placeLabels,
  sceneAnchors,
  sceneOccluders,
  type LabelBox,
  type LabelPlacement,
  type LabelSide,
  type Occluder,
  type WorldAnchor,
} from "./labels.ts";
export { KIT, KIT_ENTRIES, isKitPrimitive, type KitPrimitiveId } from "./kit/catalog.ts";
export type { KitBuild, KitCommon, KitPrimitive } from "./kit/primitive.ts";
export { BAR_MIN_HEIGHT, placeBar, type BarSlot, type BarsParams } from "./kit/bars.ts";
export type { BlockParams } from "./kit/block.ts";
export { BRICK, placeBrick, type BrickParams, type BrickPlacement } from "./kit/brick.ts";
export type { ContactShadowParams } from "./kit/contact-shadow.ts";
export { faceAt, placeDie, type DieParams, type DiePose } from "./kit/die.ts";
export { PIN, PIN_PARTS, placePin, type PinFieldParams } from "./kit/pins.ts";
export type { MeshParams } from "./kit/mesh.ts";
export {
  PIPE_SAMPLES,
  pipeEntries,
  pipePath,
  pipePaths,
  type PipeFan,
  type PipesParams,
} from "./kit/pipes.ts";
export { sealedPaths, type SealedParams } from "./kit/sealed.ts";
export type { FlowsParams } from "./kit/flows.ts";
export { placeHand, type DialParams } from "./kit/dial.ts";
export { placeSegment, UNIT_SEGMENT, type TubeParams } from "./kit/tube.ts";
export {
  lampCenter,
  panelSize,
  placePush,
  pushEnds,
  type QuestionPanelParams,
} from "./kit/question-panel.ts";
export { placePour, placeStretch, stretchSpan, type RiverParams } from "./kit/river.ts";
export { placeKnob, type VolumeKnobParams } from "./kit/volume-knob.ts";
export {
  PARTS_PER_TILE,
  draftTileCenter,
  faceId,
  setDraftTile,
  type DraftStripParams,
  type DraftTileState,
} from "./kit/draft-strip.ts";
export { TRIAGE_SLOTS, bayCenter, deskCenter, type TriageBaysParams } from "./kit/triage-bays.ts";
