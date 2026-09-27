# 06 — Blender → glTF pipeline and the counter-board prop

**Milestone:** M1 · **Depends on:** 05 · **Visual variable:** prop silhouette (matte, no emission)

## Contract

Blender scripts in the repo produce static props, and the renderer loads them as
`mesh` parts. The axis convention is proved once and never guessed again.

## Seam

- **Blender scripts:** `assets/blender/<name>.py`, run with `/Applications/Blender.app/Contents/MacOS/Blender -b --python assets/blender/<name>.py -- --out apps/explainer/public/props/<name>.glb`.
  - The script builds the scene from nothing: no `.blend` files are committed.
  - Export is uncompressed GLB, +Y up (the exporter default), with modifiers applied.
  - Materials are principled BSDF: base colour, metallic, roughness and emission.
  - The root script `props:build` rebuilds every prop. The outputs are committed.
- **`axis_probe.py`:** an asymmetric test prop with coloured markers on Blender +X, +Y and +Z.
- **`counter_board.py`:** chapter 0's autocomplete counter board. It is a panel on a stand with a row of count-bar slots and a word-card rail. Each part is a named node (`board.housing`, `board.slot.0..9`, `board.rail`) so later slices can anchor labels and tag parts for cutaway.
- **`packages/renderer/src/gltf.ts`:** `parseGlb(ArrayBuffer): MeshAsset`, giving `{ nodes: { name, positions, normals, indices, material, bounds: Box3 }[] }`.
  - It supports only uncompressed accessors, `emissiveFactor` and `KHR_materials_emissive_strength`.
  - Anything else throws a named error.
- **`Part` gains** `{ kind: 'mesh'; id; asset: AssetId; node?: string; transform: Mat4; explode: Vec3; cutaway: 'keep' | 'clip'; slot }`.
- **Lab:** `/lab/kit/board`, a turntable of 8 azimuths.

## Playable

`/lab/kit/board`, the counter board on a turntable. `/lab/kit/axis` shows the probe.

## Verify

- **bun test** on the committed `axis_probe.glb`: the Blender markers +X, +Y and +Z land at glTF (1,0,0), (0,0,−1) and (0,1,0) (from 3d-harness `sandbox/README.md`).
- **bun test:** `parseGlb` throws on a Draco-compressed fixture.
- **Shot:** crop `part:board` at 8 azimuths, with `?emissive=0&bloom=0`, rendered matte.
  - **Variable:** silhouette only. It should read as a physical counter board and be legible at 1280×720.
  - **Out of scope:** materials, light, glow.
  - Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.

## Resolves

Confirm-list item: the Blender 5.2 glTF axis convention and emissive export (record the result in the README research record).

## Delegated

Prop proportions, bevels and triangle budget (≤ 50k per prop), and parser internals.

## Stays green

01–05.

## Feedback that would change this slice

The human disliking the counter-board concept, e.g. preferring a phone-keyboard autocomplete strip. That is a copy and prop change only.
