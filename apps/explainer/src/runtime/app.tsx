/**
 * The app: owns the `AppState` reducer, `/#N` routing, the keyboard, the chapter's model, and
 * the stage (canvas, then the HUD). Slice 10 adds the renderer and the frame loop here: loop time
 * restarts when `state.loopEpoch` changes and advances only while `state.playing`.
 */
import type { LoadedModel, ModelId } from "@repo/llm";
import { useEffect, useReducer, useRef, useState } from "react";
import { CHAPTERS } from "../chapters/index.ts";
import { Hud } from "../hud/Hud.tsx";
import {
  chapterFromHash,
  hashFor,
  initialState,
  reduce,
  writtenChapters,
  type Action,
  type AppState,
} from "../state/app-state.ts";
import { actionForKey } from "../state/keys.ts";
import css from "./app.module.css";
import { fetchModel } from "./models.ts";

const reducer = (state: AppState, action: Action) => reduce(state, action, CHAPTERS);

function startState(): AppState {
  const slug = chapterFromHash(location.hash, CHAPTERS) ?? writtenChapters(CHAPTERS)[0];
  if (!slug) throw new Error("no chapter is written");
  return initialState(CHAPTERS, slug);
}

/** Keys typed into a form control belong to it; Space on a button is that button's click. */
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.matches("input, textarea, select")) return true;
  return key === " " && target.matches("button, a");
}

export interface AppProps {
  /** `?hud=0` hides the HUD for scene-only shots. */
  hud: boolean;
  /** Called once the first chapter's HUD shows real values (its model loaded) and fonts are in. */
  onReady: () => void;
}

export function App({ hud, onReady }: AppProps) {
  const [state, dispatch] = useReducer(reducer, undefined, startState);
  const def = CHAPTERS[state.chapter]!;
  const models = useRef(new Map<ModelId, LoadedModel>());
  const [model, setModel] = useState<LoadedModel | null>(null);
  const readyOnce = useRef(onReady);

  // The chapter's model: fetched once, then kept for the session.
  useEffect(() => {
    const id = def.model;
    const cached = id === null ? null : models.current.get(id);
    if (id === null || cached) {
      setModel(cached ?? null);
      return;
    }
    let live = true;
    setModel(null);
    void fetchModel(id).then((loaded) => {
      models.current.set(id, loaded);
      if (live) setModel(loaded);
    });
    return () => {
      live = false;
    };
  }, [def.model]);

  useEffect(() => {
    if (def.model !== null && model === null) return;
    const ready = readyOnce.current;
    readyOnce.current = () => {};
    void document.fonts.ready.then(ready);
  }, [def.model, model]);

  // The address shows the chapter (D31) without adding a history entry per step.
  useEffect(() => {
    const hash = hashFor(state.chapter);
    if (location.hash !== hash) history.replaceState(null, "", hash);
  }, [state.chapter]);

  useEffect(() => {
    const onHash = () => {
      const slug = chapterFromHash(location.hash, CHAPTERS);
      if (slug) dispatch({ type: "goto", chapter: slug });
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (ownsKey(event.target, event.key)) return;
      const action = actionForKey(event, state, def);
      if (!action) return;
      event.preventDefault();
      dispatch(action);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state, def]);

  return (
    <main className={css.stage}>
      <div className={css.canvas} data-layer="canvas" />
      {hud && <Hud state={state} dispatch={dispatch} def={def} chapters={CHAPTERS} model={model} />}
    </main>
  );
}
