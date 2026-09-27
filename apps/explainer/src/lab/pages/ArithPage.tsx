import { ARITH, H100_SXM, LLAMA_3_8B, evalArith, type ArithFnName } from "@repo/llm";
import type { CSSProperties, ReactNode } from "react";
import { formatStat } from "../../chapters/format.ts";
import type { StatFormat } from "../../chapters/types.ts";
import { cssVars } from "../../look/look.ts";

/** Every number here goes through the same registry and formatter a stat chip uses. */
const show = (fn: ArithFnName, args: Record<string, number>, format: StatFormat) =>
  formatStat(evalArith(fn, args), format);

const PRECISIONS = [
  { name: "bf16", weightBytes: 2, kvBytes: 2 },
  { name: "int8 weights", weightBytes: 1, kvBytes: 2 },
  { name: "int8 weights + KV", weightBytes: 1, kvBytes: 1 },
] as const;
const BATCHES = [1, 8, 32, 64, 128, 256, 512];
const CONTEXTS = [128, 1024, 8192];
const PROMPTS = [128, 512, 2048, 8192];
const ALPHAS = [0.5, 0.6, 0.7, 0.8, 0.9];
const DRAFTS = [1, 2, 4, 8];

const cell: CSSProperties = {
  padding: "4px 10px",
  borderBottom: "1px solid var(--hud-line)",
  textAlign: "right",
  whiteSpace: "nowrap",
};

function Table({ head, rows }: { head: ReactNode[]; rows: ReactNode[][] }) {
  return (
    <table
      style={{
        borderCollapse: "collapse",
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-sm)",
      }}
    >
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i} style={{ ...cell, color: "var(--hud-muted)", fontWeight: 500 }}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            {row.map((v, c) => (
              <td key={c} style={cell}>
                {v}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Section({ fn, children }: { fn: ArithFnName | ArithFnName[]; children: ReactNode }) {
  const fns = Array.isArray(fn) ? fn : [fn];
  return (
    <section style={{ margin: "28px 0" }}>
      {fns.map((f) => (
        <h2 key={f} style={{ fontSize: "var(--text-md)", margin: "4px 0" }}>
          <code>{f}</code>{" "}
          <span style={{ color: "var(--hud-muted)", fontWeight: 400 }}>
            {ARITH[f].describe} · {ARITH[f].scale ?? "pure math"}
          </span>
        </h2>
      ))}
      <div style={{ marginTop: 8, overflowX: "auto" }}>{children}</div>
    </section>
  );
}

function DecodeTable({ precision }: { precision: (typeof PRECISIONS)[number] }) {
  const { weightBytes, kvBytes } = precision;
  const head = ["batch", ...CONTEXTS.flatMap((c) => [`${c} ctx: per sequence`, "whole batch"])];
  const rows = BATCHES.map((batch) => [
    batch,
    ...CONTEXTS.flatMap((contextLen) => {
      const fits = batch <= evalArith("maxBatchByMemory", { contextLen, weightBytes, kvBytes });
      if (!fits) return ["doesn't fit in 80 GB", ""];
      const args = { batch, contextLen, weightBytes, kvBytes };
      return [
        show("decodeCeilingTokPerSec", args, "tok/s"),
        show("batchThroughput", args, "tok/s"),
      ];
    }),
  ]);
  return (
    <>
      <h3 style={{ fontSize: "var(--text-sm)", color: "var(--focus)" }}>{precision.name}</h3>
      <Table head={head} rows={rows} />
    </>
  );
}

export function ArithPage() {
  const constants: [string, ReactNode, string][] = [
    ...Object.entries(LLAMA_3_8B)
      .filter(([k]) => k !== "name" && k !== "source")
      .map(([k, v]): [string, ReactNode, string] => [k, String(v), LLAMA_3_8B.name]),
    ["bandwidth", formatStat(H100_SXM.bandwidth, "bytes") + "/s", H100_SXM.name],
    ["flopsDense (bf16)", `${H100_SXM.flopsDense / 1e12} TFLOP/s`, H100_SXM.name],
    [
      "flopsSparse (with sparsity; never used)",
      `${H100_SXM.flopsSparse / 1e12} TFLOP/s`,
      H100_SXM.name,
    ],
    ["memory", formatStat(H100_SXM.memory, "bytes"), H100_SXM.name],
  ];
  return (
    <main
      data-testid="arith"
      style={{
        ...(cssVars() as CSSProperties),
        minHeight: "100vh",
        padding: "24px 32px",
        background: "var(--bg-deep)",
        color: "var(--ink)",
        fontFamily: "var(--font-ui)",
      }}
    >
      <h1 style={{ fontSize: "var(--text-xl)" }}>Production arithmetic</h1>
      <p style={{ color: "var(--hud-muted)", maxWidth: 820 }}>
        Roofline ceilings for Llama-3-8B on H100 SXM: each step takes as long as the slower of
        reading its bytes and doing its FLOPs, with no overheads. Browser timing is never shown as
        speed (D27).
      </p>

      <section>
        <h2 style={{ fontSize: "var(--text-md)" }}>Cited constants</h2>
        <Table head={["constant", "value", "scale"]} rows={constants} />
        <ul style={{ fontSize: "var(--text-sm)", color: "var(--hud-muted)" }}>
          <li>
            {LLAMA_3_8B.name}:{" "}
            <a style={{ color: "var(--active)" }} href={LLAMA_3_8B.source}>
              {LLAMA_3_8B.source}
            </a>{" "}
            (params recomputed from the shapes)
          </li>
          <li>
            {H100_SXM.name}:{" "}
            <a style={{ color: "var(--active)" }} href={H100_SXM.source}>
              {H100_SXM.source}
            </a>
          </li>
          <li>
            Speculative decoding: Leviathan et al. 2023, Equation (1),{" "}
            <a style={{ color: "var(--active)" }} href="https://arxiv.org/abs/2211.17192">
              https://arxiv.org/abs/2211.17192
            </a>
          </li>
          <li>
            Method:{" "}
            <a
              style={{ color: "var(--active)" }}
              href="https://kipp.ly/transformer-inference-arithmetic/"
            >
              https://kipp.ly/transformer-inference-arithmetic/
            </a>
          </li>
        </ul>
      </section>

      <Section fn={["params", "weightBytes", "kvBytesPerToken", "ridge"]}>
        <Table
          head={["precision", "params", "weights", "KV per token", "ridge (FLOP/B)"]}
          rows={PRECISIONS.map((p) => [
            p.name,
            show("params", {}, "int"),
            show("weightBytes", { weightBytes: p.weightBytes }, "bytes"),
            show("kvBytesPerToken", { kvBytes: p.kvBytes }, "bytes"),
            show("ridge", {}, "int"),
          ])}
        />
      </Section>

      <Section fn={["decodeCeilingTokPerSec", "batchThroughput"]}>
        {PRECISIONS.map((p) => (
          <DecodeTable key={p.name} precision={p} />
        ))}
      </Section>

      <Section fn="maxBatchByMemory">
        <Table
          head={["precision", ...CONTEXTS.map((c) => `${c} ctx`)]}
          rows={PRECISIONS.map(({ name, weightBytes, kvBytes }) => [
            name,
            ...CONTEXTS.map((contextLen) =>
              show("maxBatchByMemory", { contextLen, weightBytes, kvBytes }, "int"),
            ),
          ])}
        />
      </Section>

      <Section fn="prefillSeconds">
        <Table
          head={["precision", ...PROMPTS.map((t) => `${t} tokens`)]}
          rows={PRECISIONS.map(({ name, weightBytes, kvBytes }) => [
            name,
            ...PROMPTS.map((tokens) =>
              show("prefillSeconds", { tokens, weightBytes, kvBytes }, "s"),
            ),
          ])}
        />
      </Section>

      <Section fn="specExpectedTokens">
        <Table
          head={["acceptance α", ...DRAFTS.map((k) => `k = ${k}`)]}
          rows={ALPHAS.map((alpha) => [
            alpha,
            ...DRAFTS.map((k) => show("specExpectedTokens", { alpha, k }, "x")),
          ])}
        />
      </Section>

      <Section fn="moeActiveParams">
        <Table
          head={["experts", "top 1", "top 2"]}
          rows={[8, 16].map((experts) => [
            experts,
            show("moeActiveParams", { experts, topK: 1 }, "int"),
            show("moeActiveParams", { experts, topK: 2 }, "int"),
          ])}
        />
      </Section>
    </main>
  );
}
