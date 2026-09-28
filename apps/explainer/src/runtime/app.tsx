/**
 * The app: owns the `AppState` reducer, `/#N` routing, the keyboard, the chapter's model, the
 * inference session, and the stage (canvas, labels and scene text, then the HUD). The frame
 * loop is `runtime/stage.ts`: clock → loop time (restarts on `loopEpoch`, advances only while
 * `playing`) → `evalTimeline` → `buildFrame` → `renderer.frame` → `placeLabels` → label refs.
 */
import { sourceId, type ModelId, type ModelSource } from "@repo/llm";
import type { FrameInput, SceneDesc, ScreenRect } from "@repo/renderer";
import { useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { CHAPTERS } from "../chapters/index.ts";
import type { ChapterDef, ChapterModelId } from "../chapters/types.ts";
import { Hud } from "../hud/Hud.tsx";
import { Labels, type LabelsHandle } from "../hud/Labels.tsx";
import { SceneTagsLayer, type SceneTagsHandle } from "../hud/SceneTags.tsx";
import type { ProbeApi } from "../lab/probe.ts";
import { lookConfig } from "../look/look.ts";
import { SCENE_BUILDERS, type SceneRun, type SceneUi } from "../scene/build-frame.ts";
import type { ShotId } from "../chapters/types.ts";
import { shotPose } from "../scene/shots.ts";
import {
  chapterAt,
  chapterFromHash,
  hashFor,
  initialState,
  reduce,
  shownSlider,
  snapSlider,
  type Action,
  type AppState,
} from "../state/app-state.ts";
import { actionForKey } from "../state/keys.ts";
import css from "./app.module.css";
import { chapterScene, loadSceneAssets, type ChapterScene } from "./chapter-scene.ts";
import type { Clock } from "./clock.ts";
import { ARRIVAL_SEC } from "./arrival.ts";
import { LoopTime } from "./loop-time.ts";
import { fetchModel } from "./models.ts";
import { computeRun } from "./scene-run.ts";
import { createSession, type Session } from "./session.ts";
import { runStage, type Stage } from "./stage.ts";

const reducer = (state: AppState, action: Action) => reduce(state, action, CHAPTERS);

function startState(): AppState {
  return initialState(CHAPTERS, chapterAt(location.hash, CHAPTERS));
}

/** Keys typed into a form control belong to it; Space on a button is that button's click. */
function ownsKey(target: EventTarget | null, key: string): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.matches("input, textarea, select")) return true;
  return key === " " && target.matches("button, a");
}

/** The UI a scene reads; a scenario's prompt stands in for typed text. */
function sceneUi(state: AppState, def: ChapterDef): SceneUi {
  const scenario = def.scenarios.find((s) => s.id === state.scenario);
  return {
    follow: state.follow,
    slider: state.slider,
    sliderSet: state.sliderSet,
    view: state.view,
    text: state.text ?? scenario?.prompt ?? null,
  };
}

const SAFE_MARGIN = 16;

/** The canvas minus the HUD panels: right of the title panel, below the controls, above the ladder. */
function safeRect(): ScreenRect {
  const rect = (id: string) =>
    document.querySelector(`[data-crop="${id}"]`)?.getBoundingClientRect();
  const tl = rect("panel:tl");
  const tr = rect("panel:tr");
  const bottoms = [rect("panel:ladder"), rect("panel:corner")].filter((r) => r !== undefined);
  const x = (tl?.right ?? 0) + SAFE_MARGIN;
  const y = (tr?.bottom ?? 0) + SAFE_MARGIN;
  const bottom = Math.min(innerHeight, ...bottoms.map((r) => r.top)) - SAFE_MARGIN;
  return { x, y, width: innerWidth - SAFE_MARGIN - x, height: bottom - y };
}

export interface AppProps {
  /** `?hud=0` hides the HUD for scene-only shots. */
  hud: boolean;
  /** The HUD's decorative motion (arrival intro, chip count-up); off under a held clock. */
  hudMotion: boolean;
  clock: Clock;
  probe: ProbeApi;
  /** `?emissive=0&bloom=0` and friends. */
  debug: FrameInput["debug"];
  /** Called once the first chapter's HUD shows real values and its scene is on screen. */
  onReady: () => void;
  /**
   * Arrive at each chapter with the camera move from `room-wide` (D42). Off for held-clock
   * captures unless `?arrival=1`, so hero shots stay deterministic.
   */
  arrival: boolean;
}

export function App({ hud, hudMotion, clock, probe, debug, onReady, arrival }: AppProps) {
  const [state, dispatch] = useReducer(reducer, undefined, startState);
  const def = CHAPTERS[state.chapter]!;
  // Every shipped model the main thread fetched, kept for the session: the chapter's (the HUD's
  // stats read it) and any other a run asks for (the finished machine reads every chapter's).
  const models = useRef(new Map<ChapterModelId, ModelSource>());
  const fetching = useRef(new Map<ChapterModelId, Promise<ModelSource>>());
  const [source] = useState(() => (id: ChapterModelId) => {
    let fetched = fetching.current.get(id);
    if (!fetched) {
      fetched = fetchModel(id).then((loaded) => {
        models.current.set(id, loaded);
        return loaded;
      });
      fetching.current.set(id, fetched);
    }
    return fetched;
  });
  const [model, setModel] = useState<ModelSource | null>(null);
  const [run, setRun] = useState<SceneRun | null>(null);
  const [session] = useState<Session>(() => createSession());
  const workerModel = useRef<{ id: ModelId; loaded: Promise<void> } | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<LabelsHandle>(null);
  const tags = useRef<SceneTagsHandle>(null);
  const stage = useRef<Stage | null>(null);
  const sceneRef = useRef<ChapterScene | null>(null);
  // A loop that plays the slider (`SliderDef.loop`) shows its value in the HUD, sampled at
  // 10 Hz and snapped to the slider's steps: the chips follow the loop without a React render
  // per frame.
  const [loopSlider, setLoopSlider] = useState<number | null>(null);
  const playsSlider = def.slider.loop !== undefined && !state.sliderSet;
  useEffect(() => {
    setLoopSlider(null);
    const channel = def.slider.loop;
    if (!playsSlider || channel === undefined) return;
    const sample = () => {
      const value = sceneRef.current?.channel(channel) ?? null;
      setLoopSlider(value === null ? null : snapSlider(def, value));
    };
    sample();
    const timer = setInterval(sample, 100);
    return () => clearInterval(timer);
  }, [def, playsSlider]);
  // The HUD panels' rects, re-measured after each render and on resize: labels steer clear.
  const panelRects = useRef<ScreenRect[]>([]);
  useLayoutEffect(() => {
    const measure = () => {
      panelRects.current = [...document.querySelectorAll("[data-crop^='panel:']")].map((el) => {
        const { x, y, width, height } = el.getBoundingClientRect();
        return { x, y, width, height };
      });
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  });
  // The frame loop reads these every frame; React state lands here after each render.
  const live = useRef({ state, def, run });
  live.current = { state, def, run };
  const ready = useRef({ hud: false, scene: false, fired: false });
  const markReady = (part: "hud" | "scene") => {
    ready.current[part] = true;
    if (ready.current.hud && ready.current.scene && !ready.current.fired) {
      ready.current.fired = true;
      onReady();
    }
  };

  // The chapter's model, for the HUD's stats and the scene's run.
  useEffect(() => {
    const id = def.model;
    const cached = id === null ? null : models.current.get(id);
    if (id === null || cached) {
      setModel(cached ?? null);
      return;
    }
    let alive = true;
    setModel(null);
    void source(id).then((loaded) => alive && setModel(loaded));
    return () => {
      alive = false;
    };
  }, [def.model]);

  // Runs may load models of their own (the finished machine loads every chapter's): the worker
  // answers on the latest one loaded, so every load, not only the chapter's, is tracked here.
  const [tracked] = useState<Session>(() => ({
    ...session,
    load(id) {
      const loaded = session.load(id);
      if (!(id instanceof URL)) workerModel.current = { id, loaded: loaded.then(() => undefined) };
      return loaded;
    },
  }));

  // The model state lands a render after the chapter changes: never hand one chapter's model to
  // another chapter's stats or run.
  const chapterModel = model !== null && sourceId(model) === def.model ? model : null;

  useEffect(() => {
    if (def.model !== null && chapterModel === null) return;
    void document.fonts.ready.then(() => markReady("hud"));
  }, [def.model, chapterModel]);

  // The scene's model output: the loop's inputs, or the reader's text.
  const text = sceneUi(state, def).text;
  useEffect(() => {
    const id = def.model;
    const model = chapterModel;
    // The run reads the chapter's model: wait until it has loaded.
    if (id === null || model === null) return;
    let alive = true;
    // The worker holds one trained model: load it only when the chapter's model changes.
    if (id !== "tokenizer" && workerModel.current?.id !== id) void tracked.load(id);
    const worker = id === "tokenizer" ? Promise.resolve() : workerModel.current!.loaded;
    void worker
      .then(() => computeRun(def, text, { model, session: tracked, source }))
      .then(
        (next) => alive && setRun(next),
        (error: unknown) => {
          if (error instanceof Error && error.name === "CancelledError") return;
          throw error;
        },
      );
    return () => {
      alive = false;
    };
  }, [def, text, chapterModel, tracked]);

  useEffect(() => () => session.dispose(), [session]);

  // Every prop loaded so far, shared with the scene: each chapter's arrive before it draws.
  const [assets] = useState<SceneDesc["assets"]>(() => ({}));
  useEffect(() => {
    void loadSceneAssets(def, assets);
  }, [def, assets]);

  // The reader took the camera from a tour (by orbiting): it stays theirs until the chapter's
  // loop restarts or they pick a stop with the slider.
  const cameraTaken = useRef(false);
  useEffect(() => {
    cameraTaken.current = false;
  }, [def, state.loopEpoch, state.slider]);

  // The stage: one renderer and frame loop for the app's lifetime.
  useEffect(() => {
    let alive = true;
    const loopTime = new LoopTime();
    const first = live.current.def;
    const scene = (sceneRef.current = chapterScene(first, assets, () => {
      const { state: s, def: d, run: r } = live.current;
      return {
        def: d,
        ui: sceneUi(s, d),
        run: r,
        // The loop starts when the arrival move ends (its 0 is the move's landing).
        loopTime: loopTime.at(
          clock.now(),
          s.loopEpoch,
          s.playing && !(stage.current?.arriving() ?? false),
        ),
        steer: !cameraTaken.current && !(stage.current?.arriving() ?? true),
      };
    }));
    void loadSceneAssets(first, assets)
      .then(() =>
        runStage({
          canvas: canvas.current!,
          look: lookConfig(),
          input: scene.input,
          clock,
          probe,
          debug,
          update: scene.update,
          onOrbitInput: () => {
            cameraTaken.current = true;
          },
          labels: labels.current,
          tags: { layer: tags.current, current: () => scene.frame.tags },
          obstacles: () => panelRects.current,
          onReady: () => {
            // Ready once the scene shows real model output (or has none to wait for).
            const wait = () =>
              live.current.run || live.current.def.model === null
                ? requestAnimationFrame(() => requestAnimationFrame(() => markReady("scene")))
                : setTimeout(wait, 50);
            wait();
          },
        }),
      )
      .then((created) => {
        if (!alive) return created?.dispose();
        stage.current = created;
        if (!created) return;
        arrive(created, live.current.def.shot);
        probe.beat = scene.beat;
        const sceneCrops = probe.sceneCrops;
        probe.sceneCrops = () => ({ ...sceneCrops?.(), ...(hud ? { safe: safeRect() } : {}) });
      });
    return () => {
      alive = false;
      stage.current?.dispose();
      stage.current = null;
    };
    // The stage lives for the app; everything it reads per frame comes through `live`.
  }, []);

  // Arriving at a chapter moves (or cuts) to its shot.
  const arrive = (target: Stage, shot: ShotId) =>
    target.arrive(shotPose(shot), arrival ? shotPose("room-wide") : undefined, ARRIVAL_SEC);
  useEffect(() => {
    if (stage.current) arrive(stage.current, def.shot);
    // `arrive` reads only the stable `arrival` flag.
  }, [def.shot, state.loopEpoch]);

  // Harness hooks: go to a chapter, or set controls, the way a reader would.
  useEffect(() => {
    probe.goto = (slug) => dispatch({ type: "goto", chapter: slug as AppState["chapter"] });
    probe.setUi = (ui) => {
      if (ui.text !== undefined) dispatch({ type: "setText", text: String(ui.text) });
      if (ui.follow !== undefined)
        dispatch({ type: "setFollow", follow: ui.follow as string | null });
      if (ui.slider !== undefined) dispatch({ type: "setSlider", value: Number(ui.slider) });
      if (ui.view !== undefined) dispatch({ type: "setView", view: ui.view as AppState["view"] });
      if (ui.playing === false && live.current.state.playing) dispatch({ type: "togglePlay" });
    };
  }, [probe]);

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
      <canvas ref={canvas} className={css.canvas} data-layer="canvas" />
      <Labels ref={labels} labels={def.labels} reading={state.labelMode} />
      <SceneTagsLayer ref={tags} count={SCENE_BUILDERS[def.scene].tagCount} />
      {hud && (
        <Hud
          state={state}
          dispatch={dispatch}
          def={def}
          chapters={CHAPTERS}
          model={chapterModel}
          motion={hudMotion}
          slider={shownSlider(state, def, loopSlider)}
        />
      )}
    </main>
  );
}
