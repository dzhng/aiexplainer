# 12 — Support gate, fallback video, share routes and Vercel preview

**Milestone:** M1 (closes D14) · **Depends on:** 11b · **Visual variable:** the fallback page on a phone

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

## Result (measured 2026-09-27)

**Re-running the media is one command.** `bun run --cwd apps/explainer media` records
every written chapter; `media <slug>` records one; `--repeat` records twice and compares
the two frame by frame. Run it again after slice 11b changes the look.

**Support gate.**

- `small-screen` is width < 900 px, or a coarse pointer with no fine pointer anywhere.
- `no-webgpu` means no adapter, or a software-fallback adapter.
- `?force=fallback` forces the fallback.
- `main.tsx` picks the app or the fallback from the adapter probe the app already runs,
  and the probe reports the choice as `support`.

**Fallback page.** It shows, in order: the brand and title, the video (poster first), the
why-line, one line saying why this is a video, **Copy link** (the one filled button;
it copies `/c/N/`), then **Follow on X**. Its only line differs by reason:

- `small-screen`: "Best on a desktop browser: send yourself the link."
- `no-webgpu`: "The 3D machine needs WebGPU: try desktop Chrome or Edge."

**Recorder.**

- Loads the page with `?clock=step&fps=30`; each probe `step()` advances exactly one frame.
- Captures at 1920×1080 with the HUD hidden. The HUD stays laid out, so the camera and
  label placement are exactly the app's.
- Crops each frame to the largest 16:9 box in the app's `safe` rect, then scales it to 1280×720.
  - The first recording kept the full app, HUD included. At phone width the HUD
    repeated the page's title as unreadable text (unprimed critique), so the video is
    now the scene only.
- Encodes H.264 at the best CRF that fits 3 MB.

Chapter 0 measurements:

- 600 frames, 20.000 s (the loop is 20 s), CRF 18, 547,689 bytes after the 11b/11c room and 04b HUD merged (the arrival move is skipped under a driven clock).
- A repeat recording differs in **0 of 600 frames**.
- Re-encoding gives a byte-identical MP4 and poster.

**Link-preview card.**

- 1200×630, the whole app with the HUD, at `ogTimeSec`. It is shot once two consecutive
  frames agree.
- Two separate loads of the card differ slightly (PSNR 44 dB), so the card is not
  byte-reproducible; the video is.
- The media is committed in `apps/explainer/public/media/`: the video, the poster (the
  first frame) and the card.

**Share pages.**

- `scripts/share.ts` runs after `vite build` and writes `dist/c/<N>/index.html`. Each page
  has absolute `og:*` and `twitter:*` tags, a meta refresh and `location.replace` to `/#N`.
- The origin is `SITE_URL`, else `https://$VERCEL_URL`, else `vite preview`.
- `bun scripts/share.ts --check [--base]` confirms each page lands on `/#N` with JS off
  and with JS on. It passed locally and on the preview.

**Harness.**

- `scripts/harness.ts` is shared by verify, record and share.
- New flags: `--browser webkit`, `--no-webgpu`, and `--expect fallback`.
- `VERCEL_AUTOMATION_BYPASS_SECRET` opens a protected preview through Vercel's automation
  bypass header.
- Playwright's WebKit build here **has** WebGPU, so the "WebKit with WebGPU disabled" check
  removes `navigator.gpu` before any page script runs.
- Passing checks:
  - WebKit with `--no-webgpu` gets `no-webgpu`;
  - Chrome at 390×844 gets `small-screen`;
  - `?force=fallback` gets the fallback;
  - `/#0` gets the app.

**Vercel.**

- Project `aiexplainer` (team david-zhangs-projects-6456877a):
  - Root Directory `apps/explainer`;
  - framework Vite;
  - build `turbo build`, output `dist`;
  - `vercel.json` rewrites `/lab/*` to the lab entry (the lab is left out of production
    builds);
  - `turbo.json` passes `SITE_URL`, `VERCEL_ENV` and `VERCEL_URL` to the build.
- Deployment protection is **on**: Vercel Authentication, `all_except_custom_domains`. An
  unauthenticated request to the preview gets a 302 to the login page.
- An automation bypass secret was created for the harness. Protection was not changed.
- Preview: `https://aiexplainer-2nc9cjngv-david-zhangs-projects-6456877a.vercel.app`.
  It passes:
  - `verify.ts --route /#0 --base <preview>` (hardware Metal, no console errors);
  - the 390×844 fallback;
  - `/lab/models`;
  - the share check.
- The first `vercel deploy` (no flags) on the new, git-less project went to the
  **production** target. It was removed within minutes, and deploys now pass
  `--target=preview`. O5 stays open; no domain was set.

**Shots** (`throwaway/shots/12/`): `fallback-390.png`, `fallback-desktop.png`,
`fallback-webkit.png` and `preview-0.png`. The unprimed critique ran twice. Fixed from it:

- the duplicated header in the video;
- a weak and centred device line;
- the button widths.

After slice 04b merged, the page was restyled on the HUD's own classes and tokens (series,
title, number badge, accent fill, cut corners). "Follow on X" became a quiet text link, and
the desktop column widened to 960 px so the video leads. A third critique ran last.

Accepted: the chapter-number badge (the HUD's convention), and space below the buttons on
tall phones.

## Stays green

01–11.

## Feedback that would change this slice

The human wanting 3D on phones. That would overturn D20.
