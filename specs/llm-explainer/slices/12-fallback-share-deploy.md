# 12 — Support gate, fallback video, share routes and Vercel preview

**Milestone:** M1 (closes D14) · **Depends on:** 11 · **Visual variable:** the fallback page on a phone

## Contract

Every visitor gets a good first impression:

- Desktop with WebGPU → the app.
- A phone or no WebGPU → a video of the real app, plus a way to open it on desktop (D20, D29).
- Each chapter has a share URL with its own link-preview image (D34).

The app is deployed as a Vercel preview.

## Seam

- **`apps/explainer/src/runtime/support.ts`:** `detectSupport(): 'webgpu' | 'no-webgpu' | 'small-screen'`.
  - `small-screen` means viewport width < 900 px or `pointer: coarse` without a fine pointer.
  - `no-webgpu` means there is no `navigator.gpu`, or `requestAdapter()` returns null.
  - `?force=fallback` forces the fallback.
- **`apps/explainer/src/fallback/`:** the fallback page. It shows the brand and title, an autoplaying muted looping `<video>` of the current chapter (poster first), one line ("Best on a desktop browser"), a "Copy link" button, and "Follow on X". It uses the same tokens as the HUD.
- **`apps/explainer/scripts/record.ts`:**
  - Drives the harness with `stepClock(30)` through each finished chapter's loop.
  - Encodes MP4 (H.264, ≤ 1280×720, target ≤ 3 MB per chapter) with **ffmpeg** (D41).
  - Writes `public/media/<slug>.mp4` and `<slug>.jpg`.
- **`apps/explainer/scripts/share.ts`:** a post-build step that writes `dist/c/<display>/index.html` with:
  - `og:title` and `og:description` (the chapter title and why-line);
  - `og:image` (a 1200×630 frame at `ogTimeSec`, rendered by the harness);
  - `twitter:card=summary_large_image`;
  - a meta-refresh or JS redirect to `/#<display>`.
- **Vercel:** Root Directory `apps/explainer`, build command `turbo build`, output `dist`. Bun is detected from `bun.lock`. Preview deploys are on for every branch.
- **Help panel:** add the "watch the video" link.

## Playable

- The Vercel preview URL on desktop Chrome shows the app.
- The same URL on a phone, or with `?force=fallback`, shows the fallback page.
- `/c/0/` in a link-preview debugger shows the chapter-0 card.

## Verify

- **Playwright WebKit** with WebGPU disabled shows the fallback. A 390×844 viewport shows the fallback.
- **bun test:** `detectSupport` on stubbed navigators.
- **Recorder:** the video duration equals the loop duration ± 1 frame. Two recordings of the same chapter are byte-identical, or at least identical frame by frame, because the clock is held and the seed fixed.
- **Share pages:** each built `c/N/index.html` has absolute `og:image` URLs and redirects correctly. Test it by loading the page in Playwright with JS off (meta refresh) and with JS on.
- **Shot:** the fallback page at 390×844.
  - **Variable:** the fallback's visual hierarchy (video first, one clear call to action).
  - **Out of scope:** the video content.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the last check.
- **Deploy:** the preview URL passes `verify.ts --route /#0` when pointed at it, with `--base <url>`.

## Resolves

- **D14 is complete.**
- **O5** stays OPEN (preview URLs suffice) until slice 36.

## Delegated

The `small-screen` threshold (±100 px), video encoding settings within the budget, and the redirect mechanism.

## Stays green

01–11.

## Feedback that would change this slice

The human wanting 3D on phones. That would overturn D20.
