# 05 — Renderer foundation, camera and orbit

**Milestone:** M1 · **Depends on:** 01 · **Visual variable:** silhouette and depth order (flat-lit)

## Contract

`packages/renderer` draws what it is handed, through one interface, following every rule in
[the renderer skill](../../../.agents/skills/renderer/SKILL.md). CPU camera math and GPU projection agree.
A hand-built orbit, zoom and pan controller exists.

## Seam

- **`src/frame-input.ts`:**
  ```ts
  interface FrameInput {
    timeSec: number;
    viewport: { width: number; height: number; dpr: number };
    camera: OrbitPose; // { target: Vec3; yaw; pitch; distance; fovY }
    view: { mode: "whole" | "cutaway" | "exploded"; t: number };
    scene: SceneDesc; // re-uploaded only when scene.revision changes
    dynamics: { intensity: Float32Array; widthScale: Float32Array; flowPhase: Float32Array }; // per frame, indexed by part slot
    debug?: { layers?: number; bloom?: boolean }; // one bitmask; no branches per pass
  }
  interface Renderer {
    frame(i: FrameInput): FrameReceipt;
    resize(): void;
    dispose(): void;
  }
  interface FrameReceipt {
    drawCalls: number;
    triangles: number;
    registry: { count: number; bytes: number };
  }
  function createRenderer(
    canvas: HTMLCanvasElement,
    look: LookConfig,
  ): Promise<Renderer | { unsupported: string }>;
  ```
  The `Part` kinds in this slice are `block` (instanced boxes) and `tube` (a path swept by a radius). Mesh parts arrive in slice 06.
- **`src/device.ts`:** the TypeGPU root from `tgpu.init()`, plus a capability record.
- **`src/registry.ts`:** every buffer and texture is allocated here, with `scope()` for size-dependent targets and `slot()` for replaceable resources. It exposes `stats()`.
  - Rebuilds on resize are built into a new scope and swapped in whole.
  - A build that finishes after `dispose` is freed.
- **`src/frame.ts`:** the one frame function, in this order:
  1. depth prepass (no fragment stage);
  2. opaque colour into `rgba16float` with 4× MSAA;
  3. translucent;
  4. resolve;
  5. tonemap to the swapchain (a pass-through until slice 07).

  Depth is reverse-Z `depth32float`, cleared to 0, compared with `greater`. The prepass and the colour pass share one `@invariant` vertex stage. The background pass also resolves (the Apple tile quirk).

- **`src/camera.ts`:** `cameraMatrices(pose, viewport, out)` uses pmndrs `mat4.perspectiveZO` with near and far swapped, and `mat4.lookAt`. It computes in float32.
  - `project(matrices, point, out) → { x, y, depth, behind }`
  - `partWorld(part, view, out)` is the single transform for explode and cutaway. Before slice 13 it is identity for `whole`.
- **`src/pack.ts`:** the one tuple → `Float32Array` / `d.mat4x4f` packing helper. Uniform structs are padded to 16 B, with a byte-size constant next to each schema.
- **`src/orbit.ts`:** a pure `OrbitController`. Pointer and wheel events go in, and an `OrbitPose` comes out, with damping and pitch clamps. It is bun-testable.
- **Lab:** `/lab/renderer?fixture=boxes`, which loads JSON `FrameInput` fixtures from `apps/explainer/src/lab/fixtures/`. `/lab/calib` shows a unit grid and an axis gizmo.
- **Probe:** `receipt()` and `crops()`. `part:<id>` is the projected bounds of that part, computed from the app's own shapes and never from pixels.

## Playable

`/lab/renderer?fixture=boxes`: overlapping boxes and a tube that you can orbit, zoom and pan.

## Verify

- **bun tests:**
  - `cameraMatrices` against hand-computed matrices for two poses.
  - `project` against the packed uniform values, within 0.5 px.
  - Uniform packers against their byte-size constants.
  - `OrbitController` clamps and damping.
- **Browser registry-baseline test:** count and bytes return to baseline after 10× resize, a pipeline rebuild, 3× reset and dispose.
- **Shot:** crop the union of the fixture boxes' `part:*`. Rendering is flat-lit with no bloom.
  - **Variable:** silhouette and depth order only (the nearer box occludes correctly, no z-fighting, MSAA edges).
  - **Out of scope:** colour, lighting, glow.
  - Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **First step:** reproduce the official TypeGPU "Two Boxes" or "Phong" example in `/lab/typegpu-smoke` before writing `frame.ts`. This proves the pinned API on this machine; delete it once `frame.ts` passes.

## Resolves

Confirm-list item: read the typegpu 0.12.6 and math 0.1.0 APIs (record any surprises in the README research record).

## Delegated

TGSL vs raw WGSL per shader, internal module split, and tube tessellation.

## Stays green

01–04.

## Feedback that would change this slice

None expected. This is infrastructure.
