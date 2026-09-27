import type { AdapterReport, FrameReceipt, LabelPlacement, ScreenRect } from "@repo/renderer";

/** A crop in CSS pixels of the viewport. */
export type CropRect = ScreenRect;

/** What the verification harness reads from `window.__explainer`. */
export interface ProbeApi {
  ready: Promise<void>;
  adapter: AdapterReport | null;
  errors: string[];
  setTime(t: number): void;
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
  /** A chapter scene (the app or `/lab/scene/*`): the loop's current time and beat, for filmstrips. */
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

/** Installs the probe; returns a function that marks it ready. */
export function installProbe(setTime: (t: number) => void): {
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
    setTime,
    crops: () => ({ ...domCrops(), ...probe.sceneCrops?.() }),
  };
  window.addEventListener("error", (event) => probe.errors.push(event.message));
  window.addEventListener("unhandledrejection", (event) => probe.errors.push(String(event.reason)));
  window.__explainer = probe;
  return { probe, markReady };
}
