# 09 — The lab column and the breadcrumb

**Visual variable:** the left column in the lab and the breadcrumb

## Contract

In the lab, the left column shows the intro, the acts with their machines and ✓s, and a big Continue button (P8). Inside a machine: a breadcrumb "Lab › Act II › 4 Attention" and "← Back to the lab (Esc)". The bottom ladder is deleted.

## Seam

- `hud/LabColumn.tsx`, `hud/Breadcrumb.tsx`; delete `Ladder`, its styles, its safe-rect reservation, the `prev` action and ←.
- Copy per [story.md](../story.md) ("The lab: first five seconds", "Inside a machine").

## Playable

`/` (first visit, partly done, all done) and inside any machine.

## Verify

- Tests: Continue's label and target for empty / partial / complete progress.
- **Shots:** `panel:lab` for the three progress states and `panel:crumb` inside chapter 4, at 1440×900 and 1280×720. Variable: the column only.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

Spacing and how the acts list collapses when long.

## Feedback that would change this slice

The lab column's wording or density.
