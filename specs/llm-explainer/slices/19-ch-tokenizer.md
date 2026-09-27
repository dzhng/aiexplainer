# 19 — Chapter 1 · `tokenizer` — Lego bricks

**Milestone:** M4 · **Depends on:** 13, 14 · **Visual variable:** brick segmentation read. A typed sentence visibly snaps into bricks, and common words are one brick while a rare word takes several.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 1 · `tokenizer` is playable at `/#1`, backed by its real model and passing the template's checks.

## Model

the shared tokenizer (slice 14). No neural model.

## New kit primitive

TokenBrick (a Lego-like brick with its text on the face)

## Loop beats (20–30 s)

1. The chapter-0 failure word (unseen or misspelt) reappears.
2. It snaps into several known bricks.
3. The whole sentence becomes a row of bricks, each with its id stamped on it.
4. The "box of shapes" (the vocab count chip) is shown.
5. **Failure beat:** "cat" and "kitten" are just two unrelated ids. Nothing says they're alike.

## Notes and scope

Stats: vocab size (this tiny model), average characters per brick (TinyStories), Llama-3-8B vocab 128,256. Follow targets: Bricks, Ids, Your text. Slider: none meaningful, so use a text-length scrubber. Scenarios come from the tokenizer probe.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the brick pieces equal `tokenizer.pieces()` for the scenario prompts.

## Delegated

The mapping of brick colour to piece frequency.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Results (lane A, 2026-09-27)

- **Model:** the shared tokenizer is chapter 1's model (`model: "tokenizer"`): the app loads
  `tokenizer.json` with its `evidence.json` (sha-checked) as a `LoadedTokenizer`, and the stat
  chips read it like any model (vocab 4,096 from the file; 4.03 characters per token from the
  `chars-per-token` probe; Llama-3-8B 128,256 from `ARITH.vocab`).
- **Kit:** `brick` (body block plus one unit-tube stud per unit of length; `placeBrick` resizes
  and moves it). Equal tubes now share one geometry, so all studs draw as one instanced draw.
- **Loop (24 s):** chapter 0's “onse” card arrives, leaves, and two bricks “on” + “se” come out
  of the box of shapes; “It was a birdcage!” comes out as seven bricks (bird | c | age) and is
  stamped with ids by 9.4 s; the box lights up with its size; “The cat and the kitten.” comes
  out and cat 460 / kitten 2083 light up as two unrelated numbers (the failure).
- **Colour → frequency (delegated):** pale = a single byte, yellow = ids under 1,024 (early,
  common BPE merges), coral = later merges. A test proves ids are in merge order.
- **Slider:** “Bricks shown”, 1–16 (the text-length scrubber). Text longer than a row wraps to
  a second row in front; the camera looks down enough to read both.
- **Occlusion:** moving parts left stale label occluders (hidden face text). `SceneDesc.layout`
  was added: a builder bumps it when parts move in a way that changes what hides what, and the
  stage re-tests occlusion then.
- **Checks:** kit turntable (8 azimuths), hero on `/lab/scene/tokenizer?clock=held&t=12` and
  `/#1`, 24-frame strip, 12-azimuth label sweep (`?yaw=` on the scene lab page), registry equal
  after 10 in/out gotos, bun tests `ch-tokenizer.test.ts`. Two unprimed critique rounds: fixed
  fused same-word bricks (piece gap), labels pointing at unstamped bricks, over-bright glow,
  bricks hanging in mid-air (they now arc out of and back into the box).
