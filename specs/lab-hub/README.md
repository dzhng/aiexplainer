# Lab hub: one story, told in one lab

Restructure the live explainer (`apps/explainer`, rationale in
[specs/done/llm-explainer](../done/llm-explainer/README.md)) so that **ordinary people stop
seeing AI as a black box**. It is not a technical deep dive. Each machine answers a question
people actually ask about chatbots, the parts are told as a **build-up story** in three
acts, and it all happens in **one physical hall** you walk through. It covers inference
only; training is a separate project.

The site opens on the whole lab: every machine standing in the room, grouped by act, with
the one to do next glowing. Click a machine and the camera flies into it. Inside, the
existing lesson flow runs (brief → Start → lesson → Your turn → Next). Next flies back out
through the lab and into the next machine.

## Next Agent Prompt

**Status (2026-09-28):** spec written, nothing built. The human has approved the story
and the hub structure (decisions below). The draft copy in
[story.md](story.md) is waiting for the human's read in slice 01.

**Next pickup:** [slice 01 — story in data](slices/01-story-data.md).

You are implementing this spec with implement-spec. Work in ladder order unless a slice
says it can run in parallel. Each slice file is a contract. Before any GPU slice, read
[the renderer skill](../../.agents/skills/renderer/SKILL.md). Before any copy, read the
archived spec's copy rules. Use `jg` to find code by behaviour. Record decisions a slice
didn't delegate in [choices.md](choices.md).

Every visual shot ends with an unprimed
[screenshot-critique](../../.agents/skills/screenshot-critique/SKILL.md). When a slice
changes an approved look, run [compare-screenshots](../../.agents/skills/compare-screenshots/SKILL.md)
against the prior shot first. Human checkpoints are non-blocking: open the shots with
preview-shots, wait about 5 minutes, decide on the evidence, record it, and continue.

**Before ending a pass, update this section:** status, date, next pickup, checklist,
blockers.

### Checklist

- [ ] [01 story in data](slices/01-story-data.md) — acts, questions, briefs, hand-offs, myths, all copy re-voiced for a non-technical reader, `/lab/story`
- [ ] [02 intro on the real model](slices/02-intro-real-model.md) — counts model and the residual chapter deleted
- [ ] [03 the lesson column](slices/03-lesson-column.md) — brief + locked note in the column, no greyed controls
- [ ] [04 hall layout](slices/04-hall-layout.md) — placement data + the clearance test (fail-fast gate)
- [ ] [05 one world](slices/05-one-world.md) — every machine at full scale in one scene, focus and idle
- [ ] [06 the hall](slices/06-hall-prop.md) — Blender hall, act zones, intro alcove
- [ ] [07 flights](slices/07-flights.md) — pure camera flight plans
- [ ] [08 place, routes, picking](slices/08-place-routes-picking.md) — the lab is home
- [ ] [09 lab column](slices/09-lab-column.md) — acts list, Continue, breadcrumb; ladder deleted
- [ ] [10 floor signs](slices/10-floor-signs.md) — plaques, act names, ✓, Start here / Next
- [ ] [11 finale](slices/11-finale.md) — main-path tour from the lab, the myth summary; chapter 15 page deleted
- [ ] [12 release](slices/12-release.md) — cards, share routes, deploy

## Decisions (settled with the human, 2026-09-28)

| #   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Why                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | **The story is build-up, told as the questions people ask.** Intro "What is it?"; Act I "Making a guess" (1 How does it read? · 2 How does it know "cat" is like "kitten"? · 3 How does it pick a word?); Act II "Following what you said" (4 How does it follow what I said? · 5 Does word order matter? · 6 Where does its knowledge live? · 7 How does it get good enough?); Act III "Writing an answer" (8 How does it write a whole answer, and does it remember me?). Full copy in [story.md](story.md). | "what is the story?"; then "the goal of this is how to get normal folks to not see ai as a black box. it's not meant to be a technical deep dive". |
| H2  | **The intro only answers "what is an LLM?"** A real tiny LLM (`full`, chapter 8's model) guesses the next word over and over until a sentence grows, then "let's build one". The word-pair counts model and the "onse" failure are deleted.                                                                                                                                                                                                                                                                    | "intro is a basic 'what is an llm', which is that it predicts the next word, I think it should just end at that"                                   |
| H3  | **Every chapter hands off with a "but".** Its last beat is the next chapter's problem, and its brief reads "So far / Still missing / This lesson".                                                                                                                                                                                                                                                                                                                                                             | Cohesion: each part exists because the last one couldn't do something.                                                                             |
| H4  | **No running score.** ✓ marks only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | "na too confusing"                                                                                                                                 |
| H5  | **The site opens in a lab hub:** every machine in one hall, act zones, floor labels, the next one glowing, ✓ on finished ones; orbit and click any machine.                                                                                                                                                                                                                                                                                                                                                    | The human's proposal.                                                                                                                              |
| H6  | **The intro has its own section** of the hall, so it reads as a different thing.                                                                                                                                                                                                                                                                                                                                                                                                                               | "doesn't need to be center but maybe intro can be in a separate section"                                                                           |
| H7  | **Clicking flies the camera into the machine; the lab and the lessons are one space.**                                                                                                                                                                                                                                                                                                                                                                                                                         | The human's proposal.                                                                                                                              |
| H8  | **Next flies visibly out to the lab and into the next machine.** "Back to the lab" is always there.                                                                                                                                                                                                                                                                                                                                                                                                            | "yes let's try through the lab, just make sure it animates out"                                                                                    |
| H9  | **The finale is the lab.** Chapter 15 as a page goes; once all are ✓, the lab offers "Tour the whole machine".                                                                                                                                                                                                                                                                                                                                                                                                 | Planning proposal, accepted.                                                                                                                       |
| H10 | **The bottom ladder goes.** Inside a machine: a breadcrumb and Back.                                                                                                                                                                                                                                                                                                                                                                                                                                           | The lab is the map.                                                                                                                                |
| H11 | **Before and during a lesson the left column shows the brief and a locked note, not greyed controls.** Controls appear on Your turn.                                                                                                                                                                                                                                                                                                                                                                           | Bug report: controls looked usable before Start.                                                                                                   |
| H12 | **The room grows into a hall** with three act zones and an intro section, same style.                                                                                                                                                                                                                                                                                                                                                                                                                          | "ok"                                                                                                                                               |
| H13 | **No backward compatibility or migrations.** Hard cutover. The completion key stays; unknown slugs are already ignored.                                                                                                                                                                                                                                                                                                                                                                                        | Default.                                                                                                                                           |
| H14 | **Audience: a curious adult with no tech background** who uses chatbots. Replaces the archived D2 ("software engineers"). Plain question titles; technical names live behind the Technical toggle.                                                                                                                                                                                                                                                                                                             | The human's goal statement.                                                                                                                        |
| H15 | **The serving chapters become an optional side room, "Behind the scenes"** (sticky notes/KV cache, the bus/batching, smaller numbers/quantization, a fast helper/speculative, specialists/experts). Off the main path; never the Continue target.                                                                                                                                                                                                                                                              | About serving millions, not about what's inside.                                                                                                   |
| H16 | **The residual chapter goes.** The stack chapter ("How does it get good enough?") carries the idea in plain words, with the river in its Technical line. The `residual` and `noresidual` models and the residual scene are deleted.                                                                                                                                                                                                                                                                            | Plumbing, not demystification.                                                                                                                     |
| H17 | **Myths are answered where the scene already shows them:** different answers and confident mistakes (the dice), no looking things up (attention), no database of facts (the panel), no memory beyond the text in front of it (writing). The finale: "No database. No mind reading. No magic."                                                                                                                                                                                                                  | Demystification.                                                                                                                                   |
| H18 | **Inference only.** No training chapter.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | "training is another project, just focus on inference"                                                                                             |

## Decisions made while planning (settled unless the human objects)

| #   | Decision                                                                                                                                                                                                                                                        | Why                                                                                                                                                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | --------------- |
| P1  | **One world at full scale.** Every machine is permanently placed in one scene at scale 1; the camera really flies between them. No scaled hub with a cut.                                                                                                       | All four drafts agreed. At scale 1 a chapter's hero shot only translates, so every approved chapter composition survives unchanged, and "one space" is literal. A scaled hub plus a cut would keep two drawings of each machine (two owners) and fake the space. |
| P2  | **Only the focused machine speaks.** It runs its loop and run, and shows its text and labels. Idle machines are frozen at a real frame (`ogTimeSec`) of their committed fixture run, dimmed, with no text.                                                      | Clutter and honesty: idle machines show real output (D25) without loading every model in the hub.                                                                                                                                                                |
| P3  | **Flights are pure plans on the one clock** (`runtime/flight.ts`, replacing `arrival.ts`), always starting from the current pose. Fly-in ~2 s; Next = out ~1.3 s, hold ~0.5 s, in ~2 s; Back ~1.4 s.                                                            | Reuses today's easing; deterministic; the human asked for a visible out-and-in.                                                                                                                                                                                  |
| P4  | **Input during a flight lands it; it never strands the camera.** Esc or a click skips to the destination; orbit input is ignored mid-flight.                                                                                                                    | A cancelled chain would leave the camera between machines.                                                                                                                                                                                                       |
| P5  | **Held clocks cut** (no flight), so captures stay deterministic; `?fly=<from>><to>` shoots a flight on a held clock. `/#N` in real time flies in briefly (~1.2 s) from its zone.                                                                                | Keeps every hero shot byte-stable; posted links still feel like the lab.                                                                                                                                                                                         |
| P6  | **Place sits above the lesson.** `place = lab                                                                                                                                                                                                                   | machine                                                                                                                                                                                                                                                          | tour`; the lesson machine is unchanged apart from its arrival phase being the flight in. | One owner each. |
| P7  | **Routes:** `/` = the lab, `#0`–`#8` = the main path, `#b1`–`#b5` = the side room, anything else = the lab. In-app navigation pushes history, so browser Back flies out. Share pages: `/c/0/`–`/c/8/`, `/c/b1/`–`/c/b5/`; old `/c/9/`–`/c/15/` redirect to `/`. | Renumbering is a hard cutover (H13); the site is days old.                                                                                                                                                                                                       |
| P8  | **Continue = the first incomplete machine on the main path; Next from 8 = the lab**, which offers the tour and the side room once the main path is ✓. Side-room machines chain among themselves, then back to the lab.                                          | The side room is optional (H15).                                                                                                                                                                                                                                 |
| P9  | **Picking uses app shapes and the one camera function** (`screenRay` in `camera.ts`), never pixel readback. A click is a press that moved under 4 px.                                                                                                           | Renderer skill.                                                                                                                                                                                                                                                  |
| P10 | **The brief lives only in the left column.** The centre brief card goes; Start is in the column. The Labels toggle and Help stay usable in every phase.                                                                                                         | One owner for the brief; reading aids aren't controls.                                                                                                                                                                                                           |
| P11 | **The intro guesses greedily** (always the tallest bar), and a new probe proves its sentence is whole words with no repeats. Its Technical line says it predicts tokens and always takes the top one.                                                           | Leaves random sampling for chapter 3 to introduce; the probe keeps "word" honest (D25).                                                                                                                                                                          |
| P12 | **Chapter 1 opens on the intro's sentence**, not on "onse".                                                                                                                                                                                                     | The "onse" beat is gone (H2).                                                                                                                                                                                                                                    |
| P13 | **The route pipe appears only in the finale.** Zones follow story order; the pipe follows the order a word flows, and that contrast is the tour's payoff.                                                                                                       | The two orders differ (sampling after the stack; experts inside a block).                                                                                                                                                                                        |
| P14 | **Keys:** Esc = back to the lab (when help is closed), → = Next; ← is removed.                                                                                                                                                                                  | There is no ladder to step through.                                                                                                                                                                                                                              |
| P15 | **The in-world glyph set gains ✓ · › ←.**                                                                                                                                                                                                                       | The atlas is ASCII-only today.                                                                                                                                                                                                                                   |
| P16 | **Slug `autocomplete` becomes `intro`.** A stored intro completion is dropped once (hard cutover).                                                                                                                                                              | Names match what the chapter is.                                                                                                                                                                                                                                 |

## Single-owner invariants

| Concept                                                              | Owner                                                                                          |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Act and side-room membership, names, blurbs, each machine's question | `apps/explainer/src/chapters/acts.ts` (new)                                                    |
| Story order                                                          | `chapters/ladder.ts` (main path, then the side room; without `finished` and `residual`)        |
| Brief, hand-off, caption copy                                        | `ChapterDef`, checked by `validateChapter`                                                     |
| Machine placement, zones, hub pose, flight timings, idle dim         | `hall/layout.json`, validated by `hall/layout.ts`; the Blender hall script reads the same file |
| Mount transform, hero poses in the hall                              | `hall/layout.ts` (`mountMatrix`, `mountPose`, `heroPose`)                                      |
| One-world composition, focus and idle                                | `scene/hall.ts` (replaces `scene/builders/finished.ts`)                                        |
| Idle frames                                                          | committed fixture runs (`src/scene/idle-runs/`), equality-tested against the real runs         |
| Camera moves                                                         | `runtime/flight.ts` (replaces `arrival.ts`); `stage.ts` executes them                          |
| Place, travel, Continue target, routes                               | `state/place.ts`                                                                               |
| Lesson phases                                                        | `state/lesson.ts` (unchanged except the arrival phase)                                         |
| Screen ray                                                           | `packages/renderer/src/camera.ts` `screenRay`                                                  |
| Hit test                                                             | `hall/pick.ts`                                                                                 |
| Tour order and pacing                                                | `hall/tour.ts`                                                                                 |
| Hall geometry                                                        | `assets/blender/lab_hall.py` (replaces `lab_room.py`)                                          |

**End state:** the code reads as if designed around the hall from day one. No
`finished` or `residual` chapter, no ladder, no `arrival.ts`, no counts model, no
`residual`/`noresidual` models, no `ChapterDef.tour`,
no centre brief card, no `fieldset disabled`, no second copy of any chapter's scene.

## Slice graph

```
01 story ─▶ 02 intro ─▶ 03 lesson column
04 layout ─▶ 05 one world ─▶ 06 hall prop ─▶ 10 signs
07 flights ─┐
05 ─────────┴▶ 08 place/routes/picking ─▶ 09 lab column ─▶ 11 finale ─▶ 12 release
```

01–03 ship on today's app and can run in parallel with 04 and 07. 04 is the fail-fast
gate: if full-scale machines can't keep each other out of their hero shots in a sane
hall, stop and reslice (fallback: per-mount yaw and dividing walls; last resort: P1's
alternative).

## Risks

1. **Hall size vs hero shots.** Fourteen full-scale machines (nine on the main path, five in the side room) need roughly a 40×30 m hall;
   neighbours may intrude into approved shots. Slice 04's CPU clearance test answers this
   before any Blender work.
2. **Label occlusion cost.** Per-triangle occluders over the whole hall; slice 05 filters
   occluders to the focused machine and its neighbours.
3. **Hub legibility and bloom.** Machines and signs may be small at 1280×720, and fifteen
   glowing machines may bloom into mush; idle dimming and a hub pose tuned in 05/10.
4. **The intro probe may fail** (fragments or loops in the greedy sentence). Slice 02
   searches prompts before any art; D33 honesty applies if none passes.
5. **Story coherence can't be unit-tested.** `/lab/story` and a human read guard it.

## Where the drafts disagreed (alternatives kept for the human)

- **Idle machines:** frozen real frames (chosen) vs "unpowered" with no run (cheaper,
  but a machine with no output may look broken).
- **`/#N`:** a short fly-in (chosen) vs a straight cut.
- **Slice count:** 4 (fewest) to 14 (seams). This plan uses 12, one variable per visual
  slice.

## Choices ledger

Decisions an implementer makes that a slice didn't delegate go in [choices.md](choices.md).
