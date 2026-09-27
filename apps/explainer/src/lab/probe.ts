import type { AdapterReport } from "@repo/renderer";

/** What the verification harness reads from `window.__explainer`. */
export interface ProbeApi {
  ready: Promise<void>;
  adapter: AdapterReport | null;
  errors: string[];
  setTime(t: number): void;
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
