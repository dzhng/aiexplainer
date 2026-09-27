import { expect, test } from "bun:test";
import { BLOOM_MAX_MIPS, bloomMipCount, describeBloomChain } from "../src/passes/bloom.ts";

test("the mip chain is capped and never shrinks below a few texels", () => {
  expect(bloomMipCount(720, 450)).toBe(BLOOM_MAX_MIPS);
  expect(bloomMipCount(16, 16)).toBe(3);
  expect(bloomMipCount(1, 1)).toBe(1);
});

test("the chain prefilters HDR into mip 0, walks down, then adds back up", () => {
  const hdr = { id: "hdr" } as unknown as GPUBindGroup;
  const mips = [0, 1, 2, 3].map((i) => ({
    render: { id: `render${i}` } as unknown as GPUTextureView,
    source: { id: `source${i}` } as unknown as GPUBindGroup,
  }));
  const chain = describeBloomChain(hdr, mips);
  const target = (pass: GPURenderPassDescriptor) => [...pass.colorAttachments][0]!;
  expect(chain.prefilter.source).toBe(hdr);
  expect(target(chain.prefilter.pass).view).toBe(mips[0]!.render);
  // Down: level i reads level i-1 and clears.
  expect(chain.down.map((s) => [s.source, target(s.pass).view, target(s.pass).loadOp])).toEqual([
    [mips[0]!.source, mips[1]!.render, "clear"],
    [mips[1]!.source, mips[2]!.render, "clear"],
    [mips[2]!.source, mips[3]!.render, "clear"],
  ]);
  // Up: from the smallest level, each reads level i and adds into level i-1.
  expect(chain.up.map((s) => [s.source, target(s.pass).view, target(s.pass).loadOp])).toEqual([
    [mips[3]!.source, mips[2]!.render, "load"],
    [mips[2]!.source, mips[1]!.render, "load"],
    [mips[1]!.source, mips[0]!.render, "load"],
  ]);
});
