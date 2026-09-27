# Choices ledger

Decisions made during implementation where the spec was silent, with a verdict.
Per [audit-choices](../../.agents/skills/audit-choices/SKILL.md): each entry is
standalone. Entries are appended per pass and consolidated when the spec closes.

## Slice 01

- **The harness serves the Vite dev server, not a production build.** Why: seconds to
  start versus a full build per run; slice 12 adds `--base <url>` runs against the
  deployed preview, which covers the built output. Verdict: sound, reversible.
- **The dev server binds to 127.0.0.1 on a random free port.** Why: port 5199 was
  already taken by another local project and silently served its page. Loopback
  still counts as a secure context, so WebGPU is exposed. Verdict: sound.
- **`/lab/*` routes come from one `lab/index.html` entry via a small Vite
  middleware, and the lab entry is left out of builds when
  `VERCEL_ENV=production`.** Why: D40 wants lab pages on previews only. Vercel
  rewrites for `/lab/*` land with the deploy in slice 12. Verdict: sound.
- **Both HTML entries carry an empty data-URI favicon.** Why: the browser's
  automatic `/favicon.ico` request produced a 404 console error, which the
  harness (correctly) treats as a failure. Slice 04 can replace it with a real
  icon. Verdict: sound.
- **`packages/llm` passes with no tests until slice 02 adds some (`bun test
--pass-with-no-tests`).** Verdict: sound; remove the flag once tests exist.
- **Python pins: torch 2.14.0, tokenizers 0.23.2, numpy 2.5.3, pytest 9.1.1,
  jsonschema 4.26.0 (latest stable on 2026-09-27).** `bun run verify` now also
  runs `training:test`, whose smoke test fails if Apple's MPS backend is
  unavailable. Verdict: sound, but it makes `verify` Mac-only; revisit if CI is added.

## Slice 03

- **Chapter validation is hand-written, not zod.** Chapter files are TypeScript, so the
  compiler checks shapes; `validateChapter` only checks what types cannot (loop length,
  caption budget, unknown anchors/shots/tokens, stat scales) and returns a problem list.
  Verdict: sound.
- **Each scene declares its anchor ids in `chapters/scenes.ts`, so the validator can check
  anchors before any builder exists.** Verdict: provisional; slice 10 may move the list next
  to the builder so one module owns it.
- **Timelines are cyclic: after the last keyframe the value blends back to the first.**
  Why: the D24 loop must have an invisible seam. Verdict: sound.
- **`shots.json` is seeded with a provisional `bench-close` pose, not left empty.** Why: the
  validator rejects unknown shots, so chapter 0 needs one; the spec said "starts empty".
  Slice 10 owns the real values. Verdict: sound (spec wording was wrong).
- **`look.json` has sections palette (sRGB hex), hud, type, materials.emissive (HDR
  multipliers), bloom (seeded from LearnOpenGL), flow, and empty room/lights for slice 07.**
  `lookConfig()` hands the renderer linear colours with emissive applied. Verdict: sound.
- **`ModelId` is a local union until slice 02 merges, then comes from `@repo/llm`.**
  Verdict: short-lived; the integrator removes it.

## Slice 18

- **Every speed is a roofline ceiling: a step costs max(bytes ÷ bandwidth, FLOPs ÷ dense
  FLOP/s).** FLOPs per token = 2 × matmul params + attention (4 × layers × heads × headDim
  × context). Verdict: sound; matches kipply's inference arithmetic.
- **Two decode numbers: per sequence (`decodeCeilingTokPerSec`) and whole batch
  (`batchThroughput`), both with optional precision `{weightBytes, kvBytes}`.** Why:
  chapter 12 sweeps precision. Verdict: sound.
- **Units are branded types (`Bytes`, `Seconds`, `TokensPerSec`), with compile-time tests
  that they cannot mix.** Verdict: sound.
- **The MoE counterfactual is a named assumption, `llamaAsMoe()`:** attention and
  embeddings shared, each expert a full copy of the MLPs, labelled hypothetical.
  Verdict: sound; chapter 14 copy must say "if Llama were an MoE".
- **Numbers show 3 significant figures with decimal SI bytes ("131 kB", "16.1 GB").** Why:
  it matches the H100 spec sheet's "80 GB"; precise copy can still say 128 KiB.
  Verdict: sound, reversible.
- **A stat-chip format `"s"` (seconds) was added so prefill time can appear on a chip.**
  Verdict: sound.
- **The scale-label prominence shot moved to slice 04,** because the HUD chip doesn't exist
  until then. Verdict: sound.
