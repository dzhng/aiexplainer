/**
 * The keyboard map. ← and → step the ladder, Space is ▶, ? opens help and Esc closes it.
 * Every key goes through the same actions as the HUD buttons.
 */
import type { Action, AppState } from "./app-state.ts";

/** The subset of `KeyboardEvent` the map reads, so tests can pass plain objects. */
export interface KeyPress {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
}

export function actionForKey(press: KeyPress, state: AppState): Action | null {
  if (press.altKey || press.ctrlKey || press.metaKey) return null;
  const { key } = press;
  switch (key) {
    case "ArrowRight":
      return { type: "next" };
    case "ArrowLeft":
      return { type: "prev" };
    case " ":
      return { type: "togglePlay" };
    case "?":
      return { type: "toggleHelp" };
    case "Escape":
      return state.helpOpen ? { type: "toggleHelp" } : null;
    default:
      return null;
  }
}
