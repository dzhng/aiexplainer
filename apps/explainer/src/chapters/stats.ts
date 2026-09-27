/**
 * Resolves a `StatChip` to its number and says where that number comes from. This is the one
 * path from a chapter's stat to the screen: model metrics and probes read the chapter's loaded
 * model, arithmetic goes through the `ARITH` registry.
 */
import {
  ARITH,
  MODEL_METRICS,
  evalArith,
  modelMetric,
  probeResult,
  type LoadedModel,
} from "@repo/llm";
import { formatStat } from "./format.ts";
import type { StatChip } from "./types.ts";

function needModel(stat: StatChip, model: LoadedModel | null): LoadedModel {
  if (!model) throw new Error(`stat ${stat.id} reads a model, but none is loaded`);
  return model;
}

/** Whether the stat can resolve yet: arithmetic always can, the rest need the model loaded. */
export function statReady(stat: StatChip, model: LoadedModel | null): boolean {
  return stat.value.kind === "arith" || model !== null;
}

export function resolveStat(stat: StatChip, model: LoadedModel | null): number {
  const { value } = stat;
  switch (value.kind) {
    case "arith":
      return evalArith(value.fn, value.args);
    case "model":
      return modelMetric(needModel(stat, model), value.metric);
    case "probe":
      return probeResult(needModel(stat, model).manifest, value.probe).value;
  }
}

/** The stat as the chip shows it: `formatStat` of the resolved value. */
export function statText(stat: StatChip, model: LoadedModel | null): string {
  return formatStat(resolveStat(stat, model), stat.format);
}

/** One plain line for the help panel: where this stat's number comes from. */
export function statSource(stat: StatChip, model: LoadedModel | null): string {
  const { value } = stat;
  switch (value.kind) {
    case "arith":
      return `Arithmetic: ${ARITH[value.fn].describe}.`;
    case "model": {
      const id = needModel(stat, model).manifest.id;
      return `Read from the “${id}” model file: ${MODEL_METRICS[value.metric].describe}.`;
    }
    case "probe": {
      const { manifest } = needModel(stat, model);
      const probe = probeResult(manifest, value.probe);
      const prompt = probe.prompt ? ` after “${probe.prompt}”` : "";
      return `Measured on the “${manifest.id}” model when it was built: ${probe.metric}${prompt}.`;
    }
  }
}
