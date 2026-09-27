import type { AdapterReport } from "@repo/renderer";

/** A crop in CSS pixels of the viewport. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** What the verification harness reads from `window.__explainer`. */
export interface ProbeApi {
  ready: Promise<void>;
  adapter: AdapterReport | null;
  errors: string[];
  setTime(t: number): void;
  /**
   * Named crops for screenshots. HUD crops (`panel:*`, `specimen:*`) are the DOM rects of
   * elements tagged `data-crop="<id>"`; renderer crops (`part:*`, `label:*`) join later.
   */
  crops(): Record<string, CropRect>;
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
    crops: domCrops,
  };
  window.addEventListener("error", (event) => probe.errors.push(event.message));
  window.addEventListener("unhandledrejection", (event) => probe.errors.push(String(event.reason)));
  window.__explainer = probe;
  return { probe, markReady };
}
