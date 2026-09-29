# 07 — Camera flights

**Visual variable:** flight pacing (filmstrip)

## Contract

Every camera move is a pure flight plan evaluated on the one clock (P3), replacing `arrival.ts`. Plans always start from the current pose; input lands a flight (P4); held clocks cut (P5).

## Seam

- `runtime/flight.ts`: `FlightLeg { to: OrbitPose; sec: number; holdSec?: number }`, `FlightPlan { from; legs }`, `flightPose(plan, t, out)`, `blendPose(a, b, k, out)` (today's easing: smoothstep, short-way yaw, log distance), `class Flight { at(now); land(); done }`.
- `hall/flight-plan.ts`: `planTravel(from: PlaceKey | "entry", to: PlaceKey, pose, layout)`: lab→N `[hero(N)]`; N→lab `[hub]`; Next N→M `[hub + hold, hero(M)]`; entry→N from an approach pose. Legs pass an aisle waypoint above neighbours when needed.
- `stage.fly(plan)`, `stage.flying()`, `stage.land()`. `pullBack` (the stack chapter, 7 after renumbering) and the tour use `blendPose`.
- `?fly=<from>><to>` builds a plan starting at t = 0 for held-clock filmstrips.

## Playable

`/lab/flight?fly=4>5` (Next from 4 to 5), in the hall.

## Verify

- `flight.test.ts`: leg boundaries hit exact poses; t past the end = the last pose; `land()` jumps to the end; allocation-free.
- `planTravel` tests: Next always passes the hub pose.
- **Filmstrip:** 8 held frames per leg for lab→4, 4→lab and Next 4→5. Variable: pacing; the out-and-in must be visible.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

Leg durations within P3's ranges, waypoint heights.

## Feedback that would change this slice

Flights feeling slow or dizzying (durations are data).
