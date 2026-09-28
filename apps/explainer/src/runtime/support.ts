/**
 * Who gets the 3D app (D20, D29): a desktop-sized window with a fine pointer and a hardware
 * WebGPU adapter. Everyone else gets a short message instead (D20).
 */
export type Support = "webgpu" | "no-webgpu" | "small-screen";

/** Narrower than this and the HUD panels crowd the scene out (the HUD is laid out for 1440). */
export const MIN_WIDTH_PX = 900;

export interface SupportEnv {
  search: string;
  width: number;
  /** A primary coarse pointer (touch) and no fine pointer anywhere. */
  touchOnly: boolean;
  /** `requestAdapter()` gave an adapter (not a software fallback one). */
  hasAdapter: boolean;
}

export function detectSupport(env: SupportEnv): Support {
  if (new URLSearchParams(env.search).get("force") === "unsupported") return "no-webgpu";
  if (env.width < MIN_WIDTH_PX || env.touchOnly) return "small-screen";
  return env.hasAdapter ? "webgpu" : "no-webgpu";
}

/** The browser's answers; `hasAdapter` comes from the adapter probe the app already runs. */
export function browserSupportEnv(hasAdapter: boolean): SupportEnv {
  return {
    search: location.search,
    width: innerWidth,
    touchOnly:
      matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches,
    hasAdapter,
  };
}
