import type { AdapterReport, FrameReceipt, LabelPlacement, ScreenRect } from "@repo/renderer";

/** What the verification harness reads from `window.__explainer`. */
export interface ProbeApi {
  ready: Promise<void>;
  adapter: AdapterReport | null;
  errors: string[];
  setTime(t: number): void;
  /** The last frame's receipt, on pages that render. */
  receipt?: () => FrameReceipt;
  /** Named screen rectangles in CSS pixels: `part:<id>` from the app's own shapes, `label:<id>` from the label layer. */
  crops?: () => Record<string, ScreenRect>;
  /** The latest label placements. */
  labels?: () => LabelPlacement[];
  /** Free-form results of in-page checks, printed by the harness. */
  results?: unknown;
}

declare global {
  interface Window {
    __explainer?: ProbeApi;
  }
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
  };
  window.addEventListener("error", (event) => probe.errors.push(event.message));
  window.addEventListener("unhandledrejection", (event) => probe.errors.push(String(event.reason)));
  window.__explainer = probe;
  return { probe, markReady };
}
