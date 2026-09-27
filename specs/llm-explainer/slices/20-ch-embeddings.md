# 20 — Chapter 2 · `embeddings` — pins on a map

**Milestone:** M4 · **Depends on:** 13, 16 · **Visual variable:** pin layout. Similar words visibly cluster, and the scale chip makes clear the map is a 3D shadow of `dModel` directions.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 2 · `embeddings` is playable at `/#2`, backed by its real model and passing the template's checks.

## Model

`embed` (D37): the embedding table only.

## New kit primitive

PinField (instanced pins on a floor map, with arrows from the origin)

## Loop beats (20–30 s)

1. Bricks from chapter 1 fly onto the map as pins.
2. cat and kitten land close together.
3. An arrow is drawn from the origin to each pin.
4. **Failure beat:** each pin only knows its own word. The next word is still guessed from one word.

## Notes and scope

The display projection is PCA of the real embedding table, **computed offline and stored in the fixture**, and the help panel discloses it. The chip reads "this tiny model: 64 directions · Llama-3-8B: 4,096".

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the pin positions equal the stored PCA of the manifest's `tok_emb` rows.
- Neighbour pairs shown on screen are exactly those in the `embed` probe evidence.

## Delegated

Which words to pin (≤ 60, drawn from the probe set).

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.
