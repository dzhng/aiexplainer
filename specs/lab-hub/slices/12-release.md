# 12 — Release

**Visual variable:** whole-frame integration

## Contract

Everything ships: cards re-shot, share routes per P7 (`/c/0/`–`/c/8/`, `/c/b1/`–`/c/b5/`, old numbers → `/` with a lab card), full verification, deploy to production.

## Seam

- `scripts/cards.ts` gains the lab card; `scripts/share.ts` writes the `/c/15/` redirect.
- Update the archived spec's pointers (D4, D12, D21, D22, D31, D42 superseded by this spec) when closing this one.

## Playable

The preview deployment.

## Verify

- `bun run verify`; harness PASS with zero warnings on `/`, `/#0`–`/#8`, `/#b1`–`/#b5`, `?force=unsupported`; `share.ts --check`.
- **Shots:** the hub (first and returning visit), mid-flight, a machine in each phase, the tour. Whole-frame integration.
- Push `llm-explainer`, merge to `main`, verify production.
- Run [compare-screenshots](../../../.agents/skills/compare-screenshots/SKILL.md) against the named prior shot before accepting. Target: the accepted shots from slices 03–11.
- Run [screenshot-critique](../../../.agents/skills/screenshot-critique/SKILL.md) as the **last** check on every shot, unprimed.
- **Human checkpoint (non-blocking):** open the shots with preview-shots, wait about 5 minutes, decide on the evidence if silent, record the call in [choices.md](../choices.md), close the shots, continue.
- Stays green: `bun run verify`, every earlier slice's gates, zero console or WebGPU warnings.

## Delegated

None.

## Feedback that would change this slice

Anything the human sees on the preview.
