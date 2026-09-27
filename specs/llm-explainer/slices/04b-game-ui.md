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

## Results (2026-09-27)

- **Direction: holo-tactical, taken whole** (the human's pick from
  `explore/game-ui.html`; it was also the recommendation). The three mocks ran over the real
  11b hero shot, held at 5.4 s with the HUD and labels off.
- **Tokens:** `look.json` `hud` gains `panelTop`, `frame`, `scan`, `accent`, `accentSoft`,
  `glow`, `cut` and `cutSmall`; `type` gains `display`. `cssVars()` stays the only source of
  CSS variables. The HUD's cyan is `hud.accent`, not the palette's `active`, so the scene is
  untouched. Amber is the palette's `focus`, the room's lamp colour.
- **Font:** Chakra Petch 600 and 700, latin only, from @fontsource/chakra-petch 5.3.0,
  with `ChakraPetch-OFL.txt` beside the files. Inter stays for body text and JetBrains Mono
  for readouts.
- **Components:**
  - Panels, chips, pills and the help panel are cut-corner plates with a thin cyan stroke,
    a faint scanline fill and bracket corners.
  - Toggles are slanted tabs. The slider is a tick track with a diamond thumb. The ladder
    is a row of ticks, with the current chapter as a slanted tab. Hover, press (1 px dip)
    and focus states are in place.
  - Labels (`hud/labels.module.css`) are a reticle dot, a glowing leader and a cut-corner
    tag. Geometry still comes from the renderer's label box.
- **Motion (`hud/motion.ts`):**
  - On arrival, the panels slide and fade in from their edges: 360 ms with a 40 ms stagger,
    using the Web Animations API on `translate`/`opacity`.
  - The stat chips count up over 400 ms through `formatStat` and then show exactly
    `statText`, which a test pins. The settled text holds each chip's width, so the row
    doesn't move during the count.
  - A held clock (`clockIsHeld`) or `prefers-reduced-motion` skips both; CSS transitions
    are also off under reduced motion.
  - Timing comes from rAF/WAAPI, so `clock.ts` is still the only file that reads the wall
    clock.
- **Verification:**
  - `bun run verify` is green.
  - The harness passes on `/#0` (held and live) and on `/lab/tokens?section=chips` with
    zero console warnings.
  - A live filmstrip showed the intro and count-up; the reduced-motion run was settled at
    once, and the chips settled on "486 million", "8,192" and "99.9%".
- **Contrast:** the panel fill is composited over pure white as the worst case.
  - ink 9.1, muted 4.8, accent 7.3, amber 6.3;
  - over the room they are 8.2–15.5;
  - dark ink on the pressed cyan tab is 12.9.
  - The only text below 4.5:1 is the unwritten-chapter numbers on the ladder, which are
    disabled controls (as before).
- **Shots** (`throwaway/shots/04b/`):
  - before is `before.png`, `before-720.png`;
  - after is `after-full-1440.png`, `after-full-720.png`, with `before-after.png` side by
    side;
  - crops are `after-{1440,720}-panel-{tl,tr,ladder,corner}.png`,
    `after-{1440,720}-label.png` and `help-{1440,720}-panel-help.png`;
  - the mocks are `mocks.png` and `mock-holo-frame.png`.
- **compare-screenshots:**
  - Before vs after: the scene is pixel-identical outside the HUD, and after reads as a
    game HUD.
  - Against the mock the build is faithful, with two deliberate gaps:
    - Labels stay in sentence case, bolder, because uppercase overflows the renderer's
      220 px label box.
    - The chip values are 18 px, not the mock's 20, to keep the chips compact.
  - Fixed from the review:
    - At 1280×720 the ladder ran under the Analogy/Precise toggle. The tabs, rungs and
      corner were tightened.
    - The chips were too tall.
    - The control panel was too wide.
    - The label weight was too light.
- **screenshot-critique (last, unprimed):** it found no clipping and a consistent
  language.
  - Fixed: the corner row now centres on the ladder.
  - Not HUD-style, so out of scope:
    - label and scene-tag placement over the bars and the `upon` card (renderer and 11c);
    - the ragged bar-word baselines (scene text).
  - Kept: the faint ladder numbers, because unwritten chapters are disabled; and the
    uneven line counts in the chip labels (the values still align).
- **Decisions the slice left open:**
  - The HUD accent is a new cyan `hud.accent`, not the palette's `active`, so the HUD
    restyle cannot change the scene.
  - Body copy stays in Inter. Caps and the display face are only for headings, controls,
    chips and labels, for legibility.
  - The help panel's plate is opaque, so the scene never shows through reading matter.
  - The brand mark is not redrawn (brand art is slice 36's).
- **Arrival hook for 11c:** `useArrivalIntro(root, arrival, motion)` replays on each new
  `arrival`. Today `Hud` passes `state.loopEpoch`. When the 11c move lands, it can pass the
  moment the move starts instead (for example a counter `stage.ts` bumps), so the panels
  scan in with the camera.
- **Follow-up:** restyle the slice 12 fallback page to match once it lands.
- **Human checkpoint:** the direction was picked by the human (holo). Before/after:
  `before-after.png`.
