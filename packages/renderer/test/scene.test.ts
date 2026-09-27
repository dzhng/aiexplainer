import { expect, test } from "bun:test";
import type { LookConfig, Part } from "../src/frame-input.ts";
import { compileScene, partWorldBounds } from "../src/scene.ts";

const look: LookConfig = {
  room: { wallTop: [0, 0, 0], wallBottom: [0, 0, 0] },
  materials: {
    metal: { baseColor: [0.2, 0.2, 0.3], opacity: 1 },
    glass: { baseColor: [0.2, 0.4, 0.9], opacity: 0.3 },
  },
};

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as Part["transform"];
const block = (id: string, material: string, slot = 0): Part => ({
  kind: "block",
  id,
  slot,
  material,
  transform: identity,
});

test("blocks share one instanced draw per pass; translucent draws come last", () => {
  const compiled = compileScene(
    {
      revision: 1,
      parts: [
        block("a", "metal"),
        block("g", "glass", 3),
        {
          kind: "tube",
          id: "t",
          slot: 1,
          material: "metal",
          radius: 0.1,
          path: [
            [0, 0, 0],
            [1, 0, 0],
          ],
          transform: identity,
        },
        block("b", "metal"),
      ],
    },
    look,
  );
  expect(compiled.draws.map((d) => [d.instanceCount, d.translucent])).toEqual([
    [2, false],
    [1, false],
    [1, true],
  ]);
  expect(compiled.parts.map((p) => p.id)).toEqual(["a", "b", "t", "g"]);
  expect([...compiled.materialIndex]).toEqual([0, 0, 0, 1]);
  expect(compiled.slotCount).toBe(4);
  // The two block draws share the cube's vertices.
  expect(compiled.draws[0]!.baseVertex).toBe(compiled.draws[2]!.baseVertex);
});

test("an unknown material is rejected with the part named", () => {
  expect(() => compileScene({ revision: 1, parts: [block("x", "chrome")] }, look)).toThrow(
    /x.*chrome/,
  );
});

test("partWorldBounds places local bounds with the part transform", () => {
  const part: Part = {
    ...block("s", "metal"),
    transform: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 5, 0, 0, 1],
  };
  const out = partWorldBounds(part, { mode: "whole", t: 0 }, [0, 0, 0, 0, 0, 0]);
  expect(out).toEqual([4, -0.5, -0.5, 6, 0.5, 0.5]);
});
