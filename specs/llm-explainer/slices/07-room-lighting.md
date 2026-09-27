# 07 — Room, lighting and materials

**Milestone:** M1 · **Depends on:** 06 · **Visual variable:** room and lighting mood (no emission, no bloom)

## Contract

The Night-lab room, the lights and the glass and metal materials come from
`LookConfig` data. The HDR scene is tonemapped to the swapchain. Glow is added
later (slice 08).

## Seam

- **`look.json` gains:**
  - `room`: back-wall gradient, floor, vignette;
  - `lights`: key, rim and fill (direction, colour, intensity);
  - `materials`: `metal`, `glass`, `housing` and `floor` presets (base colour token, metallic, roughness, opacity).
- **`packages/renderer/src/passes/room.ts`:** the background and floor, drawn as world geometry.
- **Lit colour pass:** a simple physically-based direct-lighting model (GGX specular, Lambert diffuse) for three lights plus a constant ambient. There is no shadow mapping in v1.
- **Translucent pass:** reads depth but never writes it (glass).
- **Tonemap:** AgX, applied to the resolved `rgba16float`.
- **Prop materials:** props bind material presets by the node-name convention (e.g. `*.housing` uses `housing`).

## Playable

`/lab/renderer?fixture=board-room&emissive=0&bloom=0`: the counter board (plus fixture count bars) in the room. `/lab/scene/<slug>` routes arrive in slice 10.

## Verify

- **Shot:** the full canvas with emission, bloom, labels and HUD off.
  - **Variable:** mood only (room darkness, rim separation of the prop, metal and glass read).
  - **Out of scope:** glow, flows, labels, framing.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against `assets/reference/airsup-whole.jpg` and the Night-lab mock card. Judge tonal range and separation, not content.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Unit test:** translucent-pass depth state is read-only (inspect the pipeline descriptor).
- **Human checkpoint (non-blocking):** the mood. Use preview-shots, wait about 5 minutes, then decide and record the call here.

## Delegated

Light directions and intensities, material values, AgX vs ACES (default AgX), and whether to add image-based lighting (default no).

## Stays green

01–06, including the silhouette shots.

## Feedback that would change this slice

"Too dark", "too blue" and similar. These change `look.json` only.
