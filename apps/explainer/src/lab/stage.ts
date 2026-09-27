/**
 * The lab's renderer host: one canvas, the real renderer, orbit controls and the probe
 * hooks (`receipt`, `crops`). Lab pages hand it a look and a frame input; it owns the loop.
 */
import {
  cameraMatrices,
  createCameraMatrices,
  createRenderer,
  OrbitController,
  partWorldBounds,
  projectBox,
  type FrameInput,
  type FrameReceipt,
  type LookConfig,
  type Renderer,
  type ScreenRect,
} from "@repo/renderer";
import type { Box3 } from "math/shapes";
import type { Clock } from "../runtime/clock.ts";
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
  const input: FrameInput = { ...o.input, timeSec: 0, viewport: { width: 1, height: 1, dpr: 1 } };
  const orbit = new OrbitController(input.camera);
  input.camera = orbit.pose;

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

  let receipt: FrameReceipt | null = null;
  let frames = 0;
  let last = o.clock.now();
  let raf = 0;
  const tick = () => {
    const now = o.clock.now();
    orbit.update(now - last);
    last = now;
    input.timeSec = now;
    input.viewport.width = canvas.clientWidth;
    input.viewport.height = canvas.clientHeight;
    input.viewport.dpr = devicePixelRatio;
    receipt = renderer.frame(input);
    if (++frames === 2) o.onReady();
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  const matrices = createCameraMatrices();
  const box: Box3 = [0, 0, 0, 0, 0, 0];
  o.probe.receipt = () => receipt!;
  o.probe.crops = () => {
    cameraMatrices(input.camera, input.viewport, matrices);
    const crops: Record<string, ScreenRect> = {};
    for (const part of input.scene.parts) {
      const rect = projectBox(matrices, partWorldBounds(part, input.view, box));
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
