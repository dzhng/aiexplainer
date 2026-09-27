import type { ModelSource } from "@repo/llm";
import { statReady, statText } from "../chapters/stats.ts";
import type { StatChip as StatChipDef } from "../chapters/types.ts";
import css from "./hud.module.css";

/**
 * One number with its label and its scale (copy rules: every number names its scale). The
 * value is mono and bright; the scale is a quiet outlined tag, so neither reads as the other.
 * Until a model-backed value's model has loaded, the value shows a placeholder.
 */
export function StatChip({ stat, model }: { stat: StatChipDef; model: ModelSource | null }) {
  return (
    <div className={`${css.box} ${css.chip}`} data-crop={`chip:${stat.id}`}>
      <span className={css.chipLabel}>{stat.label}</span>
      <span className={css.chipValue}>{statReady(stat, model) ? statText(stat, model) : "…"}</span>
      <span className={css.chipScale}>{stat.scale}</span>
    </div>
  );
}
