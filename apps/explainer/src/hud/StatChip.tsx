import type { ModelSource } from "@repo/llm";
import { resolveStat, statReady, statText } from "../chapters/stats.ts";
import type { StatChip as StatChipDef } from "../chapters/types.ts";
import css from "./hud.module.css";
import { useCountUp } from "./motion.ts";

/**
 * One number with its label and its scale (copy rules: every number names its scale). The
 * value is a glowing mono readout; the scale is small amber text under a dashed rule, so neither
 * reads as the other. Until a model-backed value's model has loaded, the value shows a
 * placeholder. With a `countKey` the value counts up to its exact text on each new key.
 */
export function StatChip({
  stat,
  model,
  countKey = null,
}: {
  stat: StatChipDef;
  model: ModelSource | null;
  countKey?: number | null;
}) {
  const ready = statReady(stat, model);
  const settled = ready ? statText(stat, model) : "…";
  const text = useCountUp(ready ? resolveStat(stat, model) : null, stat.format, settled, countKey);
  return (
    <div className={`${css.box} ${css.chip}`} data-crop={`chip:${stat.id}`}>
      <span className={css.chipLabel}>{stat.label}</span>
      {/* The settled text holds the chip's width while the count runs, so the row never jumps. */}
      <span className={css.chipValue}>
        <span className={css.chipHold} aria-hidden="true">
          {settled}
        </span>
        <span>{text}</span>
      </span>
      <span className={css.chipScale}>{stat.scale}</span>
    </div>
  );
}
