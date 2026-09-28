/**
 * The keyboard map. ← steps back along the ladder; → steps on only when Next is open (the
 * lesson ended or was skipped). Enter or Space starts the lesson from its brief, Space pauses
 * and resumes the lesson's pass, ? opens help and Esc closes it. Every key goes through the
 * same actions as the HUD buttons.
 */
import { nextUnlocked, type Action, type AppState } from "./app-state.ts";

/** The subset of `KeyboardEvent` the map reads, so tests can pass plain objects. */
export interface KeyPress {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export function actionForKey(press: KeyPress, state: AppState): Action | null {
  if (press.altKey || press.ctrlKey || press.metaKey) return null;
  switch (press.key) {
    case "ArrowRight":
      return nextUnlocked(state) ? { type: "next" } : null;
    case "ArrowLeft":
      return { type: "prev" };
    case "Enter":
      return state.lesson === "briefing" ? { type: "lesson", event: "start" } : null;
    case " ":
      if (state.lesson === "briefing") return { type: "lesson", event: "start" };
      return state.lesson === "playing" ? { type: "togglePause" } : null;
    case "?":
      return { type: "toggleHelp" };
    case "Escape":
      return state.helpOpen ? { type: "toggleHelp" } : null;
    default:
      return null;
  }
}
