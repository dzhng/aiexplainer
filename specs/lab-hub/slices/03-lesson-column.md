# 03 — The lesson column

**Visual variable:** the left column in each lesson phase

## Contract

Before Your turn, the left column shows the brief (So far / Still broken / This lesson) and a clear locked note, with **no controls rendered** (no `fieldset disabled`). Start lives in the column; the centre brief card is deleted (P10). On Your turn the controls appear, with a "But…" card above Next. The Labels toggle and Help work in every phase.

## Seam

- `hud/Lesson.tsx`: `BriefRows`, `LockedNote` (text built from the steps this chapter has: type / try / knob), `HandoffCard`. Delete the centre brief card.
- `hud/Hud.tsx` `StoryPanel`: steps render only when `controlsUnlocked(phase)`.
- Enter still presses Start (focus moves to the column's Start button).

## Playable

`/#4?lesson=brief|play|done` and the same for chapters 0 and 11.

## Verify

- A bun test (render tree): before `yourTurn` there is no `input`, no control button and no range in the column; the Labels toggle and Help are present.
- **Shots:** `panel:story` crops at `?lesson=brief|play|done` for chapters 0, 4 and 11, at 1440×900 and 1280×720. Variable: the column only.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the named prior shot before accepting. Target: compare against today's `panel:story` crops per phase.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

Spacing, the lock glyph, and the exact locked-note phrasing within the story.md intent.

## Feedback that would change this slice

Copy of the locked note or the hand-off card.
