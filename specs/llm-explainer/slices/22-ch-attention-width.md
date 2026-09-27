# 22 — Chapter 4 · `attention` (a) — pipe width is the real attention weight

**Milestone:** M4 · **Depends on:** 13, 16 · **Visual variable:** width hierarchy. The widest pipe visibly lands on the referent, and widths track the real weights.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 4 · `attention` (a) is playable at `/#4`, backed by its real model and passing the template's checks.

## Model

`attn` (1 layer, no positions). The probe must have passed, or the chapter uses D33.

## New kit primitive

PipeNetwork (tubes from every earlier token to the focus token, radius from `widthScale`)

## Loop beats (20–30 s)

1. The sentence sits as blocks.
2. Pipes grow from each earlier word into the focus word.
3. Their widths settle to the real weights.
4. The water mix flows into the focus word.

## Notes and scope

The sealed pipes and the flow pulses are **out of scope** (slices 23 and 24); here pipes are static and there is no future. Target: compare-screenshots against `explore/directions.html` card 1 (form only, since the mock's widths are invented).

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the packed `widthScale` equals `trace.layers[0].weights[focus]` for the scenario prompt.
- A CPU mirror checks that the pipe radii in the packed buffer are in the same order as the weights.

## Delegated

The pipe curve shape and the mapping from weight to radius (linear or sqrt; record which).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Record (2026-09-27)

- **Scene:** the prompt's tokens as word blocks on a stepped stand, one line per step like a
  page (block width follows the word; lines wrap at 3.1 m). A pipe runs from every token up
  to and including the last one ("but") into a lit block above, the last word's mix.
  - The focus word keeps its own pipe (6.8% here), so the pipes always carry the whole share.
  - `<bos>` shows as "start".
- **Weight → width: linear.** `widthScale` is a radius multiplier applied on the GPU. Each
  vertex scales away from its `axis`, which is the tube's centreline point; `Vertex` grew from
  32 to 48 bytes to carry it. Settled `widthScale` is exactly the trace weight.
  - Tried first: area ∝ weight (radius ∝ √weight). The unprimed compare could not tell 22%
    from 7% apart, so the mapping switched to width ∝ weight.
- **Pipe curve:** a cubic Bézier that rises straight out of the word and enters the mix
  from below.
  - Entry points spread across the mix's underside in the words' own arrangement
    (`pipeEntries`).
  - The first build met at one point, and the unprimed compare flagged the knot it made.
- **Shares:** the widest pipes' shares, each written on its pipe just below the mix. The
  slider "Pipe shares shown" picks 0–5 of them.
- **Measured (attn, Mia prompt):**
  - widest pipe "Mia" 21.6%, then "girl" 16.8%, then "She" 7.4%;
  - `recall-attention` 8.22× uniform on this prompt, 2.98× over 40 prompts.
- **Honesty tests** (`apps/explainer/test/attention.test.ts`):
  - the packed `widthScale` equals `trace.layers[0].attn.weights` bit for bit, both for the
    loop's prompt and for typed text;
  - a CPU mirror of the vertex stage over `compileScene`'s packed vertices shows the drawn
    radii in weight order, proportional to the weights;
  - every scenario is one of the `attn` model's measured prompts.
