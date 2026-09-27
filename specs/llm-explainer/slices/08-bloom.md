# 08 — Emission and bloom

**Milestone:** M1 · **Depends on:** 07 · **Visual variable:** glow halo (strength and falloff)

## Contract

Emissive parts glow the way the reference's flames and flows do. The bloom
lives inside the one frame function, is tuned only from data, and fits the GPU
budget.

## Seam

- **`packages/renderer/src/passes/bloom.ts`**, run after the resolve and before the tonemap:
  1. A Karis-averaged soft-knee threshold into mip 0.
  2. A 13-tap downsample through 6 mips of one `rgba16float` texture, using per-mip `createView('render', { baseMipLevel, mipLevelCount: 1 })`.
  3. A tent upsample, added into each level above.
  4. Composite.
- **References:**
  - Jimenez 2014: https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/
  - LearnOpenGL "Physically Based Bloom": https://learnopengl.com/Guest-Articles/2022/Phys.-Based-Bloom
- **Knobs** in `look.json` under `bloom`: threshold, knee, intensity, radius, and an emissive multiplier per token.
- **Frame input:** `FrameInput.dynamics.intensity[slot]` scales each part's emission.
- **`?bloom=0`** sets `debug.bloom = false` and skips the passes, but keeps the registry resources allocated.

## Playable

- `/lab/tokens?section=emissive`: palette swatches at emissive 1×, 4× and 16× through the real bloom. This slice creates the page with that one section; slice 13 completes it.
- `/lab/renderer?fixture=board-room`: the fixture count bars glow.

## Verify

- **Shot:** a 256 px crop around the brightest count bar, plus a crop of a dark room corner, with bloom on vs off.
  - **Variable:** halo falloff. The halo must exist, fall off smoothly without banding or fireflies, and not veil the dark corner.
  - **Out of scope:** everything else.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the mock's glowing-pipe crop and `assets/reference/airsup-cutaway-follow.jpg` (the flame glow).
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Performance:** bloom on vs off, interleaved on one machine, as whole-frame timestamps. The whole frame must stay ≤ 8 ms GPU at 1440×900. Record the delta here.
- **Registry baseline** still returns to baseline after resize, because the mip chain is size-dependent and lives in a scope.

## Delegated

Mip count (5–6), filter weights, and the knob values.

## Stays green

01–07.

## Feedback that would change this slice

"Too much glow" or "not enough". These change `look.json` only.
