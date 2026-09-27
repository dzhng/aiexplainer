/**
 * The lab's renderer host: one canvas, the real renderer, orbit controls, pinned labels
 * and the probe hooks (`receipt`, `crops`, `labels`). Lab pages hand it a look and a frame
 * input; it owns the loop: clock → orbit → renderer.frame → placeLabels → label refs.
 */
import {
  cameraMatrices,
  createCameraMatrices,
  createRenderer,
  OrbitController,
  partWorldBounds,
  placeLabels,
  projectBox,
  sceneAnchors,
  sceneOccluders,
  type LabelPlacement,
  type Occluder,
  type WorldAnchor,
  type FrameInput,
  type FrameReceipt,
  type LookConfig,
  type OrbitPose,
  type Renderer,
  type ScreenRect,
} from "@repo/renderer";
import type { Box3 } from "math/shapes";
import type { Clock } from "../runtime/clock.ts";
import type { LabelsHandle } from "../hud/Labels.tsx";
import type { ProbeApi } from "./probe.ts";

export interface StageOptions {
  canvas: HTMLCanvasElement;
  look: LookConfig;
  /** Everything but time and viewport, which the stage fills in. */
  input: Omit<FrameInput, "timeSec" | "viewport">;
  clock: Clock;
  probe: ProbeApi;
  /** Called once the first frames are on screen (or the stage failed). */
  onReady: () => void;
  /** Debug layers and bloom, e.g. from `?emissive=0&bloom=0`. */
  debug?: FrameInput["debug"];
  /** Adjusts the drawn camera from the orbit pose each frame (e.g. a turntable). */
  pose?: (pose: OrbitPose, timeSec: number) => void;
  /** The label layer to drive, when the scene has anchors. */
  labels?: LabelsHandle | null;
}

export interface Stage {
  renderer: Renderer;
  input: FrameInput;
  dispose(): void;
}

export async function runStage(o: StageOptions): Promise<Stage | null> {
  const created = await createRenderer(o.canvas, o.look);
  if ("unsupported" in created) {
    o.probe.errors.push(`renderer unsupported: ${created.unsupported}`);
    o.onReady();
    return null;
  }
  const renderer = created;
  const input: FrameInput = {
    ...o.input,
    timeSec: 0,
    viewport: { width: 1, height: 1, dpr: 1 },
    debug: o.debug,
  };
  const orbit = new OrbitController(input.camera);
  const pose: OrbitPose = { ...orbit.pose, target: [...orbit.pose.target] };
  input.camera = pose;

  const { canvas } = o;
  const onDown = (e: PointerEvent) => {
    canvas.setPointerCapture(e.pointerId);
    orbit.pointerDown({
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      button: e.button,
      shiftKey: e.shiftKey,
    });
  };
  const onMove = (e: PointerEvent) =>
    orbit.pointerMove({ pointerId: e.pointerId, x: e.clientX, y: e.clientY, button: e.button });
  const onUp = (e: PointerEvent) =>
    orbit.pointerUp({ pointerId: e.pointerId, x: e.clientX, y: e.clientY, button: e.button });
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    orbit.wheel(e.deltaY);
  };
  const onMenu = (e: Event) => e.preventDefault();
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  canvas.addEventListener("contextmenu", onMenu);
  const resizeObserver = new ResizeObserver(() => renderer.resize());
  resizeObserver.observe(canvas);

  const matrices = createCameraMatrices();
  const placements: LabelPlacement[] = [];
  // Occluders and world anchors change only with the scene or the view.
  const placedFor = { revision: -1, mode: input.view.mode, t: Number.NaN };
  let occluders: Occluder[] = [];
  let anchors: WorldAnchor[] = [];
  const placeAll = () => {
    const { scene, view } = input;
    if (
      placedFor.revision !== scene.revision ||
      placedFor.mode !== view.mode ||
      placedFor.t !== view.t
    ) {
      occluders = sceneOccluders(scene, view, o.look);
      anchors = sceneAnchors(scene, view);
      const widths = o.labels?.pillWidths() ?? {};
      for (const anchor of anchors) anchor.pillWidth = widths[anchor.id];
      placedFor.revision = scene.revision;
      placedFor.mode = view.mode;
      placedFor.t = view.t;
    }
    cameraMatrices(input.camera, input.viewport, matrices);
    placeLabels(matrices, anchors, occluders, placements);
    o.labels?.update(placements);
  };

  let receipt: FrameReceipt | null = null;
  let frames = 0;
  let last = o.clock.now();
  let raf = 0;
  const tick = () => {
    const now = o.clock.now();
    const current = orbit.update(now - last);
    last = now;
    pose.target[0] = current.target[0];
    pose.target[1] = current.target[1];
    pose.target[2] = current.target[2];
    pose.yaw = current.yaw;
    pose.pitch = current.pitch;
    pose.distance = current.distance;
    pose.fovY = current.fovY;
    o.pose?.(pose, now);
    input.timeSec = now;
    input.viewport.width = canvas.clientWidth;
    input.viewport.height = canvas.clientHeight;
    input.viewport.dpr = devicePixelRatio;
    receipt = renderer.frame(input);
    placeAll();
    if (++frames === 2) o.onReady();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const box: Box3 = [0, 0, 0, 0, 0, 0];
  o.probe.receipt = () => receipt!;
  o.probe.labels = () => placements.map((p) => ({ ...p }));
  o.probe.sceneCrops = () => {
    cameraMatrices(input.camera, input.viewport, matrices);
    const crops: Record<string, ScreenRect> = { ...o.labels?.rects() };
    for (const part of input.scene.parts) {
      const rect = projectBox(matrices, partWorldBounds(part, input.scene.assets, input.view, box));
      if (rect) crops[`part:${part.id}`] = rect;
    }
    return crops;
  };

  return {
    renderer,
    input,
    dispose() {
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("contextmenu", onMenu);
      renderer.dispose();
    },
  };
}
