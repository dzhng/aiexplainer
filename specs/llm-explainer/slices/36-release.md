# 36 — Release candidate

**Milestone:** M5 · **Depends on:** 35 · **Visual variable:** consistency across all 16 share cards and fallback posters

## Contract

The whole ladder is deployable and shareable:

- every chapter has a current fallback video, poster, link-preview card and share route;
- performance and registry gates hold across the full ladder;
- the public domain is chosen.

The public post itself is the human's call.

## Seam

No new modules. This slice reruns `record.ts` and `share.ts` (slice 12) for all 16 chapters, and runs the full verification suite.

## Verify

- **Full-ladder run:** `verify.ts --route '/#N'` for every N, and `share.ts --check` for every `/c/N/`. Each asserts zero console errors or warnings and the hardware adapter. Also run `/lab/registry` through the harness; the registry must return to baseline.
- **Performance:**
  - p95 frame ≤ 16.7 ms and GPU ≤ 8 ms on the busiest chapter (record which one);
  - controls respond within 100 ms while `full` inference runs.
- **Bytes:** total models plus media ≤ 80 MB, with each chapter loading only its own. Record the per-chapter first-load bytes.
- **Fallback:** Playwright WebKit with WebGPU off, and a 390×844 viewport, both play the right chapter video for `/#N`.
- **Share cards:** a contact sheet of all 16 link-preview cards (`public/media/*` card images, tiled; add an `og` mode to `sheet.ts` or tile them with ffmpeg).
  - Judge consistency of framing and brand, and that the title is legible at 600 px wide.
  - Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) across the cards for outliers.
  - Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Help panel:** the source list is complete (README copy rules), and the TinyStories credit is present.
- **Human checkpoint (non-blocking for the build, blocking for posting):** the human picks the domain (O5) and decides when to post. Use preview-shots on the card sheet.

## Carried in from the review and polish passes

- Chapter 3's "How well each word lines up" label is placed nondeterministically between runs
  (3,102 px differ on an unchanged build). Make placement deterministic, or record why not.
- Chapter 10's scene note sits under the controls panel; a lavender input bar floats beside
  chapter 8's left HUD; chapter 3's punctuation words are tiny.
- `drafter-96` lost O3 but still ships and counts against the byte budget. Drop it (ModelId,
  public/models, probes), or record why it stays.
- Re-record every chapter's media first (`bun run --cwd apps/explainer media`), since the look
  changed after most chapters were recorded.

## Resolves

**O5**, once the human picks a domain. Record it here and in the Vercel project settings.

## Delegated

Encoding settings within budget, and the poster frame times (`ogTimeSec`).

## Stays green

Everything.

## Feedback that would change this slice

Launch copy or card tweaks. These are data-only changes.

## Record (2026-09-28)

### Carry-ins

- **Chapter 3 label placement** was already deterministic (same `placeLabels` coordinates every
  run); what varied was the text raster. Labels and scene tags sit on composited layers
  (`will-change: transform`) that keep the raster of the first position, so a fractional
  `translate` drew the glyphs at a phase that depended on where the label arrived from. Both
  now translate to whole pixels. Chapter 3's card at 1200×630: 1 of 4 shots differed before,
  0 of 6 after. `--check label-dots` still holds (DOM error ≤ 0.95 px).
- **Chapter 3's punctuation** is written by name (period, comma, exclamation, question mark,
  quote, apostrophe, colon, semicolon, dash) on the bars, the die faces and the scene notes,
  and the help note says so. A lone quoted mark had almost no ink at word size.
- **Chapter 10's memory note** ("notes: 13 words × 2.05 kB = 26.6 kB") moved from the rack's top
  edge, where the controls panel covered it for the whole loop, to just under the rack.
- **Chapter 8's lavender bar** was the first belt, 2.3 units long, reaching behind the left HUD.
  The first and last belts now end 1 unit past the blocks (`BELT.end`).
- **drafter-96** is dropped: ModelId, the schema, `public/models/drafter-96` (1.0 MB) and its
  training config. Its measured α (0.638, held out 0.643; speedup 1.03× at cost ratio 0.353)
  stays in slices 17 and 33 beside drafter-64's (0.595 / 0.601; 1.23× / 1.24×).
- **Found on the card sheet:** at 1200 px wide chapter 8's controls panel (two long scenarios)
  covered "ONE ASSEMBLY LINE". `.tr` is now capped at the space right of the title column and
  scenario chips shorten with an ellipsis; nothing changes at 1440 px and up, so the videos'
  safe rect is unchanged. `record.ts --cards` re-shoots only the cards.
- **Found by the first unprimed critique:** below 1400 px the centred chapter ladder ran under
  the bottom-right corner (11 of 16 cards lost chapters 13–15 or read "THE FINISHED MACH"), and
  long names wrapped to two lines. There it now starts at the left edge, stops short of the
  corner, and the current name shortens with an ellipsis.
- **Found by the second:** at 1200 px the panels crowd every scene (captions under the left
  column in 7 and 12, scene text through the controls panel in 4 and 9, word tiles hidden on
  overlap in 9, 10 and 13). Cards are now laid out at 1440×756, the desktop layout the scenes
  are framed for, and scaled to 1200×630 (text ×0.83; titles stay legible at 600 px). The app
  itself at 1200 px wide keeps those crowding issues: a follow-up, not a release blocker.

### Media (re-recorded after merging the correctness-review fixes)

| Chapter         | Frames | CRF | Video bytes |
| --------------- | ------ | --- | ----------- |
| 0 autocomplete  | 600    | 18  | 533,588     |
| 1 tokenizer     | 720    | 18  | 553,136     |
| 2 embeddings    | 720    | 18  | 799,793     |
| 3 sampling      | 780    | 18  | 1,111,077   |
| 4 attention     | 900    | 18  | 2,317,918   |
| 5 positions     | 720    | 18  | 968,946     |
| 6 mlp           | 660    | 18  | 584,785     |
| 7 residual      | 600    | 18  | 505,533     |
| 8 stack         | 690    | 24  | 2,319,464   |
| 9 generation    | 720    | 18  | 871,618     |
| 10 kv-cache     | 780    | 18  | 770,701     |
| 11 batching     | 720    | 18  | 571,283     |
| 12 quantization | 720    | 18  | 356,561     |
| 13 speculative  | 720    | 18  | 372,118     |
| 14 experts      | 720    | 18  | 495,247     |
| 15 finished     | 888    | 27  | 2,532,540   |

Videos 15.66 MB, cards 2.38 MB (131–196 kB each), posters the rest: media 19.23 MB.

### Gates

- **Full ladder:** `verify.ts --route '/#N'` passes for N = 0…15 on the hardware adapter
  (apple metal-3) with zero console warnings. `/lab/registry` returns to baseline (11 buffers,
  26.6 MB before and after). `share.ts --check` passes for all 16 `/c/N/` pages, JS off and on.
- **Performance:** busiest chapter is 15 (the finished machine). `/lab/perf?scene=finished` at
  t = 5, 15, 25: 2.5, 3.6, 2.9 ms GPU with bloom (≤ 8 ms). App frame interval on the build at
  1440×900: p50 16.7 ms, p95 16.8 ms (one 60 Hz vsync; `performance.now` is rounded to 0.1 ms),
  p99 33.4 ms on chapter 15; chapters 8 and 14 p99 16.8 ms. Controls respond in 20–32 ms
  (chapter 9, `full` generating from typed text) and 30–37 ms (chapter 15): click to the
  pressed state painted, ≤ 100 ms.
- **Bytes:** models 22.00 MB + media 19.23 MB = 41.2 MB (≤ 80 MB). First load per chapter on
  the build (Chrome, cache off; code 427 kB and room assets 1.84 MB each, 2.0–2.3 MB on 0, 11, 15):

  | N        | Models loaded              | First-load bytes |
  | -------- | -------------------------- | ---------------- |
  | 0        | counts                     | 4.27 MB          |
  | 1        | tokenizer                  | 2.29 MB          |
  | 2, 3     | embed, tokenizer           | 3.34 MB          |
  | 4        | attn, tokenizer            | 3.94 MB          |
  | 5        | rope, tokenizer            | 3.94 MB          |
  | 6        | mlp, tokenizer             | 4.16 MB          |
  | 7        | residual, tokenizer        | 4.26 MB          |
  | 8, 9, 10 | full, tokenizer            | 5.31 MB          |
  | 11       | none (arithmetic only)     | 2.54 MB          |
  | 12       | full-q8, tokenizer         | 3.90 MB          |
  | 13       | drafter-64, tokenizer      | 2.94 MB          |
  | 14       | moe, tokenizer             | 6.89 MB          |
  | 15       | all eleven (every station) | 22.89 MB         |

  Each chapter loads only its own model; chapter 15 loads every station's by design.

- **Fallback:** Playwright WebKit with `navigator.gpu` removed (1440×900) and Chrome at
  390×844 both play `/media/<slug>.mp4` for `/#N`, N = 0…15 (32 of 32: right source, playing,
  no console warnings).
- **Share cards:** `sheet --variable og` → `throwaway/shots/sheet/og.png`. Scene metrics show
  no empty or flat card (colour entropy 4.9–5.7 bits, edge density 0.27–0.40); chapters 12, 13,
  14 and 15 are the darkest and flattest (mean luminance 41–52, contrast 94–107 against
  115–164); none is empty or flat.
  - The last unprimed critique (on the final sheet) finds the series consistent and every title
    legible at 600 px. Everything below the title (stats, narration, labels) is 5–7 px there,
    unreadable in a feed but inherent to a whole-app card. Left open, for the human's card
    call (data-only: `ogTimeSec`, labels) or a follow-up:
    - attention: a "16…" caption and the rod above "but" run under the controls panel;
    - kv-cache: the rack's top row sits under the controls panel at the card's 756 px height;
    - generation and kv-cache: the tile between "boy" and "Tim" hides its word on overlap;
    - quantization: the two captions touch ("…8 bits" runs into "one weight…");
    - residual: captions sit on the stations; finished: an overview with no focal point;
    - narrow stat chips break "LLAMA-3-8B ON H100 SXM" (batching), "LLAMA-3-8B" (finished)
      and "16-BIT" (quantization) across lines; experts' stat row is wider than its column.
- **Help panel:** all seven README sources appear in their chapters' help (Leviathan and Chen
  in 13, RoPE 5, SwiGLU 6, RMSNorm 7, Switch and Mixtral 14, kipp.ly 11), and the panel credits
  TinyStories (CDLA-Sharing-1.0) on every chapter.
- **O5:** closed with no custom domain; production is https://aiexplainer-red.vercel.app with
  `SITE_URL` set on Vercel production.
