# 08 — Place, routes and picking

**Visual variable:** none (behaviour); one hover shot

## Contract

The lab is home (H5): `place = lab | machine | tour` above the lesson (P6); routes per P7; Continue and Next per P8; click a machine in the lab to fly in (P9); keys per P14.

## Seam

- `state/place.ts`: `Place`, `Travel { from; to; epoch }`, actions `go(to, via)`, `landed(epoch)`, `recommended(completed)`, `placeFromHash`, `hashFor`. `go` pushes history; a stale `landed` is ignored.
- `state/lesson.ts`: the arrival phase is the flight in; otherwise unchanged.
- `packages/renderer/src/camera.ts` `screenRay(matrices, x, y, out)`; `hall/pick.ts` `pick(ray, pickables)` (nearest footprint box or plaque); `orbit-input.ts` emits taps (< 4 px).
- The app always draws the hall; focus, flights, orbit limits follow the place.
- `probe.place()`, `probe.go(key)`.

## Playable

The whole flow in the dev app, with the old ladder still present (09 removes it).

## Verify

- Reducer tests: every transition, Next from 14 → lab, Back mid-flight, stale epochs, browser Back.
- `pick.test.ts`: `project` → `screenRay` → `pick` round-trips every mount from the hub pose; the nearer machine wins; empty floor → none.
- Harness: open `/`, click machine 4's projected centre, land in `#4` at the brief; `/#N` under a held clock is byte-identical across runs.
- **Shot:** a hovered machine in the lab. Variable: hover feedback.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

The tap threshold within 3–6 px, hover brightness.

## Feedback that would change this slice

Wanting deep links to cut instead of fly.
