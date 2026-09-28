# packages/renderer

The WebGPU renderer, written in TypeGPU. It draws what it is handed: the app builds a
`FrameInput` every frame and the renderer answers with a `FrameReceipt`. Nothing else
crosses the boundary (`src/frame-input.ts`), and the renderer never reads app or domain
state. The general rules for GPU work are in
[the renderer skill](../../.agents/skills/renderer/SKILL.md). This page covers where they
land here.

## Owners

- **Frame orchestration.** `frame.ts` is the one frame function. It encodes every pass
  in order: depth prepass, colour (backdrop, opaque, translucent, text), bloom, tonemap.
  A new pass goes there, not beside it. `renderer.ts` updates each resource at its own
  frequency and uploads only what changed.
- **Resources.** Every buffer and texture comes from a scope of `registry.ts`. A
  size-dependent resource lives in a slot that is rebuilt and swapped in whole.
  `root.destroy()` does not free what the root created, so the registry is not
  optional. A lab page (`/lab/registry`) checks that counts return to baseline.
- **Depth convention.** Reverse-Z on `depth32float`, clear 0, compare `greater`. These
  change together or not at all.
- **Camera and poses.** `camera.ts` owns the view and projection matrices, `project()`,
  and the orbit pose math (eye, direction, a pose from an eye and a target, pose copies).
  GPU packing, label placement, picking and crops all call these functions and read each
  part's own `transform`, so the CPU and GPU agree bit for bit. `orbit.ts` is the pointer-driven orbit as a pure state machine.
- **Packing.** `pack.ts` owns every uniform and storage layout and turns math tuples
  into `Float32Array`s. Each struct has a byte-size constant, and a test checks it.
  `scene.ts` turns a `SceneDesc` into GPU-ready arrays and stays pure, so it can be
  tested with bun.
- **Labels.** `labels.ts` places labels on the CPU. It projects anchors with the same
  `project` and hides them behind the scene's own shapes by casting rays, never by
  reading pixels back. Label text never reaches the renderer, only anchor ids.
- **Text in the world.** Words that belong to a part are drawn on it, not over the page:
  a `SceneText` names its part, a point in the part's space and a face, and is drawn in
  perspective and hidden by whatever stands in front. `text/atlas.ts` owns every glyph: it
  rasterises the page's own fonts with Canvas2D and stores each glyph once as a signed
  distance field (`text/sdf.ts`) in one atlas texture. `text/layout.ts` lays text out, and
  `kit/text.ts` owns how a face becomes directions in the world. The text pass
  (`passes/text.ts`) draws instanced glyph quads after the translucent geometry. It reads
  depth and never writes it, and turns distance into coverage one screen pixel wide.
  Glyphs are laid out only when a text changes, and placements are packed every frame
  without allocating. Label pins stay HTML: they annotate the scene, they are not part of
  it.
- **Props.** `gltf.ts` is a deliberately small GLB reader for the repo's own Blender
  props. Anything it does not support throws, so an asset never half-loads.

## The kit

`src/kit/` holds the only primitives a chapter's scene may be built from. The catalogue
is `kit/catalog.ts`, and each primitive is one module whose `build(params)` returns its
parts, bounds and anchors together (`kit/primitive.ts`). The meshes, occluders and
anchors therefore agree. Per-frame placement helpers (`placeBar`,
`placeBrick`, …) live beside each primitive and write into existing transforms without
allocating. A scene that needs a new shape adds a primitive here with its own lab shot
(`/lab/kit/<id>`) rather than drawing geometry in the app.

## Verification

Pure CPU pieces are covered by bun tests: packing layouts, camera, labels, orbit, the
registry, scene compilation, the kit, and text (layout, atlas packing, distance fields and
placement). Rendered output is checked in a real browser on the hardware GPU by the app's
harness ([apps/explainer](../../apps/explainer/README.md#verification)); `/lab/renderer?fixture=text`
shows text on every kind of face, a billboard, and a post hiding a word.
