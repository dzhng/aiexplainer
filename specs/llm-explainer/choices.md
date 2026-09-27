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
