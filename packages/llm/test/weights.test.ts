import { expect, test } from "bun:test";
import { Q8_GROUP, dequantizeQ8_0, fetchModel, weightSlice } from "../src/index.ts";

const models = new URL("../../../apps/explainer/public/models/", import.meta.url);
const shipped = (id: string) => fetchModel(new URL(`${id}/manifest.json`, models));
const full = await shipped("full");
const q8 = await shipped("full-q8");

test("weightSlice reads f16 weights as stored and q8_0 as scale · q, inside one group", () => {
  const name = "layers.0.attn.wq";
  const f16 = full.tensors.get(name)!.data as Float16Array;
  expect(weightSlice(full, name, 40, 8).values).toEqual(Array.from(f16.subarray(40, 48), Number));
  const slice = weightSlice(q8, name, 40, 8);
  const raw = q8.tensors.get(name)!.data as Uint8Array;
  const group = dequantizeQ8_0(raw.subarray(34, 68));
  expect(slice.values).toEqual(Array.from(group.subarray(8, 16)));
  expect(slice.q8!.q.map((q) => q * slice.q8!.scale)).toEqual(slice.values);
  expect(Math.max(...slice.q8!.q.map(Math.abs))).toBeLessThanOrEqual(127);
  expect(() => weightSlice(q8, name, Q8_GROUP - 4, 8)).toThrow("inside one group");
  expect(() => weightSlice(full, name, -1, 2)).toThrow("outside");
});
