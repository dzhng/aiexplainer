# Working in this repo

Read [`README.md`](README.md) first: what the explainer is, how the repo fits together, and how to build and check it. Active plans live with their specs, and each one says what to do next. If a folder you're working in has a readme, read it before continuing. The readmes are written for you.

These are the principles. Commands, flags and paths live with the code that owns them: the readmes, the manifests, and each tool's own usage text.

## Talking to the user

The user is very technical but doesn't read the code day to day. Pointing at code is fine; introduce a variable, function or module briefly the first time you mention it.

Lead with contracts. When work touches an interface between components (the frame the renderer is handed, a model's exported format, a chapter's data, a module boundary), say what the contract looks like and how it changed before anything else.

Answer routine questions from the evidence. Ask the user only when the answer changes a decision that matters and can't be settled any other way.

## Proving a change

Optimize for iteration speed. The measure is the time to feedback you can trust, not the amount of process you ran.

Run the narrowest check that answers your question: one test, then one file, then one package. That is the proof for everyday work, including a commit, a merge and a push.

**The full gates are for milestones only.** Running everything is slow and saturates the machine, so it happens at a milestone the plan names in advance (a spec's stated checkpoint, a release) and once when a spec is closed. It is not a step before each commit, merge or push, and never a feedback loop. An agent working on one piece of a plan does not run it; whoever integrates the plan does, at the milestone.

A big change (a full spec, a major feature) ends by running the closeout gate its spec names, once, before the work is called done.

Between milestones, a change is checked by what it can move: its own tests and the output it touches. A failure found later at a milestone is fixed then; that is cheaper than gating every step.

Every expensive run must answer a question a cheaper one can't. Training a model and shooting the site in a real browser on a real GPU are the expensive runs here; do only the ones a change can move. Reuse a result that is still valid, and rerun only what a change could have invalidated. Docs and data that no code reads need no run at all.

Write the test first. Before changing behaviour or fixing a bug, invoke [`write-tests`](.agents/skills/write-tests/SKILL.md) and follow its red/green workflow. Test what the product does and how it fails, not how the code is shaped.

A change that shouldn't alter behaviour (a refactor, a performance change) must leave the output unchanged, or be a named decision.

Never loosen a requirement to make a check pass. A narrow pass proves a narrow claim: say what you verified, what you assumed and what is unfinished.

Don't wait on a long run. Start it in the background and keep working. Give it a visible sign of progress and a point where you stop, and never repeat a failure unchanged.

## What the reader sees

Look at the picture. A passing check is not evidence that a chapter reads well or teaches anything.

For any visual change:

- get an unprimed second opinion with [`screenshot-critique`](.agents/skills/screenshot-critique/SKILL.md);
- judge before against after, and our shots against references, with [`compare-screenshots`](.agents/skills/compare-screenshots/SKILL.md);
- show the user with [`preview-shots`](.agents/skills/preview-shots/SKILL.md).

Before GPU work, load [`renderer`](.agents/skills/renderer/SKILL.md).

## What the explainer promises

Everything shown is real. Each part is a machine backed by a real model trained for its chapter.

Every asset can be rebuilt from code.

The renderer draws the frame it is handed and never reads the app's state.

## One owner per concept

A concept has exactly one home, and a second copy is a bug. Find the owner before writing a helper, and use what the repo already chose before writing your own.

Prefer one general rule to a special case, and a simple structure to an abstraction nobody needs yet. This is greenfield: when something replaces an old mechanism, cut over and delete the old one, with no compatibility shim. When a change exposes a duplicate or a stale owner, invoke [`refactor-clean`](.agents/skills/refactor-clean/SKILL.md).

## Parallel work stays cheap

Every parallel checkout is a full copy, and model files, installed dependencies and build output multiply with each one.

- Fetch only the large files your task needs.
- Share what doesn't change between checkouts. Don't make another copy.
- Never share build output between checkouts whose sources differ. They overwrite each other's builds, and the symptom is an error from someone else's change.
- Remove a checkout and its build output when its branch is merged.

## Skills

Skills hold the procedures behind these principles. Load the one that covers your work before you start. Keep them current: when a pass learns a lesson (a gotcha, a pattern that paid off, a rejected approach), add it to the owning skill in the same commit, following [`write-skills`](.agents/skills/write-skills/SKILL.md).

Before changing this file, invoke [`audit-agents`](.agents/skills/audit-agents/SKILL.md).
