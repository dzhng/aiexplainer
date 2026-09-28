# 05 — One world: every machine at full scale

**Visual variable:** hall composition and idle dimming (placement only; the room is still the old one)

## Contract

Every machine is permanently placed in one scene at scale 1 (P1). Exactly one machine is focused: it runs its loop and run and shows its text and labels. Every other machine is frozen at a real frame of its committed fixture run (P2), dimmed, with no text. The app still navigates with today's ladder; the camera cuts to `heroPose`.

## Seam

- `scene/hall.ts` replaces `scene/builders/finished.ts`'s composition (prefixing, slot remapping, text ownership), without scaling: `hallScene(builders, build, layout, assets): { input; update(view: HallView); crops(focus); pickables() }`, `HallView { focus: ChapterSlug | null; loopTime; ui; run; ambientSec; marks }`.
- Idle machines update once (at `ogTimeSec`), not per frame; move the fixture runs to `src/scene/idle-runs/` (equality with the real runs stays tested).
- The stage takes an occluder filter (the focused machine and its neighbours).
- `/lab/scene/<slug>` becomes the hall with `?solo=1`, so the reviewed scene is still the drawn scene.

## Playable

`/#N` (in the old room, stretched to the hall bounds or with an open floor) and `/lab/perf?hall`.

## Verify

- `hall.test.ts` with stub builders: idle `update` once; only the focused machine has text and anchors; slots disjoint; anchors keep chapter ids; a restructure bumps `revision` once.
- **Parity:** for every chapter, the hero shot cropped to its `part:*` union matches today's shot (only the background may differ). Use compare-screenshots on each crop.
- **Perf:** GPU ≤ 8 ms and p95 ≤ 16.7 ms at 1440×900 at the hub pose and the busiest machine, interleaved against today.
- **Shot:** the whole hall from the hub pose with emissive off. Variable: placement and idle dimming only.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

The idle dim value, the occluder-neighbour radius.

## Feedback that would change this slice

Idle machines reading as broken (then switch to a gentle idle loop).
