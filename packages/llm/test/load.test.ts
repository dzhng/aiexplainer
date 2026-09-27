import { describe, expect, test } from "bun:test";
import { type ModelManifest, loadModel, sha256Hex, tensor } from "../src/index.ts";

type TensorLayout = Pick<ModelManifest["tensors"][number], "name" | "dtype" | "shape"> & {
  byteOffset?: number;
};

// A minimal valid model around `weights`, with tensors laid out back to back unless placed.
async function manifestFor(weights: ArrayBuffer, layouts: TensorLayout[]): Promise<unknown> {
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
    tokenizer: { kind: "words", vocabTensor: layouts[0]!.name },
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

  test("rejects a tensor that runs past the end of the weights", async () => {
    const weights = new Uint32Array(2).buffer;
    const manifest = await manifestFor(weights, [{ name: "a", dtype: "u32", shape: [3] }]);
    await expect(loadModel(manifest, weights)).rejects.toThrow("ends past");
  });
});
