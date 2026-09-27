import { expect, test } from "bun:test";
import { dequantizeQ8_0 } from "../src/index.ts";

test("q8_0 decodes bit for bit like Python (zero, subnormal-scale and extreme groups)", async () => {
  const fixture: { blocksHex: string; values: number[] } = await Bun.file(
    new URL("../../../training/fixtures/q8.json", import.meta.url),
  ).json();
  const bytes = Uint8Array.fromHex(fixture.blocksHex);
  // Offset by 2 inside a larger buffer: views must honour byteOffset.
  const shifted = new Uint8Array(bytes.length + 2);
  shifted.set(bytes, 2);
  const decoded = dequantizeQ8_0(shifted.subarray(2));
  expect(Array.from(decoded)).toEqual(fixture.values);
  expect(decoded.slice(64, 96).every((v) => v === 0)).toBe(true);
});
