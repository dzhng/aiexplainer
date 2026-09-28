import { describe, expect, test } from "bun:test";
import { autocomplete } from "../src/chapters/data/autocomplete.ts";
import type { ChapterDef, ChapterSlug } from "../src/chapters/types.ts";
import {
  chapterFromHash,
  initialState,
  nextUnlocked,
  reduce,
  shownSlider,
  type Action,
  type AppState,
  type Chapters,
} from "../src/state/app-state.ts";
import { actionForKey } from "../src/state/keys.ts";
import type { LessonEvent, LessonOpening } from "../src/state/lesson.ts";

/** A knob for the test chapters (chapter 0 itself has none). */
const KNOB = { id: "knob", label: "Knob", hint: "Turns.", min: 1, max: 10, step: 1, initial: 5 };
/** Chapter 0's data with a knob. */
const base: ChapterDef = { ...structuredClone(autocomplete), slider: KNOB };

/** The base re-registered under another slug, so the ladder has more than one rung. */
const as = (slug: ChapterSlug, patch: Partial<ChapterDef> = {}): ChapterDef => ({
  ...structuredClone(base),
  slug,
  ...patch,
});

// Written: 0, 1 and 4 (4 without a knob). Unwritten rungs in between must be skipped.
const chapters: Chapters = {
  autocomplete: base,
  tokenizer: as("tokenizer"),
  attention: as("attention", { slider: undefined }),
};

const run = (state: AppState, ...actions: Action[]) =>
  actions.reduce((s, a) => reduce(s, a, chapters), state);
const lesson = (event: LessonEvent): Action => ({ type: "lesson", event });

/** A reader's page: the arrival move, then the brief. */
const LIVE: LessonOpening = { move: true, start: "brief" };
const live = (slug: ChapterSlug = "autocomplete", completed: ChapterSlug[] = []) =>
  initialState(chapters, slug, LIVE, completed);
/** A capture's page (a driven clock): straight into the pass. */
const start = initialState(chapters, "autocomplete");
/** The reader's turn on chapter 0, after skipping its lesson. */
const yours = run(live(), lesson("moved"), lesson("start"), lesson("skip"));

describe("the lesson flow", () => {
  test("a reader's chapter moves in, briefs, plays, then hands over", () => {
    const arriving = live();
    expect(arriving.lesson).toBe("arriving");
    const briefing = run(arriving, lesson("moved"));
    expect(briefing.lesson).toBe("briefing");
    const playing = run(briefing, lesson("start"));
    expect(playing).toMatchObject({ lesson: "playing", paused: false });
    expect(run(playing, lesson("end")).lesson).toBe("yourTurn");
  });

  test("a pass starts from 0: Start bumps the loop epoch, the move and the brief don't", () => {
    const arriving = live();
    const briefing = run(arriving, lesson("moved"));
    expect(briefing.loopEpoch).toBe(arriving.loopEpoch);
    expect(run(briefing, lesson("start")).loopEpoch).toBe(arriving.loopEpoch + 1);
  });

  test("an event that means nothing in the phase is ignored", () => {
    const briefing = run(live(), lesson("moved"));
    for (const event of ["moved", "end", "skip", "replay"] as const)
      expect(run(briefing, lesson(event))).toBe(briefing);
    expect(run(live(), lesson("start"))).toEqual(live());
    const playing = run(briefing, lesson("start"));
    expect(run(playing, lesson("start"))).toBe(playing);
    expect(run(playing, lesson("replay"))).toBe(playing);
    expect(run(yours, lesson("skip"))).toBe(yours);
    expect(run(yours, lesson("end"))).toBe(yours);
  });

  test("Skip ends the pass: the controls unlock and Next opens", () => {
    const playing = run(live(), lesson("moved"), lesson("start"));
    expect(nextUnlocked(playing)).toBe(false);
    expect(yours.lesson).toBe("yourTurn");
    expect(nextUnlocked(yours)).toBe(true);
    expect(run(yours, { type: "setText", text: "happy" }).text).toBe("happy");
  });

  test("the pass ending by itself completes the chapter too", () => {
    const ended = run(live(), lesson("moved"), lesson("start"), lesson("end"));
    expect(ended.completed).toEqual(["autocomplete"]);
  });

  test("Replay plays the lesson as written again: from 0, with the controls reset", () => {
    const touched = run(yours, { type: "setText", text: "happy" }, { type: "setSlider", value: 9 });
    const replay = run(touched, lesson("replay"));
    expect(replay).toMatchObject({
      lesson: "playing",
      text: null,
      slider: KNOB.initial,
      sliderSet: false,
      loopEpoch: touched.loopEpoch + 1,
      visit: touched.visit,
    });
    // Replaying keeps the chapter complete: Next stays open.
    expect(nextUnlocked(replay)).toBe(true);
  });

  test("a capture opens straight into the pass; ?lesson= opens on the brief or the end", () => {
    expect(start.lesson).toBe("playing");
    expect(initialState(chapters, "tokenizer", { move: false, start: "brief" }).lesson).toBe(
      "briefing",
    );
    const done = initialState(chapters, "tokenizer", { move: false, start: "done" });
    expect(done).toMatchObject({ lesson: "yourTurn", completed: ["tokenizer"] });
    // With the move (`?arrival=1`), a capture plays once the camera lands.
    const moving = initialState(chapters, "tokenizer", { move: true, start: "play" });
    expect(run(moving, lesson("moved")).lesson).toBe("playing");
  });

  test("the pass can pause and resume only while it plays", () => {
    const paused = run(start, { type: "togglePause" });
    expect(paused.paused).toBe(true);
    expect(run(paused, { type: "togglePause" }).paused).toBe(false);
    expect(run(yours, { type: "togglePause" })).toBe(yours);
    const briefing = run(live(), lesson("moved"));
    expect(run(briefing, { type: "togglePause" })).toBe(briefing);
  });

  test("the reading aids work in every phase", () => {
    for (const state of [live(), run(live(), lesson("moved")), start, yours])
      for (const type of ["toggleLabelMode", "toggleTechnical", "toggleHelp"] as const)
        expect(run(state, { type })).not.toBe(state);
  });
});

describe("controls (D32, superseded by the lesson flow)", () => {
  test("every scene control is locked until the reader's turn", () => {
    const controls: Action[] = [
      { type: "setSlider", value: 3 },
      { type: "setScenario", scenario: "once" },
      { type: "setText", text: "the" },
    ];
    const before = [live(), run(live(), lesson("moved")), start];
    for (const state of before)
      for (const control of controls) expect(run(state, control)).toBe(state);
  });

  test("on the reader's turn a control changes the scene's input and nothing else", () => {
    const set = run(yours, { type: "setSlider", value: 3 });
    expect(set).toMatchObject({ lesson: "yourTurn", slider: 3, loopEpoch: yours.loopEpoch });
  });

  test("the slider snaps to its step and stays in range", () => {
    expect(run(yours, { type: "setSlider", value: 3.4 }).slider).toBe(3);
    expect(run(yours, { type: "setSlider", value: 99 }).slider).toBe(KNOB.max);
    expect(run(yours, { type: "setSlider", value: -5 }).slider).toBe(KNOB.min);
  });

  test("a chapter without a knob has no slider to set", () => {
    const noKnob = initialState(chapters, "attention", { move: false, start: "done" });
    expect(noKnob.slider).toBe(0);
    expect(run(noKnob, { type: "setSlider", value: 3 })).toBe(noKnob);
  });

  test("moving the slider marks it set until the next arrival", () => {
    expect(yours.sliderSet).toBe(false);
    const set = run(yours, { type: "setSlider", value: 3 });
    expect(set.sliderSet).toBe(true);
    expect(run(set, { type: "goto", chapter: "autocomplete" }).sliderSet).toBe(false);
  });

  test("a loop that plays the slider shows its value until the reader moves it", () => {
    const def: ChapterDef = { ...base, slider: { ...KNOB, loop: "bars" } };
    expect(shownSlider(yours, def, 7.4)).toBe(7);
    expect(shownSlider(yours, def, 99)).toBe(KNOB.max);
    expect(shownSlider(yours, def, null)).toBe(yours.slider);
    expect(shownSlider(yours, base, 7)).toBe(yours.slider);
    const set = run(yours, { type: "setSlider", value: 3 });
    expect(shownSlider(set, def, 7)).toBe(3);
  });

  test("a scenario the chapter doesn't have is ignored", () => {
    expect(run(yours, { type: "setScenario", scenario: "nope" })).toBe(yours);
  });

  test("typing replaces the scenario, and clearing it returns to the loop's inputs", () => {
    const withScenario = run(yours, { type: "setScenario", scenario: "once" });
    const typed = run(withScenario, { type: "setText", text: "happy" });
    expect(typed).toMatchObject({ text: "happy", scenario: null });
    expect(run(typed, { type: "setText", text: "" }).text).toBeNull();
    expect(run(typed, { type: "setScenario", scenario: "once" }).text).toBeNull();
    expect(run(typed, { type: "goto", chapter: "autocomplete" }).text).toBeNull();
  });
});

describe("ladder and Next", () => {
  test("Next is shut until the lesson ends or is skipped; ← is always open", () => {
    const at1 = live("tokenizer");
    expect(run(at1, { type: "next" })).toBe(at1);
    expect(run(at1, { type: "prev" }).chapter).toBe("autocomplete");
    expect(run(yours, { type: "next" }).chapter).toBe("tokenizer");
  });

  test("the ladder jumps anywhere, whatever the lesson", () => {
    expect(run(live(), { type: "goto", chapter: "attention" }).chapter).toBe("attention");
  });

  test("every arrival opens the lesson afresh, even at the same chapter", () => {
    const touched = run(
      yours,
      { type: "setSlider", value: 9 },
      { type: "toggleTechnical" },
      { type: "toggleLabelMode" },
    );
    const again = run(touched, { type: "goto", chapter: "autocomplete" });
    expect(again).toMatchObject({
      lesson: "arriving",
      paused: false,
      visit: touched.visit + 1,
      loopEpoch: touched.loopEpoch + 1,
      slider: KNOB.initial,
      technicalOpen: false,
      labelMode: "technical",
    });
  });

  test("a completed chapter keeps Next open when revisited, from its first moment", () => {
    const back = run(yours, { type: "next" }, { type: "prev" });
    expect(back).toMatchObject({ chapter: "autocomplete", lesson: "arriving" });
    expect(nextUnlocked(back)).toBe(true);
  });

  test("completion remembered from an earlier visit opens Next at once", () => {
    const remembered = live("autocomplete", ["autocomplete"]);
    expect(remembered.lesson).toBe("arriving");
    expect(run(remembered, { type: "next" }).chapter).toBe("tokenizer");
    // Only that chapter: the next one still has its lesson to play.
    expect(nextUnlocked(run(remembered, { type: "next" }))).toBe(false);
  });

  test("→ at the last written chapter and ← at the first are no-ops", () => {
    const last = initialState(chapters, "attention", LIVE, ["attention"]);
    expect(run(last, { type: "next" })).toBe(last);
    expect(run(live(), { type: "prev" })).toEqual(live());
  });

  test("→ and ← skip chapters that are not written yet", () => {
    const at1 = run(yours, { type: "next" });
    expect(at1.chapter).toBe("tokenizer");
    const done1 = run(at1, lesson("moved"), lesson("start"), lesson("skip"));
    expect(run(done1, { type: "next" }).chapter).toBe("attention");
    expect(run(done1, { type: "next" }, { type: "prev" }).chapter).toBe("tokenizer");
  });

  test("goto an unwritten chapter is a no-op", () => {
    expect(run(start, { type: "goto", chapter: "mlp" })).toBe(start);
  });

  test("/#N picks the chapter by display number, only if it is written", () => {
    expect(chapterFromHash("#0", chapters)).toBe("autocomplete");
    expect(chapterFromHash("#4", chapters)).toBe("attention");
    expect(chapterFromHash("#7", chapters)).toBeUndefined();
    expect(chapterFromHash("#99", chapters)).toBeUndefined();
    expect(chapterFromHash("#attention", chapters)).toBeUndefined();
  });
});

describe("keys", () => {
  const key = (k: string, state: AppState) => actionForKey({ key: k }, state);
  const briefing = run(live(), lesson("moved"));

  test("→ steps on only when Next is open; ← always steps back", () => {
    expect(key("ArrowRight", start)).toBeNull();
    expect(key("ArrowRight", yours)).toEqual({ type: "next" });
    expect(key("ArrowLeft", start)).toEqual({ type: "prev" });
    expect(actionForKey({ key: "ArrowRight", metaKey: true }, yours)).toBeNull();
  });

  test("Enter or Space starts from the brief; Space pauses the pass; neither acts after", () => {
    expect(key("Enter", briefing)).toEqual(lesson("start"));
    expect(key(" ", briefing)).toEqual(lesson("start"));
    expect(key(" ", start)).toEqual({ type: "togglePause" });
    expect(key("Enter", start)).toBeNull();
    expect(key(" ", yours)).toBeNull();
    expect(key(" ", live())).toBeNull();
  });

  test("? and Esc handle help; other keys pass through", () => {
    expect(key("?", start)).toEqual({ type: "toggleHelp" });
    expect(key("1", start)).toBeNull();
    expect(key("Escape", start)).toBeNull();
    expect(key("Escape", { ...start, helpOpen: true })).toEqual({ type: "toggleHelp" });
  });
});
