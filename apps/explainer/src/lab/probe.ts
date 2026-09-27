import type { AdapterReport, FrameReceipt, LabelPlacement, ScreenRect } from "@repo/renderer";
import type { Clock, HeldClock, StepClock } from "../runtime/clock.ts";
import type { Support } from "../runtime/support.ts";

/** A crop in CSS pixels of the viewport. */
export type CropRect = ScreenRect;

/** What the verification harness reads from `window.__explainer`. */
export interface ProbeApi {
  ready: Promise<void>;
  adapter: AdapterReport | null;
  errors: string[];
  /** With `?clock=held`: hold time at `t` seconds. */
  setTime(t: number): void;
  /** With `?clock=step`: advance exactly one frame (the recorder, D29). */
  step(): void;
  /** The app only: whether this visitor got the 3D app or the fallback page. */
  support?: Support;
  /**
   * Named crops for screenshots: HUD crops (`panel:*`, `chip:*`, `specimen:*`) are the DOM
   * rects of elements tagged `data-crop="<id>"`; scene crops (`part:*` from the app's own
   * shapes, `label:*` from the label layer) come from `sceneCrops` when a scene is running.
   */
  crops(): Record<string, CropRect>;
  /** Set by pages that render a scene. */
  sceneCrops?: () => Record<string, CropRect>;
  /** The last frame's receipt, on pages that render. */
  receipt?: () => FrameReceipt;
  /** The latest label placements. */
  labels?: () => LabelPlacement[];
  /** The app only: go to a chapter by slug, as the ladder does. */
  goto?: (slug: string) => void;
  /** The app only: set HUD controls (`text`, `follow`, `slider`, `view`, `playing: false`). */
  setUi?: (ui: Record<string, unknown>) => void;
  /** The app only: the chapter loop's current time and beat, for filmstrips. */
  beat?: () => { t: number; id: string; note: string } | null;
  /** Free-form results of in-page checks, printed by the harness. */
  results?: unknown;
}

declare global {
  interface Window {
    __explainer?: ProbeApi;
  }
}

/** Every visible element tagged `data-crop`, by its tag. */
function domCrops(): Record<string, CropRect> {
  const crops: Record<string, CropRect> = {};
  for (const el of document.querySelectorAll<HTMLElement>("[data-crop]")) {
    const { x, y, width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) crops[el.dataset.crop!] = { x, y, width, height };
  }
  return crops;
}

/** Installs the probe over the page's clock; returns a function that marks it ready. */
export function installProbe(clock: Clock): {
  probe: ProbeApi;
  markReady: () => void;
} {
  let markReady = () => {};
  const probe: ProbeApi = {
    ready: new Promise((resolve) => {
      markReady = resolve;
    }),
    adapter: null,
    errors: [],
    setTime: (t) => (clock as Partial<HeldClock>).set?.(t),
    step: () => (clock as Partial<StepClock>).step?.(),
    crops: () => ({ ...domCrops(), ...probe.sceneCrops?.() }),
  };
  window.addEventListener("error", (event) => probe.errors.push(event.message));
  window.addEventListener("unhandledrejection", (event) => probe.errors.push(String(event.reason)));
  window.__explainer = probe;
  return { probe, markReady };
}
