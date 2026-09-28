/**
 * The message for visitors who can't run the live 3D machine (D20): phones and small windows,
 * and browsers without a working WebGPU.
 */
import { BrandMark } from "../hud/icons.tsx";
import hud from "../hud/hud.module.css";
import { BRAND_NAME, SERIES_TITLE } from "../look/brand.ts";
import type { Support } from "../runtime/support.ts";
import css from "./unsupported.module.css";

const MESSAGE: Record<Exclude<Support, "webgpu">, string> = {
  "small-screen":
    "This explainer runs a live 3D machine and needs a desktop browser. Open it on a computer.",
  "no-webgpu":
    "This explainer runs a live 3D machine with WebGPU, which this browser doesn't support. Try a recent Chrome, Edge or Safari on a computer.",
};

export function Unsupported({ reason }: { reason: Exclude<Support, "webgpu"> }) {
  return (
    <main className={css.page} data-unsupported={reason}>
      <div className={hud.brand}>
        <BrandMark />
        {BRAND_NAME}
      </div>
      <h1 className={`${hud.title} ${css.title}`}>{SERIES_TITLE}</h1>
      <p className={css.message}>{MESSAGE[reason]}</p>
    </main>
  );
}
