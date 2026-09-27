# 04b — Game UI restyle

**Milestone:** M1 · **Depends on:** 04, 09 · **Visual variable:** HUD style (form, not layout)

Added 2026-09-27 from human feedback: "make the UI look like a game UI, not some b2b saas".

## Contract

The HUD, the pinned labels, the help panel and the fallback page read as a polished game
interface (think sci-fi sim or strategy game HUD), not a SaaS dashboard. These stay the same:

- the layout grammar from slice 04: top-left title/why/stats/caption, top-right controls,
  bottom ladder, corner links;
- every behaviour: D12, D24, D31, D32 and the keyboard map;
- all copy.

Only the form changes.

## Direction (settled by a quick 3-way mock, see below)

Before building, produce `specs/llm-explainer/explore/game-ui.html`: one self-contained page
with 3 incompatible game-UI directions applied to the real slice-11b hero shot (use it as
the backdrop image), each as a steal/skip card (the explore-unknowns pattern). The human
gets about 5 minutes to react. Default: the recommended direction.

Candidate directions to render:

- **Holo-tactical:** thin cut-corner frames, bracket corners, scanline or glow edges,
  a condensed display face, mono readouts, cyan and amber accents.
- **Diegetic instrument panel:** chunky bevelled metal plates, engraved labels, and lamp-like
  toggles that match the lab room.
- **Clean arcade:** bold rounded panels, heavy display type, chunky pill toggles with
  pressed states, and playful motion.

## Implementation scope (after the direction is picked)

- **Tokens:** `look.json` `hud` and `type` sections, plus new game-UI tokens (frame stroke,
  corner cut, glow, panel texture). `cssVars()` stays the only source of CSS variables.
- **Fonts:** a display font, self-hosted with an OFL licence (e.g. Rajdhani, Chakra Petch,
  Oxanium or Orbitron, whichever fits the direction), plus the existing mono. Latin subset
  only.
- **Components:** restyle `hud/*` (panels, stat chips, Follow/scenario/view segmented
  controls, the slider, buttons, the ladder, corner links, the help panel) and
  `hud/Labels.tsx` (pins, leaders and pills in the same language).
- **Motion:**
  - A short HUD intro on chapter arrival (panels slide or scan in within 400 ms, in step
    with the 11c arrival move).
  - Hover and press states with feedback.
  - Respect `prefers-reduced-motion`.
- **Game-feel, still honest:** the stat chips may count up to their value on arrival.
  They still show the exact value when settled, and a held clock shows the settled value.
- **Fallback page (slice 12):** restyled to match, once 12 lands. This is a follow-up
  line in this slice.

## Verify

- The existing reducer, keyboard and stats tests stay green. There are no behaviour
  changes.
- **Shots** at 1440×900 and 1280×720: `panel:tl`, `panel:tr`, `panel:ladder`,
  `panel:corner`, `panel:help` and a label crop.
  - **Variable:** HUD style only.
  - Legibility floor: body text contrast ≥ 4.5:1, and stat values readable at 1280×720.
- Run compare-screenshots before (slice 04 look) vs after, and against the chosen mock
  direction. Run screenshot-critique last.
- **Human checkpoint (non-blocking):** before/after full-frame shots.

## Delegated

Exact values within the chosen direction, the icon redraws, and motion timings (≤ 400 ms).
