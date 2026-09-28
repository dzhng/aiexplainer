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

## Results (2026-09-27)

- **Router choices are real:** one forward pass of `moe` on "Once upon a time, there was a little girl", tracing layer 1's router (`ROUTER_LAYER` 0, of 4) for the first 6 words after `<bos>`. "Once" → bays 6 and 5 (85% / 15%), " upon" → 5 and 6, " a" → 3 and 5, … The desk caption names the layer, so no claim is made about the other three.
- **The histogram is the export gate's evidence.** The experts probe now also records each expert's share of routing slots as `expert-usage-<e>` (threshold: at least half an even share, so a collapsed expert fails); re-probed with `--probe-only`, the entropy evidence reproduced exactly (0.9997) and the shares are 11.8–13.2%, the same numbers as `scenarios.json`'s descriptions.
- **Chips:** `params.total` (2.3 million, counted tensor by tensor) and `params.perToken` (1.12 million: all weights less the 6 idle experts' SwiGLU weights in each of 4 layers), new in `MODEL_METRICS` via `parameterCounts`; and `moeActiveParams` for Llama-3-8B under the named `llamaAsMoe` assumption (13.7 billion per word, hypothetical, labelled "per word, if its MLPs were 8 experts").
- **No specialisation copy.** The probe's per-expert token kinds show no pattern worth naming, so the copy says only that every bay gets its share.
- **Bay layout (delegated):** one row of 8 open booths with the desk at the front left, so each word's two copies walk across to their bays in plain view; each bay's lamp has its own dynamics slot.
- **The slider picks the word** (1–6) and holds it routed; there is no failure beat (the last part before the finished machine); the last beat hands on to chapter 15.
- **Kit: `triageBays`** (`packages/renderer/src/kit/triage-bays.ts`), with `bayCenter`, `deskCenter` and `TRIAGE_SLOTS`.
- **Shots** (`throwaway/shots/34/`): `bays-turn-t{0,1,3}`, `app-t1`, `app-t6.5`, `app-t18`, `loop-strip`, `sweep-sheet`, `exploded`. The registry holds at 11 buffers / 77.7 MB across 10 round trips 14 → 13 → 14.
- **screenshot-critique** (two unprimed passes): lamps now light for most of each word's 2.1 s (the copies leave the desk after 0.3 s), bays carry their numbers 1–8, the histogram has an even-share line (1 in 8) so "every bay gets its share" is readable against it, the waiting words leave once the histogram rises, and the Llama chip reads "per word, as 8 experts (hypothetical)". Left as is: the queue reads right to left (the next word stands nearest the desk).

## Polish pass (2026-09-27)

- **The queue reads left to right.** Waiting words now line up from just right of the desk
  rightward, along the front of the bays, so the queue reads in story order ("time , there")
  and each word steps left to the desk. The "Words waiting" label moves to the desk's front
  right corner, where the queue starts, and the desk's own label stays visible.
