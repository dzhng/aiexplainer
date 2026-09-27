# 03 — Chapter contract, timeline and look tokens

**Milestone:** M1 · **Depends on:** 01 · **Visual:** none

## Contract

A chapter is pure data that is validated at load time. From this point on, the
HUD, the loop, the stats and the scene are driven by a `ChapterDef`, never by
code written for one chapter. Look tokens have a single source of truth.

## Seam

- **`apps/explainer/src/chapters/types.ts`:**
  ```ts
  interface ChapterDef {
    slug: ChapterSlug;
    title: string;
    why: string; // why names the previous chapter's failure (D12)
    model: ModelId | null;
    scene: SceneBuilderId;
    caption: { default: Caption; byFollow: Partial<Record<FollowId, Caption>> };
    stats: [StatChip, StatChip, StatChip];
    follow: FollowTarget[]; // ≤3 (+ implicit "All"), keys 1–4
    slider: SliderDef;
    scenarios: ScenarioDef[];
    views: ViewMode[];
    labels: LabelDef[];
    loop: Timeline;
    shot: ShotId;
    help: { sources: SourceRef[] };
    ogTimeSec: number;
  }
  interface Caption {
    story: [string, string];
    precisely: string;
  }
  interface StatChip {
    id: string;
    label: string;
    format: "int" | "bytes" | "tok/s" | "pct" | "x";
    scale: "this tiny model" | "Llama-3-8B" | "Llama-3-8B on H100 SXM" | "TinyStories";
    value:
      | { kind: "model"; metric: string }
      | { kind: "arith"; fn: string; args: Record<string, number> }
      | { kind: "probe"; probe: string };
  }
  interface LabelDef {
    anchor: AnchorId;
    analogy: string;
    precise: string;
  } // D16 toggle
  interface ScenarioDef {
    id: string;
    label: string;
    prompt: string;
    probe: string;
  } // prompt must cite a passing probe (O2)
  interface Timeline {
    durationSec: number;
    channels: Record<ChannelId, Keyframe[]>;
    beats: Beat[];
  }
  ```
- **`apps/explainer/src/chapters/validate.ts`:** `validateChapter(def)` rejects any of the following:
  - a loop outside 20–30 s;
  - a story sentence over 25 words, or a missing `precisely`;
  - more than 3 follow targets;
  - an unknown anchor, shot or colour token;
  - a stat with no `scale`;
  - more than 5 labels (D18: key parts only).
- **`apps/explainer/src/chapters/timeline.ts`:** `evalTimeline(tl, t, out)`. It wraps at `durationSec`, supports the eases `linear`, `inOut` and `step`, and allocates nothing.
- **`apps/explainer/src/chapters/ladder.ts`:** the ordered slug list. The display number is the index in this list (D31).
- **`apps/explainer/src/chapters/data/autocomplete.ts`:** chapter 0's data. The copy is a draft; slice 11 finalises the loop.
- **`apps/explainer/src/look/look.json`:** Night-lab tokens seeded from `explore/directions.html`:
  - background `#0b1020 → #1a1f3a`;
  - floor `#161b30`;
  - metal `#3a4370` / `#26304f`;
  - flow violet `#b58cff`;
  - focus amber `#ffb86b`;
  - sealed `#3a3f58`;
  - ink `#e8ecff`;
  - active `#6ea8ff`;
  - HUD background `rgba(20,24,44,.72)`.

  `look.ts` provides `cssVars()` and `linear(token)` (sRGB → linear HDR), plus HDR emissive multipliers, bloom knobs, flow rhythm and the type scale.

- **`apps/explainer/src/look/shots.json`:** named camera presets. It starts empty, and slice 10 adds `bench-close`.

## Playable

`bun apps/explainer/scripts/timeline.ts autocomplete` prints the channel values and beats at 1-second steps.

## Verify

- Loop wrap is continuous: t=0 and t=duration give the same values.
- Step easing holds its value until the keyframe.
- `validateChapter` rejects fixtures for a 35-second loop, a 3-sentence caption, a missing `scale`, and an unknown anchor.
- Every chapter file in `data/` validates. A test iterates over the ladder.
- The sRGB → linear conversion is right on the token swatches.

## Delegated

The file layout under `chapters/`, the zod-vs-hand-written validator, and draft copy wording within the copy rules.

## Stays green

01, 02.

## Feedback that would change this slice

Changes to the caption budget or the label cap. Those are D17, D18 and D24 matters and would go back to the human.
