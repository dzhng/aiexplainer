// CPU forward timing at the largest `full` size slice 17 may choose (dModel 256), with
// random weights. The budget is ≤ 50 ms per token (README performance gates).
//
//   bun packages/llm/scripts/bench-forward.ts
import {
  createKvCache,
  forward,
  loadTokenizer,
  seededRng,
  type Transformer,
  type TransformerArch,
} from "../src/index.ts";

const arch: TransformerArch = {
  dModel: 256,
  nLayers: 4,
  nHeads: 4,
  nKvHeads: 2,
  ctx: 256,
  vocab: 4096,
  attention: "causal",
  positions: "rope",
  ropeTheta: 10000,
  mlp: { kind: "swiglu", hidden: 1024 },
  norm: "rmsnorm",
  normEps: 1e-5,
  residual: true,
  tiedEmbeddings: true,
};

const rng = seededRng(1);
const random = (n: number, scale: number) =>
  Float32Array.from({ length: n }, () => (rng() * 2 - 1) * scale);
const d = arch.dModel;
const hd = d / arch.nHeads;
const mlpHidden = arch.mlp !== "none" ? arch.mlp.hidden : 0;
const tokEmb = random(arch.vocab * d, 1);
const model: Transformer = {
  id: "bench",
  arch,
  headDim: hd,
  tokenizer: loadTokenizer(
    await Bun.file(
      new URL("../../../apps/explainer/public/models/tokenizer/tokenizer.json", import.meta.url),
    ).json(),
  ),
  tokEmb,
  lmHead: tokEmb,
  norm: new Float32Array(d).fill(1),
  layers: Array.from({ length: arch.nLayers }, () => ({
    attnNorm: new Float32Array(d).fill(1),
    attn: {
      wq: random(d * d, 1 / 16),
      wk: random((d / 2) * d, 1 / 16),
      wv: random((d / 2) * d, 1 / 16),
      wo: random(d * d, 1 / 16),
    },
    mlpNorm: new Float32Array(d).fill(1),
    mlp: {
      w1: random(mlpHidden * d, 1 / 16),
      w2: random(d * mlpHidden, 1 / 32),
      w3: random(mlpHidden * d, 1 / 16),
    },
  })),
};

const tokens = Array.from({ length: 128 }, () => Math.floor(rng() * arch.vocab));
const ms = (start: number) => (Bun.nanoseconds() - start) / 1e6;

forward(model, tokens); // warm up the JIT
let start = Bun.nanoseconds();
const runs = 5;
for (let i = 0; i < runs; i++) forward(model, tokens);
const prefill = ms(start) / runs;

const kv = createKvCache(model);
forward(model, tokens.slice(0, 127), { kv });
start = Bun.nanoseconds();
forward(model, tokens.slice(127), { kv });
const decode = ms(start);

start = Bun.nanoseconds();
forward(model, tokens, { trace: {} });
const traced = ms(start);

console.log(`full-size (d=${d}, 4 layers, GQA 4/2, hidden ${mlpHidden}, vocab ${arch.vocab})`);
console.log(
  `  128-token prompt, no cache: ${prefill.toFixed(1)} ms (${(prefill / 128).toFixed(2)} ms/token)`,
);
console.log(`  one token after 127 cached: ${decode.toFixed(2)} ms`);
console.log(`  128-token prompt, full trace: ${traced.toFixed(1)} ms`);
