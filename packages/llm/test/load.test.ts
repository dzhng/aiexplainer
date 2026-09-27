import { describe, expect, test } from "bun:test";
import { type ModelManifest, loadModel, sha256Hex, tensor } from "../src/index.ts";

type TensorLayout = Pick<ModelManifest["tensors"][number], "name" | "dtype" | "shape"> & {
  byteOffset?: number;
};

const tokenizerUrl = new URL(
  "../../../apps/explainer/public/models/tokenizer/tokenizer.json",
  import.meta.url,
);

// A minimal valid model around `weights`, with tensors laid out back to back unless placed.
async function manifestFor(
  weights: ArrayBuffer,
  layouts: TensorLayout[],
  tokenizer: ModelManifest["tokenizer"] = { kind: "words", vocabTensor: layouts[0]!.name },
): Promise<unknown> {
  let offset = 0;
  const tensors = layouts.map((layout) => {
    const elements = layout.shape.reduce((a, b) => a * b, 1);
    const byteLength = elements * (layout.dtype === "f16" ? 2 : 4);
    const byteOffset = layout.byteOffset ?? offset;
    offset = byteOffset + byteLength;
    return { ...layout, byteOffset, byteLength };
  });
  return {
    formatVersion: 1,
    id: "counts",
    kind: "word-counts",
    tokenizer,
    weightsFile: "weights.bin",
    weightsSha256: await sha256Hex(weights),
    tensors,
    training: {
      dataset: "TinyStoriesV2-GPT4",
      license: "CDLA-Sharing-1.0",
      seed: 0,
      steps: 0,
      tokensSeen: 0,
      wallSeconds: 0,
      torch: "2.14.0",
      gitSha: "0".repeat(40),
    },
    evidence: [{ probe: "p", prompt: "", metric: "m", value: 1, threshold: 0, pass: true }],
  };
}

describe("loadModel", () => {
  test("exposes tensors as views into the weights buffer", async () => {
    const weights = new Uint32Array([7, 8, 9, 10]).buffer;
    const model = await loadModel(
      await manifestFor(weights, [
        { name: "a", dtype: "u32", shape: [2] },
        { name: "b", dtype: "u32", shape: [1, 2] },
      ]),
      weights,
    );
    const b = tensor(model, "b", "u32");
    expect(Array.from(b.data)).toEqual([9, 10]);
    expect(b.data.buffer).toBe(weights);
    expect(() => tensor(model, "b", "f32")).toThrow("is u32, expected f32");
  });

  test("decodes f16", async () => {
    // 1, -2, 0.5, 65504 (largest f16), 2^-24 (smallest subnormal), +infinity
    const weights = new Uint16Array([0x3c00, 0xc000, 0x3800, 0x7bff, 0x0001, 0x7c00]).buffer;
    const model = await loadModel(
      await manifestFor(weights, [{ name: "h", dtype: "f16", shape: [6] }]),
      weights,
    );
    expect(Array.from(tensor(model, "h", "f16").data)).toEqual([
      1,
      -2,
      0.5,
      65504,
      2 ** -24,
      Infinity,
    ]);
  });

  test("rejects weights whose sha256 does not match", async () => {
    const weights = new Uint32Array([1, 2]).buffer;
    const manifest = await manifestFor(weights, [{ name: "a", dtype: "u32", shape: [2] }]);
    await expect(loadModel(manifest, new Uint32Array([1, 3]).buffer)).rejects.toThrow(
      "does not match manifest",
    );
  });

  test("rejects overlapping tensor ranges", async () => {
    const weights = new Uint32Array(4).buffer;
    const manifest = await manifestFor(weights, [
      { name: "a", dtype: "u32", shape: [3] },
      { name: "b", dtype: "u32", shape: [2], byteOffset: 8 },
    ]);
    await expect(loadModel(manifest, weights)).rejects.toThrow('"a" and "b" overlap');
  });

  test("rejects an unknown dtype", async () => {
    const weights = new Uint8Array(4).buffer;
    const manifest = (await manifestFor(weights, [{ name: "a", dtype: "u32", shape: [1] }])) as {
      tensors: { dtype: string }[];
    };
    manifest.tensors[0]!.dtype = "u8";
    await expect(loadModel(manifest, weights)).rejects.toThrow("dtype");
  });

  test("loads the BPE tokenizer a manifest pins, and rejects any other file", async () => {
    const weights = new Float32Array([1]).buffer;
    const tokenizerFile = await Bun.file(tokenizerUrl).arrayBuffer();
    const manifest = await manifestFor(weights, [{ name: "w", dtype: "f32", shape: [1] }], {
      kind: "bpe",
      file: "../tokenizer/tokenizer.json",
      sha256: await sha256Hex(tokenizerFile),
    });
    const model = await loadModel(manifest, weights, tokenizerFile);
    expect(model.tokenizer?.decode(model.tokenizer.encode("Once upon a time"))).toBe(
      "Once upon a time",
    );
    const edited = new Uint8Array(tokenizerFile.byteLength + 1);
    edited.set(new Uint8Array(tokenizerFile));
    edited[tokenizerFile.byteLength] = 0x20;
    await expect(loadModel(manifest, weights, edited.buffer)).rejects.toThrow("tokenizer sha256");
    await expect(loadModel(manifest, weights)).rejects.toThrow("needs its tokenizer file");
  });

  test("rejects a tensor that runs past the end of the weights", async () => {
    const weights = new Uint32Array(2).buffer;
    const manifest = await manifestFor(weights, [{ name: "a", dtype: "u32", shape: [3] }]);
    await expect(loadModel(manifest, weights)).rejects.toThrow("ends past");
  });
});
