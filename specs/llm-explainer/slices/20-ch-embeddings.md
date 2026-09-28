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

## Results (lane A, 2026-09-27)

- **Map data:** `scripts/embed-map.ts` writes `src/scene/embed-map.json` offline: the 30
  neighbour-probe pairs (60 words, the cap) whose partners are nearest by the probe's own
  cosine measure, and a PCA fitted to those 60 real `tok_emb` rows (`scripts/pca.ts`, Jacobi
  eigenvectors). Fitting to the pinned rows (not all 4,096) was measured: it keeps pairs
  tighter on the map (pair/mean distance 0.30 vs 0.37). Across and into the map are the first
  two directions; a pin's height is the third. The help panel says so (`help.notes`, new).
- **Arrows start at the origin's shadow** (the all-zeros embedding projected with the same
  basis), so each arrow is exactly its vector's projection.
- **Kit:** `pins` (needle block, unit-tube head, unit-tube arrow; `placePin`). Arrows carry their
  own radius so label occlusion sees them as thin tubes.
- **Loop (24 s):** chapter 1's bricks fly in and become the “cat” and “kitten” pins (3.4 s); they
  light up with their cosine 0.90 from the model (5 s); arrows grow (9.6–12 s); the pins sink,
  “it” flies in, every other arrow fades and the note says “it” gets one pin in every sentence
  (the failure). Typed words are looked up with a leading space (as mid-sentence); up to 8.
- **Stats:** 64 directions (new `dModel` metric), Llama-3-8B 4,096 (`ARITH.hidden`), and the
  neighbour probe (96.7%).
- **Checks:** kit turntable, hero, strip, 12-azimuth sweep, typed state, registry equal after 10
  in/out gotos, `ch-embeddings.test.ts` (basis re-fit equals the stored one; every pin equals its
  row's projection; pairs are probe pairs; cosine equals `nearestTokens`). Two critique rounds:
  fixed labels occluded by the heads' own capsules, a reverse-flying brick, weak pair glow,
  notes clipped under the title panel, arrow clutter in the failure beat. Still busy: the
  noun cluster's words overlap at the hero angle (inherent to 60 real positions).

## Polish pass (2026-09-27)

- **The noun cluster over its tags.** The words were hard to read where they sat over pin
  heads and bright arrows. The cause was a bug, not the layout: the tag layer cleared its
  inline `textShadow`/`color` with `""` on every text change, which also dropped the values
  React set from `styles.tag`, so no scene word in any chapter ever had its dark halo. The
  reset now restores the tag's own style, and the halo gets a tight 2–3 px rim under the
  soft drop. Word positions are untouched: they are the model's. The size stays what tags have
  always rendered at (1rem, now explicit). Shots: `throwaway/shots/polish-crops/02-cluster-*.png`.
  Critique leftovers, accepted: a few words still sit over a pin cap ("king", "sun"), and the
  emotion words crowd near the hub. The positions are the model's, and the tag layer already
  hides any word that would overlap another.
