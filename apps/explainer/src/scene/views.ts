/**
 * The view transition (slice 13): Whole, Cutaway and Exploded ease in over
 * `look.views.durationSec`. Leaving Cutaway or Exploded first eases the current view back
 * out, then the new one comes in; leaving Whole starts the new view at once. The renderer
 * reads only the result (`FrameView.mode` and eased `t`), through `partWorld`/`partCut`.
 */
import type { FrameView, ViewMode } from "@repo/renderer";

/** Smoothstep: eases in and out, so parts settle rather than stop. */
const ease = (p: number) => p * p * (3 - 2 * p);

export class ViewTransition {
  #mode: ViewMode;
  /** Linear progress of `#mode`, 0 → 1. */
  #progress = 1;

  /** Starts settled in `initial` (a page that opens in Exploded shows it exploded). */
  constructor(initial: ViewMode) {
    this.#mode = initial;
  }

  /** Advances toward `target` by `dtSec` and writes the view to show into `out`. */
  step(target: ViewMode, dtSec: number, durationSec: number, out: FrameView): void {
    const rate = Math.max(0, dtSec) / durationSec;
    if (this.#mode !== target) {
      if (this.#mode === "whole") this.#progress = 0;
      else this.#progress = Math.max(0, this.#progress - rate);
      if (this.#progress === 0) this.#mode = target;
    } else this.#progress = Math.min(1, this.#progress + rate);
    out.mode = this.#mode;
    out.t = this.#mode === "whole" ? 1 : ease(this.#progress);
  }
}
