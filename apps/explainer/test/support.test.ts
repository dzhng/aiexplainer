import { expect, test } from "bun:test";
import { MIN_WIDTH_PX, detectSupport, type SupportEnv } from "../src/runtime/support.ts";

const desktop: SupportEnv = { search: "", width: 1440, touchOnly: false, hasAdapter: true };

test("a desktop window with an adapter gets the app", () => {
  expect(detectSupport(desktop)).toBe("webgpu");
});

test("no adapter (no navigator.gpu, or requestAdapter gave null) gets the unsupported message", () => {
  expect(detectSupport({ ...desktop, hasAdapter: false })).toBe("no-webgpu");
});

test("a narrow window or a touch-only device is a small screen, even with WebGPU", () => {
  expect(detectSupport({ ...desktop, width: 390 })).toBe("small-screen");
  expect(detectSupport({ ...desktop, width: MIN_WIDTH_PX - 1 })).toBe("small-screen");
  expect(detectSupport({ ...desktop, width: MIN_WIDTH_PX })).toBe("webgpu");
  expect(detectSupport({ ...desktop, touchOnly: true })).toBe("small-screen");
});

test("?force=unsupported forces the unsupported message", () => {
  expect(detectSupport({ ...desktop, search: "?force=unsupported" })).toBe("no-webgpu");
  expect(detectSupport({ ...desktop, search: "?force=app" })).toBe("webgpu");
});
