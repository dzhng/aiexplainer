import { expect, test } from "bun:test";
import type { Vec3 } from "math";
import { cameraMatrices, createCameraMatrices } from "../src/camera.ts";
import type { Part, SceneAnchor, SceneDesc } from "../src/frame-input.ts";
import type { ScreenRect } from "../src/camera.ts";
import {
  DEFAULT_LABEL_BOX,
  placeLabels,
  sceneAnchors,
  sceneOccluders,
  type LabelPlacement,
} from "../src/labels.ts";
import { testLook } from "./look.ts";

const view = { mode: "whole" as const, t: 0 };
const identity: Part["transform"] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const block = (id: string, [x, y, z]: Vec3, [sx, sy, sz]: Vec3): Part => ({
  kind: "block",
  id,
  slot: 0,
  material: "metal",
  transform: [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, x, y, z, 1],
});
/** Anchors hang off an unscaled carrier far below the scene, so `at` is a world position. */
const CARRIER_Y = -50;
const carrier = block("carrier", [0, CARRIER_Y, 0], [1, 1, 1]);
const anchor = (id: string, [x, y, z]: Vec3, priority = 0): SceneAnchor => ({
  id,
  part: "carrier",
  local: [x, y - CARRIER_Y, z],
  priority,
});

/** The eye sits on +Z at distance 10, looking at the origin; the viewport is 800×600. */
function place(
  parts: Part[],
  anchors: SceneAnchor[],
  obstacles: ScreenRect[] = [],
): Record<string, LabelPlacement> {
  const scene: SceneDesc = { revision: 1, parts: [...parts, carrier], anchors, assets: {} };
  const matrices = cameraMatrices(
    { target: [0, 0, 0], yaw: 0, pitch: 0, distance: 10, fovY: 0.8 },
    { width: 800, height: 600, dpr: 1 },
    createCameraMatrices(),
  );
  const placements = placeLabels(
    matrices,
    sceneAnchors(scene, view),
    sceneOccluders(scene, view, testLook()),
    [],
    DEFAULT_LABEL_BOX,
    obstacles,
  );
  return Object.fromEntries(placements.map((p) => [p.id, p]));
}

const wall = block("wall", [0, 0, 0], [2, 2, 0.2]);

test("an anchor behind a box is occluded; one in front, or on the box's face, is visible", () => {
  const placed = place(
    [wall],
    [anchor("behind", [0, 0, -1]), anchor("face", [0, 0.4, 0.1]), anchor("front", [-1.2, -1.2, 2])],
  );
  expect(placed.behind).toMatchObject({ visible: false, hiddenBy: "occluded" });
  expect(placed.face).toMatchObject({ visible: true });
  expect(placed.front).toMatchObject({ visible: true });
});

test("an anchor behind the camera is 'behind'; one outside the frustum is 'offscreen'", () => {
  const placed = place([], [anchor("back", [0, 0, 12]), anchor("side", [40, 0, 0])]);
  expect(placed.back).toMatchObject({ visible: false, hiddenBy: "behind" });
  expect(placed.side).toMatchObject({ visible: false, hiddenBy: "offscreen" });
});

test("a tube's capsule hides an anchor behind it, but not one the ray passes above", () => {
  const tube: Part = {
    kind: "tube",
    id: "pipe",
    slot: 0,
    material: "metal",
    radius: 0.2,
    path: [
      [-2, 0, 0],
      [2, 0, 0],
    ],
    transform: identity,
  };
  const placed = place([tube], [anchor("hidden", [0, 0, -1]), anchor("clear", [0, 1, -1])]);
  expect(placed.hidden).toMatchObject({ visible: false, hiddenBy: "occluded" });
  expect(placed.clear).toMatchObject({ visible: true });
});

test("a pipe stretched along its length keeps its radius as an occluder", () => {
  // A unit segment (radius 1, 0 → +Y) stretched 4 m along X with radius 0.2, like `placeSegment`.
  const pipe: Part = {
    kind: "tube",
    id: "pipe",
    slot: 0,
    material: "metal",
    radius: 1,
    path: [
      [0, 0, 0],
      [0, 1, 0],
    ],
    transform: [0, 0.2, 0, 0, 4, 0, 0, 0, 0, 0, 0.2, 0, -2, 0, 0, 1],
  };
  const [capsule] = sceneOccluders(
    { revision: 1, parts: [pipe], anchors: [], assets: {} },
    view,
    testLook(),
  );
  expect(capsule).toMatchObject({ kind: "capsule", a: [-2, 0, 0], b: [2, 0, 0] });
  expect((capsule as { radius: number }).radius).toBeCloseTo(0.2, 6);
  const placed = place([pipe], [anchor("hidden", [0, 0, -1]), anchor("clear", [0, 0.6, -1])]);
  expect(placed.hidden).toMatchObject({ visible: false, hiddenBy: "occluded" });
  expect(placed.clear).toMatchObject({ visible: true });
});

test("a crowded lower-priority label takes the next free side", () => {
  const placed = place([], [anchor("minor", [0, 0, 0], 1), anchor("major", [0.05, 0, 0], 5)]);
  expect(placed.major).toMatchObject({ visible: true, side: "up-right" });
  expect(placed.minor).toMatchObject({ visible: true, side: "up-left" });
  // Far enough apart, both keep the first side.
  const apart = place([], [anchor("a", [-2, 0, 0], 1), anchor("b", [2, 0, 0], 5)]);
  expect([apart.a!.side, apart.b!.side]).toEqual(["up-right", "up-right"]);
});

test("with every side blocked, the lower priority hides", () => {
  // Obstacles fill every side of the centre dot except the one the major label takes.
  const blocked: ScreenRect[] = [
    { x: 150, y: 250, width: 230, height: 45 },
    { x: 150, y: 305, width: 500, height: 45 },
  ];
  const placed = place(
    [],
    [anchor("minor", [0, 0, 0], 1), anchor("major", [0.02, 0, 0], 5)],
    blocked,
  );
  expect(placed.major).toMatchObject({ visible: true, side: "up-right" });
  expect(placed.minor).toMatchObject({ visible: false, hiddenBy: "overlap" });
});

test("a label near the screen edge flips to stay on screen", () => {
  // The dot is 100 px from the right edge: an up-right pill (18 + 220 px) would leave the screen.
  const placed = place([], [anchor("edge", [4.23, 0, 0])]);
  expect(placed.edge).toMatchObject({ visible: true, side: "up-left" });
});

test("the dot sits on the projected anchor", () => {
  const placed = place([], [anchor("centre", [0, 0, 0])]);
  expect(placed.centre!.x).toBeCloseTo(400, 3);
  expect(placed.centre!.y).toBeCloseTo(300, 3);
});

test("translucent parts never hide a label", () => {
  const glass = block("glass", [0, 0, 0], [2, 2, 0.2]);
  if (glass.kind === "block") glass.material = "glass";
  const placed = place([glass], [anchor("behind", [0, 0, -1])]);
  expect(placed.behind).toMatchObject({ visible: true });
});

test("a label's pill may not cover another label's dot", () => {
  // At 70.9 px/m, the second dot sits inside the first pill (60 px right, 27 px up) while
  // the two pills themselves miss each other: no side of the second label can uncover its dot.
  const placed = place([], [anchor("low", [0, 0, 0], 5), anchor("high", [0.846, 0.381, 0], 1)]);
  expect(placed.low).toMatchObject({ visible: true, side: "up-right" });
  expect(placed.high).toMatchObject({ visible: false, hiddenBy: "overlap" });
});
