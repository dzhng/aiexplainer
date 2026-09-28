# 31 — Chapter 11 · `batching` — the bus

**Milestone:** M4 · **Depends on:** 18, 30 · **Visual variable:** batch occupancy read. One trip carries more passengers as the batch grows, and the throughput chip rises until the ridge, then flattens.

Inherits [the chapter slice template](_chapter-template.md): seam, order of work, verification, and running screenshot-critique last on every shot.

## Contract

Chapter 11 · `batching` is playable at `/#11`, backed by its real model and passing the template's checks.

## Model

arithmetic only (D27), for Llama-3-8B on H100 SXM.

## New kit primitive

Bus (a Blender prop, `assets/blender/bus.py`, with seats that fill)

## Loop beats (20–30 s)

1. The weight crates load onto the bus (the memory trip).
2. With one passenger, the ceiling chip shows ≈ 208 tok/s.
3. The batch slider fills the seats and throughput rises.
4. At the ridge (~295) the bus is full and throughput flattens.
5. Scenario "prefill": the whole prompt boards at once.
6. **Failure beat:** the crates are heavy (a teaser for chapter 12).

## Notes and scope

Slider: batch 1–512. Every chip is `kind: 'arith'`.

## Verify

Everything in the template, plus the checks below. **Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check on every shot.**

- A bun test checks that the chips equal the `arith` outputs across the slider range, and that no chip references the clock.

## Delegated

Bus proportions.

## Stays green

Every earlier slice.

## Feedback that would change this slice

The analogy not landing for the human. Rework the copy and the beats; the model and seam stay the same.

## Results (2026-09-27)

- **Arithmetic inputs:** bf16 weights and KV cache, 16-token conversations (`BUS_ARITH`), so the KV reads stay small and the knee sits near the ridge. One rider: 208.6 tok/s, one trip 4.79 ms. The bus is full at **329** riders (new `computeBoundBatch`: the batch where a step's sums take as long as its bytes; 316 at 1 token of context, 468 at 128). Past it the total flattens at 65,853 tok/s and trips lengthen (7.78 ms at 512).
- **"Ridge ~295" is shown as the knee (329), not the FLOP/byte ridge.** The chip a reader compares with the seats is the batch where the bus fills; the ridge in FLOP/B is a GPU property with no seat meaning. Recorded here instead of the ledger (orchestrator merges).
- **The loop plays the slider** (`SliderDef.loop`): until the reader moves the slider, the HUD shows the loop's batch, so the chips (all `arith`, bound with `{ slider: true }`) always agree with the seats. `AppState.sliderSet` records the handover. Chips never read loop time directly; the app samples the channel at 10 Hz.
- **Prefill beat:** a 256-token prompt boards at once, one trip 4.8 ms (`prefillSeconds`), shown as blue prompt tokens in the same seats. The HUD has no scenarios (the chapter has no model to cite a probe); prefill is a loop beat.
- **One cube per rider.** Each rider (or, in prefill, each prompt token) is one glowing `block` cube, dealt to the 16 seats in turn so they fill level (21 places a seat, 336 ≥ the 329 capacity); riders past the capacity queue at the stop the same way (210 places). The first design, one bar per seat scaled to a sixteenth of the capacity, drew a lone rider as an invisible 2 cm sliver. The scene uses `mesh` + `block` only.
- **Views: Whole and Exploded.** Both long sides are windows, so a Cutaway section showed nothing new and painted the shell with cap colour; it is left out.
- **Prop:** `assets/blender/bus.py`, a double-decker with windows on both sides, one material per node (the kit splits props by node; a two-material node breaks the split). Built directly with Blender (the same command `props:build` runs) so `lab_room.glb`, owned by 11c, is untouched.
- **Shots** (`throwaway/shots/31/`): `bus-turn-t{0,1,3,6}`, `app-hero`, `loop-strip`, `sweep-sheet`, `cutaway`, `exploded`. The registry holds at 11 buffers / 77.0 MB across 10 round trips 11 → 0 → 11.
- **compare-screenshots** against the hero sheet: the bus body was a saturated royal blue and the crates a warm tan; both muted (body on the `steel` preset, crates #4a4036). **screenshot-critique** first pass: pacing landed at 12 s (tightened to fill by 7.8 s), the far side was a solid wall (now windows), beats opened on empty frames (channels now step on the beat), labels reworded.
