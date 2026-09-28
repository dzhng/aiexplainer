# 21 — Chapter 3 · `sampling` — loaded dice

**Milestone:** M4 · **Depends on:** 13, 16 · **Visual variable:** probability encoding. Face size reads as likelihood, and the temperature slider visibly flattens or sharpens the die.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 3 · `sampling` is playable at `/#3`, backed by its real model and passing the template's checks.

## Model

`embed` (output half).

## New kit primitive

LoadedDie (a die whose face sizes are probabilities; it tumbles and lands)

## Loop beats (20–30 s)

1. The current word's arrow is scored against every word's arrow, shown as a score bar strip.
2. The scores become die faces.
3. The die tumbles and lands.
4. The temperature slider demo runs cold → hot.
5. **Failure beat:** the model only ever looks at one word back ("it" can't know what it refers to).

## Notes and scope

Slider: temperature 0–2 (stat: entropy, this tiny model). Precisely line: dot product, then softmax, then sampling.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that face areas equal `probabilities(logits, T)` for the top-6, plus an "other" face.
- With a held seed, the landed face equals `sample()`.

## Delegated

The number of faces shown (top-6 plus other).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Results (lane A, 2026-09-27)

- **The die (kit `die`):** a barrel die, a drum lying on its side whose rim is split into faces,
  each as wide around the rim as its probability (12 block staves per face, so the part list
  never changes as the shares do). A roll stops at an angle, and the face under the reading
  line is the result. The stop angle is `READING − 2π(r + turns)`, where `r` is the first
  number from roll n's seeded generator. So the face read is exactly `sample(shares, rng)`,
  and a uniformly random stop lands on each face as often as its share.
- **Faces (delegated):** the top 6 words plus one "every other word" face. The score strip shows
  the 12 highest logits, measured up from the vocabulary's mean logit.
- **Temperature:** slider 0–2. While the reader leaves it at 1, the loop's `temperature`
  channel drives the cold → hot demo; once moved, the slider does. The note reads the
  temperature and the spread (entropy, bits) live from the model's logits. Known gap: the HUD
  slider does not move during the loop demo.
- **Loop (26 s):** "…there" is scored (bars rise); the top six light up and grow into the die;
  it rolls and lands on "was" (76%) by 7.2 s; cold (0.2: "was" >99%) then hot (2.0: every
  other word 74%); then "The cat sat on the mat. Then it" and "The dog ran away. Then it" roll
  the identical die (the failure: one word back).
- **Stats:** the sampling-peaked probe (28.2%), the vocabulary 4,096, Llama-3-8B 128,256.
- **Run:** the worker's forward pass; the fixture stores the full logits (353 kB), so the
  test can check face areas against `probabilities(logits, T)`.
- **Checks:** kit turntable, hero, strip, sweep, typed state, registry equal after 10 in/out
  gotos, `ch-sampling.test.ts` (face areas at T 0.3/1/2 equal `probabilities` for the top six
  plus other; the landed face equals `sample()` with the held seed; the two "it" stories have
  identical logits). One critique round: fixed floating face labels, the die hitting the
  bars, washed-out bar glow, unreadable punctuation (now quoted), the missing prompt text.

## Polish pass (2026-09-27)

- **The HUD slider follows the loop's temperature demo.** Chapter 3 adopts `SliderDef.loop`
  (`temperature`), as chapters 11 and 12 do. The scene reads the channel until the reader
  moves the slider (`ui.sliderSet`, instead of comparing the value to its initial one). The
  app snaps the sampled channel to the slider's steps (`snapSlider`, which now also drops
  the float residue of a 0.1 step, e.g. 0.30000000000000004). Checked: t = 11.5 s, scene
  "temperature 0.2" and HUD 0.2; t = 14 s, scene 2.0 and HUD 2 (`throwaway/shots/polish-ch3/`).
  A multi-time `--t` session can show the HUD one sample behind, because it samples at 10 Hz;
  single shots agree.
