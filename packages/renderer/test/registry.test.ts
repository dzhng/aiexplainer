import { expect, test } from "bun:test";
import type { TgpuRoot } from "typegpu";
import { d } from "typegpu";
import { Registry, textureBytes } from "../src/registry.ts";

/** A root that hands out destroyable stand-ins and counts what is still alive. */
function fakeRoot() {
  const live = new Set<object>();
  const make = () => {
    const resource = {
      $usage: () => resource,
      destroy: () => void live.delete(resource),
    };
    live.add(resource);
    return resource;
  };
  return { root: { createBuffer: make, createTexture: make } as unknown as TgpuRoot, live };
}

test("scopes count buffers and textures, and slots free what they replace", () => {
  const { root, live } = fakeRoot();
  const registry = new Registry(root);
  const slot = registry.slot<string>();
  for (const size of [100, 200, 100]) {
    const scope = registry.scope();
    scope.buffer(d.arrayOf(d.f32, size));
    scope.texture({ size: [size, size], format: "rgba16float" });
    slot.swap(scope, `targets ${size}`);
  }
  expect(slot.value).toBe("targets 100");
  expect(live.size).toBe(2);
  expect(registry.stats()).toEqual({ count: 2, bytes: 400 + 100 * 100 * 8 });
  registry.dispose();
  expect(live.size).toBe(0);
  expect(registry.stats()).toEqual({ count: 0, bytes: 0 });
});

test("a build that lands after dispose is freed on arrival", () => {
  const { root, live } = fakeRoot();
  const registry = new Registry(root);
  const slot = registry.slot<number>();
  registry.dispose();
  const late = registry.scope();
  late.buffer(d.f32);
  slot.swap(late, 1);
  expect(slot.value).toBeNull();
  expect(live.size).toBe(0);
  expect(() => late.buffer(d.f32)).toThrow();
});

test("textureBytes counts samples and the whole mip chain", () => {
  expect(textureBytes({ size: [4, 4], format: "depth32float", sampleCount: 4 })).toBe(256);
  expect(textureBytes({ size: [4, 4], format: "rgba16float", mipLevelCount: 3 })).toBe(
    (16 + 4 + 1) * 8,
  );
  expect(() => textureBytes({ size: [1, 1], format: "r8unorm" })).toThrow();
});
