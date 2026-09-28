/**
 * The lesson: how every chapter runs (README, "Amendments after release": the lesson flow).
 * It supersedes free exploration first (D12), the auto-loop (D24) and the pause-on-touch rule
 * (D32).
 *
 *   arriving ──move ends──▶ briefing ──Start──▶ playing ──ends / Skip──▶ yourTurn
 *                                                  ▲                       │
 *                                                  └──── Replay lesson ────┘
 *
 * - `arriving`: the camera's arrival move (D42). Without a move a chapter opens past it.
 * - `briefing`: a card over the scene says what the lesson is about; Start (Enter) begins it.
 * - `playing`: the chapter's loop plays one pass from 0 to `Timeline.endSec`. The reader's
 *   controls are locked; Skip ends the pass. The pass can pause (Space).
 * - `yourTurn`: the scene holds the lesson's end (`endSec`) and the controls are the reader's.
 *
 * A chapter whose lesson ended or was skipped is complete; Next (and →) needs that. Completion
 * is remembered in `localStorage` where the browser allows it, and works without it.
 *
 * Captures run on a held clock (`?clock=held`): a chapter opens straight into
 * `playing` at the clock's time and never ends by itself, so a shot is the lesson's pass (the loop wraps as it always did). `?lesson=brief|play|done` picks
 * where a chapter opens past the move, for shooting each state.
 */
import type { ChapterSlug } from "../chapters/types.ts";

export type LessonPhase = "arriving" | "briefing" | "playing" | "yourTurn";

/** Where a chapter opens once the arrival move is over. */
export type LessonStart = "brief" | "play" | "done";

/** How every chapter opens: fixed for the page's lifetime. */
export interface LessonOpening {
  /** The arrival move runs (D42): the chapter opens in `arriving`. */
  move: boolean;
  start: LessonStart;
}

/** The phase once the arrival move is over (or skipped). */
export function phaseAfterMove(start: LessonStart): LessonPhase {
  switch (start) {
    case "brief":
      return "briefing";
    case "play":
      return "playing";
    case "done":
      return "yourTurn";
  }
}

/** The phase a chapter opens in. */
export function openingPhase(opening: LessonOpening): LessonPhase {
  return opening.move ? "arriving" : phaseAfterMove(opening.start);
}

/**
 * Where chapters open past the move: `?lesson=` when given, else straight into the pass under
 * a held clock (captures) and the brief in real time.
 */
export function lessonStartFromSearch(search: string, held: boolean): LessonStart {
  const asked = new URLSearchParams(search).get("lesson");
  if (asked === "brief" || asked === "play" || asked === "done") return asked;
  return held ? "play" : "brief";
}

/** What moves a lesson on: the move ending, Start, the pass ending, Skip, Replay. */
export type LessonEvent = "moved" | "start" | "end" | "skip" | "replay";

/**
 * The phase `event` leads to from `phase`, or `null` where it means nothing (Start while the
 * lesson plays, Skip after it ended). Reaching `yourTurn` completes the chapter.
 */
export function lessonStep(
  phase: LessonPhase,
  event: LessonEvent,
  start: LessonStart,
): LessonPhase | null {
  switch (event) {
    case "moved":
      return phase === "arriving" ? phaseAfterMove(start) : null;
    case "start":
      return phase === "briefing" ? "playing" : null;
    case "end":
    case "skip":
      return phase === "playing" ? "yourTurn" : null;
    case "replay":
      return phase === "yourTurn" ? "playing" : null;
  }
}

/** The reader's controls (type, try, knob) are theirs only once the lesson is over. */
export function controlsUnlocked(phase: LessonPhase): boolean {
  return phase === "yourTurn";
}

/** The lesson's loop time: 0 before it starts, the pass while it plays, its end after. */
export function lessonTime(phase: LessonPhase, passTime: number, endSec: number): number {
  switch (phase) {
    case "arriving":
    case "briefing":
      return 0;
    case "playing":
      return passTime;
    case "yourTurn":
      return endSec;
  }
}

/** Where completion is kept. */
export const COMPLETED_KEY = "aiexplainer.completed";

/** The `localStorage` subset completion needs, so tests can pass a map or a throwing stand-in. */
export type CompletionStore = Pick<Storage, "getItem" | "setItem">;

/**
 * The chapters completed on an earlier visit. A store that throws (blocked site data, a
 * private window) or holds anything unexpected reads as none completed.
 */
export function loadCompleted(
  store: () => CompletionStore,
  known: readonly ChapterSlug[],
): ChapterSlug[] {
  try {
    const raw: unknown = JSON.parse(store().getItem(COMPLETED_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return known.filter((slug) => raw.includes(slug));
  } catch {
    return [];
  }
}

/** Remembers the completed chapters; a store that refuses is ignored (the page works on). */
export function saveCompleted(store: () => CompletionStore, completed: readonly ChapterSlug[]) {
  try {
    store().setItem(COMPLETED_KEY, JSON.stringify(completed));
  } catch {
    // Completion is a convenience: without storage, Next unlocks per visit.
  }
}
