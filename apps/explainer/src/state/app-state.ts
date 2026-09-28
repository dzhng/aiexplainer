/**
 * Application state: which chapter is on screen, the HUD controls, and whether its loop plays.
 * Pure: `reduce` takes the written chapters as context and never reads the DOM or the clock.
 *
 * D32: arriving at a chapter restarts its loop (`loopEpoch` bumps, `playing` turns on); a scene
 * control (slider, scenario, typed text) pauses it; ▶ resumes. The reading aids (Analogy /
 * Technical labels, the "Technical" caption line, help) change what text is shown, not the scene, so they don't pause.
 */
import { LADDER, displayNumber, slugAt } from "../chapters/ladder.ts";
import type { ChapterDef, ChapterSlug } from "../chapters/types.ts";

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
  playing: boolean;
  /** Bumps on every arrival; the frame loop restarts loop time when it changes. */
  loopEpoch: number;
  labelMode: LabelMode;
  technicalOpen: boolean;
  helpOpen: boolean;
}

export type Action =
  | { type: "goto"; chapter: ChapterSlug }
  | { type: "next" }
  | { type: "prev" }
  | { type: "setSlider"; value: number }
  | { type: "setScenario"; scenario: string | null }
  | { type: "setText"; text: string }
  | { type: "togglePlay" }
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

/** The state on arrival at `slug`: its controls at their defaults and its loop playing from 0. */
function arrive(chapters: Chapters, slug: ChapterSlug, from: AppState | null): AppState {
  const def = chapterDef(chapters, slug);
  return {
    chapter: slug,
    slider: def.slider?.initial ?? 0,
    sliderSet: false,
    scenario: null,
    text: null,
    playing: true,
    loopEpoch: (from?.loopEpoch ?? -1) + 1,
    labelMode: from?.labelMode ?? "analogy",
    technicalOpen: false,
    helpOpen: from?.helpOpen ?? false,
  };
}

export function initialState(chapters: Chapters, slug: ChapterSlug): AppState {
  return arrive(chapters, slug, null);
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
  const paused = { ...state, playing: false };
  switch (action.type) {
    case "goto":
      return chapters[action.chapter] ? arrive(chapters, action.chapter, state) : state;
    case "next":
    case "prev": {
      const order = writtenChapters(chapters);
      const to = order[order.indexOf(state.chapter) + (action.type === "next" ? 1 : -1)];
      return to ? arrive(chapters, to, state) : state;
    }
    case "setSlider":
      if (!def.slider) return state;
      return { ...paused, slider: snapSlider(def, action.value), sliderSet: true };
    case "setScenario":
      if (action.scenario !== null && !def.scenarios.some((s) => s.id === action.scenario))
        return state;
      return { ...paused, scenario: action.scenario, text: null };
    case "setText":
      return { ...paused, scenario: null, text: action.text === "" ? null : action.text };
    case "togglePlay":
      return { ...state, playing: !state.playing };
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
