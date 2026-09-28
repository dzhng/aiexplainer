# 06 — The hall

**Visual variable:** environment (lighting and mood); machines masked

## Contract

The room grows into a hall with an intro alcove and three act zones, same night-lab style: Blender-scripted, baked AO and practicals, the subject stays brightest.

## Seam

- `assets/blender/lab_hall.py` reads `hall/layout.json` and writes `public/props/lab_hall.glb`; delete `lab_room.py` and its glb. Zone floor inlays, AO pads under footprints, per-zone practicals, the intro alcove on a low dais with its own warm light.
- `look.hall` replaces `look.room`; orbit limits per place come from the layout.
- If the single light pool looks flat across the hall, add a per-frame pool seam (`FrameInput.light`) and record it.

## Playable

`/` (hub pose) and each act zone.

## Verify

- **Shots:** the hub and one hero per act, with machines masked. Variable: the environment only.
- `--check subject-first` on the hub and each hero.
- Byte-reproducible glb build; GPU ≤ 8 ms.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the named prior shot before accepting. Target: today's approved room shots (`room-wide` and a chapter hero).
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

Furniture and dressing, practical strengths, inlay colours from existing tokens.

## Feedback that would change this slice

The hall's mood or scale.
