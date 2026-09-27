// A loaded transformer's weights, checked against its arch and widened to f32 once.
// Canonical tensor names (row-major, torch `Linear` layout `[out, in]`):
//   tok_emb [vocab, d]            lm_head [vocab, d] (absent when tiedEmbeddings)
//   layers.{i}.attn_norm [d]      layers.{i}.attn.{wq [nHeads·hd, d], wk/wv [nKvHeads·hd, d], wo [d, nHeads·hd]}
//   layers.{i}.mlp_norm [d]       layers.{i}.mlp.{w1, w3 [hidden, d], w2 [d, hidden]}
//   layers.{i}.moe.router [experts, d]   layers.{i}.moe.experts.{e}.{w1, w2, w3}
//   norm [d]                      (the norms exist only when norm is "rmsnorm")
import type { LoadedModel, Tensor } from "./load.ts";
import type { TransformerArch } from "./manifest.ts";
import type { Tokenizer } from "./tokenizer.ts";

export interface SwigluWeights {
  w1: Float32Array;
  w2: Float32Array;
  w3: Float32Array;
}

export interface LayerWeights {
  attnNorm?: Float32Array;
  attn?: { wq: Float32Array; wk: Float32Array; wv: Float32Array; wo: Float32Array };
  mlpNorm?: Float32Array;
  mlp?: SwigluWeights;
  moe?: { router: Float32Array; experts: SwigluWeights[] };
}

export interface Transformer {
  id: string;
  arch: TransformerArch;
  headDim: number;
  tokenizer: Tokenizer;
  tokEmb: Float32Array;
  /** The unembedding: `tokEmb` itself when embeddings are tied. */
  lmHead: Float32Array;
  norm?: Float32Array;
  layers: LayerWeights[];
}

export function transformerModel(loaded: LoadedModel): Transformer {
  const { manifest, tokenizer } = loaded;
  if (manifest.kind !== "transformer" || !tokenizer) {
    throw new Error(`${manifest.id} is not a transformer`);
  }
  const { arch } = manifest;
  const { dModel: d, nHeads, nKvHeads, vocab } = arch;
  const where = manifest.id;
  if (d % nHeads !== 0 || nHeads % nKvHeads !== 0) {
    throw new Error(`${where}: dModel, nHeads and nKvHeads do not divide evenly`);
  }
  if (tokenizer.vocabSize !== vocab) {
    throw new Error(`${where}: arch.vocab ${vocab} but the tokenizer has ${tokenizer.vocabSize}`);
  }
  const headDim = d / nHeads;
  const used = new Set<string>();
  const weight = (name: string, shape: number[]): Float32Array => {
    used.add(name);
    return widen(loaded, name, shape);
  };
  const norm = (name: string) => (arch.norm === "rmsnorm" ? weight(name, [d]) : undefined);
  const swiglu = (prefix: string, hidden: number): SwigluWeights => ({
    w1: weight(`${prefix}.w1`, [hidden, d]),
    w2: weight(`${prefix}.w2`, [d, hidden]),
    w3: weight(`${prefix}.w3`, [hidden, d]),
  });

  const tokEmb = weight("tok_emb", [vocab, d]);
  const layers = Array.from({ length: arch.nLayers }, (_, i): LayerWeights => {
    const p = `layers.${i}`;
    const layer: LayerWeights = {};
    if (arch.attention === "causal") {
      layer.attnNorm = norm(`${p}.attn_norm`);
      layer.attn = {
        wq: weight(`${p}.attn.wq`, [nHeads * headDim, d]),
        wk: weight(`${p}.attn.wk`, [nKvHeads * headDim, d]),
        wv: weight(`${p}.attn.wv`, [nKvHeads * headDim, d]),
        wo: weight(`${p}.attn.wo`, [d, nHeads * headDim]),
      };
    }
    const { mlp } = arch;
    if (mlp !== "none") {
      layer.mlpNorm = norm(`${p}.mlp_norm`);
      if (mlp.kind === "swiglu") layer.mlp = swiglu(`${p}.mlp`, mlp.hidden);
      else {
        layer.moe = {
          router: weight(`${p}.moe.router`, [mlp.experts, d]),
          experts: Array.from({ length: mlp.experts }, (_, e) =>
            swiglu(`${p}.moe.experts.${e}`, mlp.hidden),
          ),
        };
      }
    }
    return layer;
  });
  const model: Transformer = {
    id: manifest.id,
    arch,
    headDim,
    tokenizer,
    tokEmb,
    lmHead: arch.tiedEmbeddings ? tokEmb : weight("lm_head", [vocab, d]),
    norm: norm("norm"),
    layers,
  };
  const unused = [...loaded.tensors.keys()].filter((name) => !used.has(name));
  if (unused.length > 0) throw new Error(`${where}: tensors not in its arch: ${unused.join(", ")}`);
  return model;
}

function widen(loaded: LoadedModel, name: string, shape: number[]): Float32Array {
  const found: Tensor | undefined = loaded.tensors.get(name);
  const where = `${loaded.manifest.id}: tensor "${name}"`;
  if (!found) throw new Error(`${where} is missing`);
  if (String(found.shape) !== String(shape)) {
    throw new Error(`${where} has shape [${found.shape}], expected [${shape}]`);
  }
  switch (found.dtype) {
    case "f16":
    case "f32":
      return Float32Array.from(found.data);
    case "u32":
      throw new Error(`${where} is u32, not a float weight`);
  }
}
