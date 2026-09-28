import { describe, expect, test } from "bun:test";
import { autocomplete } from "../src/chapters/data/autocomplete.ts";
import type { ChapterDef, ChapterSlug } from "../src/chapters/types.ts";
import {
  chapterFromHash,
  initialState,
  reduce,
  shownSlider,
  type Action,
  type AppState,
  type Chapters,
} from "../src/state/app-state.ts";
import { actionForKey } from "../src/state/keys.ts";

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
const start = initialState(chapters, "autocomplete");

describe("ladder", () => {
  test("→ at the last written chapter and ← at the first are no-ops", () => {
    const last = initialState(chapters, "attention");
    expect(run(last, { type: "next" })).toBe(last);
    expect(run(start, { type: "prev" })).toBe(start);
  });

  test("→ and ← skip chapters that are not written yet", () => {
    const at1 = run(start, { type: "next" });
    expect(at1.chapter).toBe("tokenizer");
    expect(run(at1, { type: "next" }).chapter).toBe("attention");
    expect(run(at1, { type: "next" }, { type: "prev" }).chapter).toBe("tokenizer");
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

describe("loop (D32)", () => {
  test("every scene control pauses the loop, and ▶ resumes it", () => {
    const controls: Action[] = [
      { type: "setSlider", value: 3 },
      { type: "setScenario", scenario: "once" },
      { type: "setText", text: "the" },
    ];
    for (const control of controls) {
      const paused = run(start, control);
      expect({ control, playing: paused.playing }).toEqual({ control, playing: false });
      expect(run(paused, { type: "togglePlay" }).playing).toBe(true);
    }
  });

  test("reading aids don't pause the loop", () => {
    for (const type of ["toggleLabelMode", "toggleTechnical", "toggleHelp"] as const)
      expect(run(start, { type }).playing).toBe(true);
  });

  test("goto restarts the loop and resets the chapter's controls, even for the same chapter", () => {
    const touched = run(
      start,
      { type: "setSlider", value: 9 },
      { type: "toggleTechnical" },
      { type: "toggleLabelMode" },
    );
    const again = run(touched, { type: "goto", chapter: "autocomplete" });
    expect(again).toMatchObject({
      playing: true,
      loopEpoch: start.loopEpoch + 1,
      slider: KNOB.initial,
      technicalOpen: false,
      labelMode: "technical",
    });
  });

  test("arriving by ← / → also restarts the loop", () => {
    const paused = run(start, { type: "togglePlay" });
    const at1 = run(paused, { type: "next" });
    expect(at1).toMatchObject({ playing: true, loopEpoch: start.loopEpoch + 1 });
  });
});

describe("typed text", () => {
  test("typing replaces the scenario, and clearing it returns to the loop's inputs", () => {
    const withScenario = run(start, { type: "setScenario", scenario: "once" });
    const typed = run(withScenario, { type: "setText", text: "happy" });
    expect(typed).toMatchObject({ text: "happy", scenario: null, playing: false });
    expect(run(typed, { type: "setText", text: "" }).text).toBeNull();
    expect(run(typed, { type: "setScenario", scenario: "once" }).text).toBeNull();
    expect(run(typed, { type: "goto", chapter: "autocomplete" }).text).toBeNull();
  });
});

describe("controls", () => {
  test("the slider snaps to its step and stays in range", () => {
    expect(run(start, { type: "setSlider", value: 3.4 }).slider).toBe(3);
    expect(run(start, { type: "setSlider", value: 99 }).slider).toBe(KNOB.max);
    expect(run(start, { type: "setSlider", value: -5 }).slider).toBe(KNOB.min);
  });

  test("a chapter without a knob has no slider to set", () => {
    const noKnob = initialState(chapters, "attention");
    expect(noKnob.slider).toBe(0);
    expect(run(noKnob, { type: "setSlider", value: 3 })).toBe(noKnob);
  });

  test("moving the slider marks it set until the next arrival", () => {
    expect(start.sliderSet).toBe(false);
    const set = run(start, { type: "setSlider", value: 3 });
    expect(set.sliderSet).toBe(true);
    expect(run(set, { type: "goto", chapter: "autocomplete" }).sliderSet).toBe(false);
  });

  test("a loop that plays the slider shows its value until the reader moves it", () => {
    const def: ChapterDef = { ...base, slider: { ...KNOB, loop: "bars" } };
    expect(shownSlider(start, def, 7.4)).toBe(7);
    expect(shownSlider(start, def, 99)).toBe(KNOB.max);
    expect(shownSlider(start, def, null)).toBe(start.slider);
    expect(shownSlider(start, base, 7)).toBe(start.slider);
    const set = run(start, { type: "setSlider", value: 3 });
    expect(shownSlider(set, def, 7)).toBe(3);
  });

  test("a scenario the chapter doesn't have is ignored", () => {
    expect(run(start, { type: "setScenario", scenario: "nope" })).toBe(start);
  });
});

describe("keys", () => {
  const key = (k: string, state = start) => actionForKey({ key: k }, state);

  test("arrows step the ladder, Space is ▶, ? and Esc handle help, modifiers pass through", () => {
    expect(key("ArrowRight")).toEqual({ type: "next" });
    expect(key("ArrowLeft")).toEqual({ type: "prev" });
    expect(key(" ")).toEqual({ type: "togglePlay" });
    expect(key("?")).toEqual({ type: "toggleHelp" });
    expect(key("1")).toBeNull();
    expect(key("Escape")).toBeNull();
    expect(key("Escape", { ...start, helpOpen: true })).toEqual({ type: "toggleHelp" });
    expect(actionForKey({ key: "ArrowRight", metaKey: true }, start)).toBeNull();
  });
});
