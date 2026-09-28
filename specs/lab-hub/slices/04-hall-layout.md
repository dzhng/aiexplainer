# 04 — Hall layout and the clearance gate

**Visual variable:** a top-down plan (not a render)

## Contract

One owner for where every machine stands in the hall, shared by TypeScript and Blender, plus a CPU gate proving full-scale machines don't intrude into each other's approved hero shots. **This slice is the fail-fast gate for P1.**

## Seam

- `apps/explainer/src/hall/layout.json`, validated by `hall/layout.ts`:
  `HallLayout { bounds; zones: { act: ActId; rect; title: { at; yaw } }[]; mounts: Record<ChapterSlug, { origin: [x, z]; yaw: number; footprint; plaque: [x, z] }>; hub: OrbitPose-like; camera: { lab: limits; machine: limits }; flight: { inSec; outSec; holdSec; entrySec }; idleGain: number }`.
- `mountMatrix(slug, out)` (translate · rotY), `mountPose(slug, localPose, out)`, `heroPose(slug, out)` = the chapter's shot through its mount.
- Layout: the intro in its own alcove (H6), then Act I, II, III zones; a U-shaped or long hall is the implementer's call within the gate.
- `/lab/hall-plan`: a top-down SVG of zones, footprints, plaques and each hero shot's view cone.

## Playable

`/lab/hall-plan`.

## Verify

- `hall-layout.test.ts` (CPU only, fixture runs, no GPU):
  1. every part of every chapter, at every beat, stays inside its mount's footprint;
  2. footprints are disjoint, inside their act's zone, and zones are inside `bounds`;
  3. **clearance:** from `heroPose(slug)`, no other footprint's projected box enters the frame nearer than the machine's own target distance.
- If (3) can't pass in a hall under about 45×35 m: stop, record it, and reslice (fallback: per-mount yaw and dividing walls).
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

Hall dimensions, mount positions and yaws, and the zone shapes, all within the gate.

## Feedback that would change this slice

A different overall hall shape.
