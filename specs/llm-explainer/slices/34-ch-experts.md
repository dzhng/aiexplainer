# 34 — Chapter 14 · `experts` — hospital triage

**Milestone:** M4 · **Depends on:** 17, 33 · **Visual variable:** active-path read. Each token visibly goes to exactly 2 bays, and the other 6 stay dark.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 14 · `experts` is playable at `/#14`, backed by its real model and passing the template's checks.

## Model

`moe`.

## New kit primitive

TriageBays (8 expert bays and a router desk)

## Loop beats (20–30 s)

1. The tokens queue at the router desk.
2. Each is sent to 2 of 8 bays (real router choices).
3. The per-token work stays small while the total bay count is large (params chips: total vs active, this tiny model).
4. The usage histogram is shown (the export-gate evidence).
5. **Failure beat:** none. This is the last part before the finished machine.

## Notes and scope

Copy: no invented specialisation. Any pattern shown must come from probe evidence. The production framing uses named assumptions (e.g. a Mixtral-style top-2 of 8), because Llama-3-8B is not an MoE.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the lit bays equal the trace `router.experts`, and that the histogram equals the probe evidence.

## Delegated

Bay layout.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
