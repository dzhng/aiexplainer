/**
 * `/lab/tokens`: specimens of the look tokens, one section per `?section=` (all by default).
 * This slice adds `chips`, the stat chip once per scale label, with real values from the same
 * resolver the HUD uses. Slice 08 adds `emissive`; slice 13 completes the page.
 */
import type { LoadedModel } from "@repo/llm";
import { useEffect, useState } from "react";
import { STAT_SCALES, type StatChip as StatChipDef, type StatScale } from "../../chapters/types.ts";
import hudCss from "../../hud/hud.module.css";
import { StatChip } from "../../hud/StatChip.tsx";
import { fetchModel } from "../../runtime/models.ts";

/** One chip per scale, each resolved the way a chapter's chip would be. */
const SPECIMENS: Record<StatScale, StatChipDef> = {
  "this tiny model": {
    id: "scale-tiny",
    label: "chance of the top next word",
    format: "pct",
    scale: "this tiny model",
    value: { kind: "probe", probe: "top-successor" },
  },
  "Llama-3-8B": {
    id: "scale-llama",
    label: "parameters",
    format: "int",
    scale: "Llama-3-8B",
    value: { kind: "arith", fn: "params", args: {} },
  },
  "Llama-3-8B on H100 SXM": {
    id: "scale-h100",
    label: "fastest one reply can grow",
    format: "tok/s",
    scale: "Llama-3-8B on H100 SXM",
    value: {
      kind: "arith",
      fn: "decodeCeilingTokPerSec",
      args: { batch: 1, contextLen: 1024, weightBytes: 2, kvBytes: 2 },
    },
  },
  TinyStories: {
    id: "scale-tinystories",
    label: "words counted",
    format: "int",
    scale: "TinyStories",
    value: { kind: "model", metric: "training.tokensSeen" },
  },
};

function ChipsSection({ onReady }: { onReady: () => void }) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  useEffect(() => {
    void fetchModel("counts").then(setModel);
  }, []);
  useEffect(() => {
    if (model) void document.fonts.ready.then(onReady);
  }, [model, onReady]);
  return (
    <section>
      <h2>Stat chip, once per scale</h2>
      <div
        className={hudCss.stats}
        data-crop="specimen:chips"
        style={{
          gridTemplateColumns: `repeat(${STAT_SCALES.length}, auto)`,
          justifyContent: "start",
        }}
      >
        {STAT_SCALES.map((scale) => (
          <StatChip key={scale} stat={SPECIMENS[scale]} model={model} />
        ))}
      </div>
    </section>
  );
}

export function TokensPage({ section, onReady }: { section: string | null; onReady: () => void }) {
  if (section !== null && section !== "chips") return <p>Unknown tokens section: {section}</p>;
  return (
    <main data-testid="tokens" style={{ padding: "24px 32px" }}>
      <h1>Look tokens</h1>
      <ChipsSection onReady={onReady} />
    </main>
  );
}
