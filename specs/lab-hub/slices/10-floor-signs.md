# 10 — Floor signs

**Visual variable:** sign legibility

## Contract

In-world signs: each machine's floor plaque ("4 · Attention"), each zone's act name, ✓ on completed machines, and a pulsing ring with "Start here" or "Next" on the recommended one.

## Seam

- The glyph atlas gains ✓ · › ← (P15).
- `scene/hall.ts` writes the signage parts and texts from `layout.json` and `HallView.marks` (completed, recommended, hovered).

## Playable

`/` with empty, partial and complete progress (probe fixtures).

## Verify

- Unit: signage follows `recommended()` and `completed`.
- **Shots:** each zone's crop and the farthest plaque from the hub pose, at 1440×900 and 1280×720. Variable: legibility only.
- GPU ≤ 8 ms with text on vs off, interleaved.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

Plaque size and font within existing look tokens; the ring's pulse rhythm.

## Feedback that would change this slice

Signs too small or too busy.
