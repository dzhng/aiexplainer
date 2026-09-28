// /lab/models?model=<id>&prompt=<text>: a diagnostic table for one trained model, run
// through the production inference worker. Readability of the tables is the only goal.
import {
  ModelScenarios,
  loadTokenizer,
  probabilities,
  promptTokens,
  type ForwardResult,
  ModelId,
  type Neighbour,
  type Tokenizer,
} from "@repo/llm";
import { useEffect, useState, type CSSProperties } from "react";
import { createSession, type ModelInfo } from "../../runtime/session.ts";

// Every trained model (counts has no forward pass to show).
const MODELS = ModelId.options.filter((id) => id !== "counts");

interface Report {
  info: ModelInfo;
  tokens: number[];
  result: ForwardResult;
  neighbours: Neighbour[];
  tokenizer: Tokenizer;
  prompt: string;
}

async function measure(model: ModelId, requested: string | null): Promise<Report> {
  const session = createSession();
  try {
    const [info, tokenizer, scenarios] = await Promise.all([
      session.load(model),
      fetch("/models/tokenizer/tokenizer.json").then(async (r) => loadTokenizer(await r.json())),
      fetch(`/models/${model}/scenarios.json`).then(async (r) =>
        ModelScenarios.parse(await r.json()),
      ),
    ]);
    const prompt = requested ?? Object.values(scenarios)[0]![0]!;
    const tokens = promptTokens(tokenizer, prompt);
    const lastLayer = (info.arch?.nLayers ?? 0) - 1;
    const result = await session.run(tokens, {
      model,
      ...(lastLayer >= 0 ? { trace: { layers: [lastLayer] } } : {}),
    });
    const neighbours = await session.neighbours(model, tokens.at(-1)!, 8);
    return { info, tokens, result, neighbours, tokenizer, prompt };
  } finally {
    session.dispose();
  }
}

export function ModelsPage({ onReady }: { onReady: () => void }) {
  const params = new URLSearchParams(location.search);
  const model = (params.get("model") ?? "attn") as ModelId;
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    measure(model, params.get("prompt"))
      .then(setReport, (e: Error) => setError(e.message))
      .finally(() => requestAnimationFrame(() => onReady()));
  }, []);

  return (
    <main style={page}>
      <nav style={{ display: "flex", gap: 16, marginBottom: 16 }}>
        {MODELS.map((id) => (
          <a key={id} href={`?model=${id}`} style={{ fontWeight: id === model ? 700 : 400 }}>
            {id}
          </a>
        ))}
      </nav>
      {error && <p style={{ color: "#b00020" }}>{error}</p>}
      {!report && !error && <p>Loading {model}…</p>}
      {report && <ReportView report={report} />}
    </main>
  );
}

function ReportView({ report }: { report: Report }) {
  const { info, tokens, result, neighbours, tokenizer, prompt } = report;
  const label = (id: number) => tokenLabel(tokenizer.decode([id]));
  const probs = probabilities(result.logits, 1);
  const top = Array.from(probs.keys())
    .sort((a, b) => probs[b]! - probs[a]!)
    .slice(0, 5);
  const layer = result.trace?.layers.findLast((l) => l !== null);
  const attn = layer?.attn;

  return (
    <>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>{info.id}</h1>
      <p style={muted}>
        {describeArch(info)} · prompt: <code>{prompt}</code>
      </p>

      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        <section>
          <h2 style={h2}>Top-5 next tokens</h2>
          <table style={table}>
            <tbody>
              {top.map((id) => (
                <tr key={id}>
                  <td style={cell}>{label(id)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{(probs[id]! * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 style={h2}>Embedding neighbours of {label(tokens.at(-1)!)}</h2>
          <table style={table}>
            <tbody>
              {neighbours.map((n) => (
                <tr key={n.token}>
                  <td style={cell}>{label(n.token)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{n.similarity.toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 style={h2}>Probes</h2>
          <table style={table}>
            <thead>
              <tr>
                {["probe", "prompt", "metric", "value", "threshold", "result"].map((h) => (
                  <th key={h} style={head}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {info.evidence.map((e, i) => (
                <tr key={i}>
                  <td style={cell}>{e.probe}</td>
                  <td style={{ ...cell, maxWidth: 260 }}>{e.prompt || "—"}</td>
                  <td style={{ ...cell, maxWidth: 260 }}>{e.metric}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{formatValue(e.value)}</td>
                  <td style={{ ...cell, textAlign: "right" }}>{formatValue(e.threshold)}</td>
                  <td style={{ ...cell, fontWeight: 700, color: e.pass ? "#1b7f3b" : "#b00020" }}>
                    {e.pass ? "pass" : "fail"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      {attn && (
        <section style={{ marginTop: 24 }}>
          <h2 style={h2}>
            Attention weights, last layer (row: the token looking; column: the token it draws from)
          </h2>
          {result.trace!.heads.map((head, hi) => (
            <table key={head} style={{ ...table, marginBottom: 16 }}>
              <thead>
                <tr>
                  <th style={head_}>head {head}</th>
                  {tokens.map((id, j) => (
                    <th
                      key={j}
                      style={{
                        ...head_,
                        writingMode: "vertical-rl",
                        verticalAlign: "bottom",
                        textAlign: "left",
                      }}
                    >
                      {label(id)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tokens.map((id, t) => (
                  <tr key={t}>
                    <th style={{ ...head_, textAlign: "right" }}>{label(id)}</th>
                    {tokens.map((_, j) => {
                      const keys = attn.weights.shape[2]!;
                      const w = attn.weights.data[(t * attn.weights.shape[1]! + hi) * keys + j]!;
                      return (
                        <td
                          key={j}
                          title={w.toFixed(3)}
                          style={{
                            ...heat,
                            background: `rgba(16, 64, 180, ${Math.sqrt(w).toFixed(3)})`,
                            color: w > 0.3 ? "#fff" : "#222",
                          }}
                        >
                          {j <= t && w >= 0.005 ? Math.round(w * 100) : ""}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
          <p style={muted}>
            Cells show weights × 100; colour is the square root of the weight. Blank: under 0.5, or
            a future token (masked). “·” is a space.
          </p>
        </section>
      )}
    </>
  );
}

function describeArch({ arch }: ModelInfo): string {
  if (!arch) return "";
  const mlp = arch.mlp === "none" ? "no MLP" : `${arch.mlp.kind} MLP`;
  return `${arch.nLayers} layer(s), d=${arch.dModel}, ${arch.nHeads} head(s), attention ${arch.attention}, positions ${arch.positions}, ${mlp}`;
}

/** A token as text: a leading or inner space shows as "·", a partial character as "‹byte›". */
function tokenLabel(text: string): string {
  if (text.includes("\uFFFD")) return "‹byte›";
  return text.replaceAll(" ", "·").replaceAll("\n", "⏎");
}

/** Three decimals, or three significant figures for values too small to show that way. */
function formatValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return Math.abs(value) < 0.01 ? value.toPrecision(3) : value.toFixed(3);
}

const page: CSSProperties = {
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  fontSize: 13,
  color: "#222",
  background: "#fff",
  padding: 24,
  minHeight: "100vh",
  boxSizing: "border-box",
};
const muted: CSSProperties = { color: "#666", margin: "0 0 16px" };
const h2: CSSProperties = { fontSize: 14, margin: "0 0 8px" };
const table: CSSProperties = { borderCollapse: "collapse", fontVariantNumeric: "tabular-nums" };
const cell: CSSProperties = { border: "1px solid #ddd", padding: "3px 8px", verticalAlign: "top" };
const head: CSSProperties = { ...cell, background: "#f4f4f4", textAlign: "left" };
const head_: CSSProperties = {
  fontWeight: 400,
  fontFamily: "ui-monospace, monospace",
  fontSize: 11,
  padding: "2px 4px",
  whiteSpace: "nowrap",
};
const heat: CSSProperties = {
  width: 22,
  height: 22,
  textAlign: "center",
  fontSize: 10,
  border: "1px solid #eee",
};
