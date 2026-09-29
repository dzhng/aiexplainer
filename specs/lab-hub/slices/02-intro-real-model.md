# 02 — The intro on the real model

**Visual variable:** the intro board's content and rhythm

## Contract

The intro runs `full` (chapter 8's model): greedy next-token steps over the whole text, the tally board shows its real next-word probabilities, and a sentence grows on the rail, ending on "An LLM guesses the next word, over and over — let's build one." The word-pair counts model is deleted end to end, and so is the residual chapter (H16).

## Seam

- Rename slug `autocomplete` → `intro` and builder id `autocomplete` → `board` (P16).
- `runtime/runs/intro.ts`: `IntroRun { kind: "intro"; steps: { text: string; top: { word: string; p: number }[]; pick: number }[] }`, from `session.run` on `full` (a named model), greedy.
- New training probe `intro-whole-words` in `training/probes/`: search prompts for one whose greedy continuation is ≥ 6 whole-word tokens with no repeats; record the prompt and the continuation in `full`'s evidence; the intro's scenario cites it (D25). If none passes, apply D33 and say so in the caption.
- Delete: `training/counts.py`, `apps/explainer/public/models/counts/`, the counts probes, `packages/llm/src/counts.ts`, counts metrics and schema variants, `nextWords` (llm, worker, session, runs), `CountsRun`, the old intro loop, counts tests. Keep the fixture corpus that the tokenizer tests use (rename it).
- Chapter 1's loop starts from the intro's sentence instead of "onse" (P12).
- Delete the residual chapter: `chapters/data/residual.ts`, its builder, run, fixtures and card, kit primitives only it uses, the `residual` and `noresidual` models with their probes and configs. The stack chapter's Technical line carries the river idea.
- Intro stats read from `full` (`training.tokensSeen`, `params.total`) plus arith for Llama-3-8B.
- Labels and Technical line per [story.md](../story.md) (tokens, greedy).

## Playable

`/#0` in today's app.

## Verify

- A grep test: no `counts`, `nextWords` or `onse` identifiers in `apps`, `packages`, `training`.
- A bun test: every rail step equals greedy `full` output from the probe's prompt; the bars equal the run's top probabilities.
- `trained-parity` green; `shipped-models` ≤ 25 MB (smaller now).
- **Shot:** `/#0` at 4 held times, cropped to `part:board*`. Variable: the board's content and rhythm only.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the named prior shot before accepting. Target: compare against today's intro hero (`assets` in the archived spec or a fresh baseline shot before the change).
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

The prompt (probe-chosen), the header plate wording, the number of steps (5–7).

## Feedback that would change this slice

Intro pacing, or wanting sampling instead of greedy.
