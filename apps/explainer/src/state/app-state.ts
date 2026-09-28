/**
 * Application state: which chapter is on screen, where its lesson is (`state/lesson.ts`), the
 * HUD controls, and the reading aids. Pure: `reduce` takes the written chapters as context and
 * never reads the DOM, the clock or storage.
 *
 * The lesson flow (README, "Amendments after release") supersedes D12, D24 and D32: a chapter
 * opens on its arrival move and brief, plays its loop once with the controls locked, then
 * hands the controls to the reader. Their input drives the scene, which holds the lesson's
 * end. The reading aids (Analogy / Technical labels, the "Technical" caption line, help)
 * change what text is shown, not the scene, so they work in every phase.
 */
import { LADDER, displayNumber, slugAt } from "../chapters/ladder.ts";
import type { ChapterDef, ChapterSlug } from "../chapters/types.ts";
import {
  controlsUnlocked,
  lessonStep,
  openingPhase,
  type LessonEvent,
  type LessonOpening,
  type LessonPhase,
} from "./lesson.ts";

export type Chapters = Partial<Record<ChapterSlug, ChapterDef>>;
export type LabelMode = "analogy" | "technical";

export interface AppState {
  chapter: ChapterSlug;
  /** The chapter slider's value (0 in a chapter without one). */
  slider: number;
  /**
   * Whether the reader has moved the slider since arriving. Until they do, a scene may play
   * its own value for the slider's quantity (chapter 11's loop fills the bus itself).
   */
  sliderSet: boolean;
  /** `null` plays the chapter's own loop script; a scenario id swaps in its preset prompt. */
  scenario: string | null;
  /** What the reader typed; `null` (or empty) plays the loop's own inputs. */
  text: string | null;
  lesson: LessonPhase;
  /** The lesson's pass is paused (Space); only while it plays. */
  paused: boolean;
  /** Bumps on every arrival: the camera's arrival move and the HUD's intro replay on it. */
  visit: number;
  /** Bumps on every arrival and whenever a pass starts: loop time restarts at 0 on it. */
  loopEpoch: number;
  /** Chapters whose lesson ended or was skipped, this visit or (from storage) an earlier one. */
  completed: readonly ChapterSlug[];
  /** How every chapter opens; fixed for the page's lifetime. */
  opening: LessonOpening;
  labelMode: LabelMode;
  technicalOpen: boolean;
  helpOpen: boolean;
}

export type Action =
  | { type: "goto"; chapter: ChapterSlug }
  | { type: "next" }
  | { type: "prev" }
  | { type: "lesson"; event: LessonEvent }
  | { type: "setSlider"; value: number }
  | { type: "setScenario"; scenario: string | null }
  | { type: "setText"; text: string }
  | { type: "togglePause" }
  | { type: "toggleLabelMode" }
  | { type: "toggleTechnical" }
  | { type: "toggleHelp" };

/** The written chapters in ladder order: the ones ← / → and the ladder can reach. */
export function writtenChapters(chapters: Chapters): ChapterSlug[] {
  return LADDER.filter((slug) => chapters[slug] !== undefined);
}

function chapterDef(chapters: Chapters, slug: ChapterSlug): ChapterDef {
  const def = chapters[slug];
  if (!def) throw new Error(`chapter ${slug} is not written`);
  return def;
}

/** The chapter's controls at their defaults: the lesson as written. */
function defaultControls(def: ChapterDef) {
  return { slider: def.slider?.initial ?? 0, sliderSet: false, scenario: null, text: null };
}

/** Reaching the reader's turn completes the chapter. */
function completing(state: AppState): AppState {
  if (state.lesson !== "yourTurn" || state.completed.includes(state.chapter)) return state;
  return { ...state, completed: [...state.completed, state.chapter] };
}

/** The state on arrival at `slug`: its controls at their defaults and its lesson opening. */
function arrive(chapters: Chapters, slug: ChapterSlug, from: AppState): AppState {
  return completing({
    ...from,
    ...defaultControls(chapterDef(chapters, slug)),
    chapter: slug,
    lesson: openingPhase(from.opening),
    paused: false,
    visit: from.visit + 1,
    loopEpoch: from.loopEpoch + 1,
    technicalOpen: false,
  });
}

/**
 * The first state: arriving at `slug`. `completed` is what storage remembered; `opening`
 * defaults to a capture's (no move, straight into the pass).
 */
export function initialState(
  chapters: Chapters,
  slug: ChapterSlug,
  opening: LessonOpening = { move: false, start: "play" },
  completed: readonly ChapterSlug[] = [],
): AppState {
  return arrive(chapters, slug, {
    chapter: slug,
    ...defaultControls(chapterDef(chapters, slug)),
    lesson: "arriving",
    paused: false,
    visit: -1,
    loopEpoch: -1,
    completed,
    opening,
    labelMode: "analogy",
    technicalOpen: false,
    helpOpen: false,
  });
}

/** The written chapter after (`1`) or before (`-1`) the current one, if any. */
export function neighbour(state: AppState, chapters: Chapters, step: 1 | -1): ChapterSlug | null {
  const order = writtenChapters(chapters);
  return order[order.indexOf(state.chapter) + step] ?? null;
}

/** Next (and →) opens once this chapter's lesson ended or was skipped, now or on a past visit. */
export function nextUnlocked(state: AppState): boolean {
  return state.completed.includes(state.chapter);
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** `value` on the chapter slider's step, inside its range (0 without a slider). */
export function snapSlider(def: ChapterDef, value: number): number {
  if (!def.slider) return 0;
  const { min, max, step } = def.slider;
  // `toFixed` drops the float residue of a fractional step (3 × 0.1 is 0.30000000000000004).
  const snapped = Number((min + Math.round((value - min) / step) * step).toFixed(9));
  return clamp(snapped, min, max);
}

/**
 * The slider value the HUD shows: the reader's once they have moved it; before that, the
 * loop's own value when the chapter's loop plays the slider (`SliderDef.loop`).
 */
export function shownSlider(state: AppState, def: ChapterDef, loopValue: number | null): number {
  if (state.sliderSet || def.slider?.loop === undefined || loopValue === null) return state.slider;
  return snapSlider(def, loopValue);
}

export function reduce(state: AppState, action: Action, chapters: Chapters): AppState {
  const def = chapterDef(chapters, state.chapter);
  // Typing, the examples and the knob are the reader's only on their turn.
  const locked = !controlsUnlocked(state.lesson);
  switch (action.type) {
    case "goto":
      return chapters[action.chapter] ? arrive(chapters, action.chapter, state) : state;
    case "next": {
      const to = neighbour(state, chapters, 1);
      return to && nextUnlocked(state) ? arrive(chapters, to, state) : state;
    }
    case "prev": {
      const to = neighbour(state, chapters, -1);
      return to ? arrive(chapters, to, state) : state;
    }
    case "lesson": {
      const phase = lessonStep(state.lesson, action.event, state.opening.start);
      if (phase === null) return state;
      const next = { ...state, lesson: phase, paused: false };
      if (phase !== "playing") return completing(next);
      // A pass plays from 0. A replay plays the lesson as written, so the controls reset.
      return {
        ...next,
        ...(action.event === "replay" ? defaultControls(def) : {}),
        loopEpoch: state.loopEpoch + 1,
      };
    }
    case "setSlider":
      if (!def.slider || locked) return state;
      return { ...state, slider: snapSlider(def, action.value), sliderSet: true };
    case "setScenario":
      if (locked) return state;
      if (action.scenario !== null && !def.scenarios.some((s) => s.id === action.scenario))
        return state;
      return { ...state, scenario: action.scenario, text: null };
    case "setText":
      if (locked) return state;
      return { ...state, scenario: null, text: action.text === "" ? null : action.text };
    case "togglePause":
      return state.lesson === "playing" ? { ...state, paused: !state.paused } : state;
    case "toggleLabelMode":
      return { ...state, labelMode: state.labelMode === "analogy" ? "technical" : "analogy" };
    case "toggleTechnical":
      return { ...state, technicalOpen: !state.technicalOpen };
    case "toggleHelp":
      return { ...state, helpOpen: !state.helpOpen };
  }
}

/** `#4` → the chapter at display number 4 (D31), if it is written. */
export function chapterFromHash(hash: string, chapters: Chapters): ChapterSlug | undefined {
  const match = /^#(\d{1,2})$/.exec(hash);
  const slug = match ? slugAt(Number(match[1])) : undefined;
  return slug && chapters[slug] ? slug : undefined;
}

/** The chapter a `#N` address names, or the first written chapter. */
export function chapterAt(hash: string, chapters: Chapters): ChapterSlug {
  const slug = chapterFromHash(hash, chapters) ?? writtenChapters(chapters)[0];
  if (!slug) throw new Error("no chapter is written");
  return slug;
}

export function hashFor(slug: ChapterSlug): string {
  return `#${displayNumber(slug)}`;
}

/** The chapter's share page (D34): its own link-preview card, redirecting to `/#N`. */
export function sharePathFor(slug: ChapterSlug): string {
  return `/c/${displayNumber(slug)}/`;
}
