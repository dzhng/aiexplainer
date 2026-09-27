/**
 * Resolves a `StatChip` to its number and says where that number comes from. This is the one
 * path from a chapter's stat to the screen: model metrics and probes read the chapter's loaded
 * model, arithmetic goes through the `ARITH` registry, fed by fixed numbers, the HUD slider or
 * the model's probes (`ArithArg`).
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
import type { ArithArg, StatChip } from "./types.ts";

function needModel(stat: StatChip, model: LoadedModel | null): LoadedModel {
  if (!model) throw new Error(`stat ${stat.id} reads a model, but none is loaded`);
  return model;
}

const readsModel = (arg: ArithArg) => typeof arg === "object" && "probe" in arg;

/** Whether the stat can resolve yet: arithmetic on fixed numbers always can, the rest need the model. */
export function statReady(stat: StatChip, model: LoadedModel | null): boolean {
  const { value } = stat;
  if (value.kind !== "arith") return model !== null;
  return model !== null || !Object.values(value.args).some(readsModel);
}

/** The arithmetic arguments with every binding replaced by its number. */
function arithArgs(
  stat: StatChip,
  args: Record<string, ArithArg>,
  model: LoadedModel | null,
  slider: number | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [name, arg] of Object.entries(args)) {
    if (typeof arg === "number") out[name] = arg;
    else if ("slider" in arg) {
      if (slider === undefined)
        throw new Error(`stat ${stat.id} follows the slider; pass its value`);
      out[name] = slider;
    } else out[name] = probeResult(needModel(stat, model).manifest, arg.probe).value;
  }
  return out;
}

/** `slider` is the HUD slider's value; a stat that follows it needs it. */
export function resolveStat(stat: StatChip, model: LoadedModel | null, slider?: number): number {
  const { value } = stat;
  switch (value.kind) {
    case "arith":
      return evalArith(value.fn, arithArgs(stat, value.args, model, slider));
    case "model":
      return modelMetric(needModel(stat, model), value.metric);
    case "probe":
      return probeResult(needModel(stat, model).manifest, value.probe).value;
  }
}

/** The stat as the chip shows it: `formatStat` of the resolved value. */
export function statText(stat: StatChip, model: LoadedModel | null, slider?: number): string {
  return formatStat(resolveStat(stat, model, slider), stat.format);
}

/** One plain line for the help panel: where this stat's number comes from. */
export function statSource(stat: StatChip, model: LoadedModel | null): string {
  const { value } = stat;
  switch (value.kind) {
    case "arith": {
      const bound = Object.entries(value.args).flatMap(([name, arg]) => {
        if (typeof arg === "number") return [];
        if ("slider" in arg) return [`${name} from the slider`];
        const { manifest } = needModel(stat, model);
        return [
          `${name} measured on the “${manifest.id}” model (${probeResult(manifest, arg.probe).metric})`,
        ];
      });
      const inputs = bound.length ? ` (${bound.join("; ")})` : "";
      return `Arithmetic: ${ARITH[value.fn].describe}${inputs}.`;
    }
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
