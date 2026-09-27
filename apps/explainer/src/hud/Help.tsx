/**
 * The help panel: how to drive the explainer, and where every number comes from (copy rules),
 * including the TinyStories credit. The per-chapter lines come from the same resolver as the
 * chips, so the panel can never describe a number the chip doesn't show.
 */
import { H100_SXM, LLAMA_3_8B } from "@repo/llm";
import { statReady, statSource, statText } from "../chapters/stats.ts";
import css from "./hud.module.css";
import type { HudProps } from "./Hud.tsx";
import { CloseIcon } from "./icons.tsx";

const TINYSTORIES = "https://huggingface.co/datasets/roneneldan/TinyStories";
const CDLA = "https://cdla.dev/sharing-1-0/";

export function Help({ dispatch, def, model, slider }: HudProps) {
  const close = () => dispatch({ type: "toggleHelp" });
  return (
    <div className={css.scrim} onClick={close}>
      <section
        className={`${css.box} ${css.help}`}
        data-crop="panel:help"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="help-title">How to use this</h2>
        <button
          className={`${css.iconButton} ${css.close}`}
          aria-label="Close help"
          onClick={close}
        >
          <CloseIcon />
        </button>
        <p>
          Each chapter adds one part to the machine and plays a short loop to show what it does.
          Touch any control and the loop pauses so you can look around; ▶ plays it again.
        </p>
        <ul>
          <li>
            <b>Follow</b> (<kbd>1</kbd>–<kbd>4</kbd>) picks one part to watch, and the caption
            explains it.
          </li>
          <li>
            The left and right arrow keys, or the ladder at the bottom, move between chapters.
          </li>
          <li>
            <b>Analogy / Precise</b> switches the part labels between the everyday picture and the
            technical name. <b>Precisely</b> under the caption gives the exact claim.
          </li>
          <li>
            <kbd>Space</kbd> plays or pauses, <kbd>?</kbd> opens this panel, <kbd>Esc</kbd> closes
            it.
          </li>
        </ul>

        <h3>Where the numbers come from</h3>
        <p>Every number is computed, never typed in, and each one names its scale:</p>
        <ul>
          <li>
            <b>this tiny model</b>: a small model built for this chapter. Its numbers are read from
            its files or measured on it when it was built.
          </li>
          <li>
            <b>TinyStories</b>: the children&apos;s stories the tiny models learned from.
          </li>
          <li>
            <b>Llama-3-8B</b> and <b>Llama-3-8B on H100 SXM</b>: arithmetic from{" "}
            <a href={LLAMA_3_8B.source}>{LLAMA_3_8B.name}&apos;s published config</a> and{" "}
            <a href={H100_SXM.source}>the {H100_SXM.name} spec sheet</a>. Speeds are the most the
            hardware allows, not measurements.
          </li>
        </ul>
        <h3>In this chapter</h3>
        {def.stats.map((stat) => (
          <p key={stat.id} className={css.helpStat}>
            {stat.label} <span className={css.helpScale}>({stat.scale})</span>:{" "}
            <b>{statReady(stat, model) ? statText(stat, model, slider) : "…"}</b>
            <span className={css.helpSource}>
              {statReady(stat, model) ? statSource(stat, model) : "Loading the model…"}
            </span>
          </p>
        ))}

        <h3>Sources</h3>
        <ul>
          <li>
            The tiny models are trained on <a href={TINYSTORIES}>TinyStories</a> (Eldan and Li,
            2023), licensed <a href={CDLA}>CDLA-Sharing-1.0</a>.
          </li>
          {def.help.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url}>{s.label}</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
