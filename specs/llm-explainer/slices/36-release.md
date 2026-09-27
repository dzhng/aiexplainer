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

- **Full-ladder run:** `verify.ts --ladder` visits every chapter via `/#N` and via `/c/N/`. It asserts zero console errors or warnings, the hardware adapter, and the registry back at baseline after the round trip.
- **Performance:**
  - p95 frame ≤ 16.7 ms and GPU ≤ 8 ms on the busiest chapter (record which one);
  - controls respond within 100 ms while `full` inference runs.
- **Bytes:** total models plus media ≤ 80 MB, with each chapter loading only its own. Record the per-chapter first-load bytes.
- **Fallback:** Playwright WebKit with WebGPU off, and a 390×844 viewport, both play the right chapter video for `/#N`.
- **Share cards:** `bun run sheet --variable og` makes a contact sheet of all 16 OG images.
  - Judge consistency of framing and brand, and that the title is legible at 600 px wide.
  - Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) across the cards for outliers.
  - Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Help panel:** the source list is complete (README copy rules), and the TinyStories credit is present.
- **Human checkpoint (non-blocking for the build, blocking for posting):** the human picks the domain (O5) and decides when to post. Use preview-shots on the card sheet.

## Resolves

**O5**, once the human picks a domain. Record it here and in the Vercel project settings.

## Delegated

Encoding settings within budget, and the poster frame times (`ogTimeSec`).

## Stays green

Everything.

## Feedback that would change this slice

Launch copy or card tweaks. These are data-only changes.
