import { describe, expect, test } from "bun:test";
import {
  COMPLETED_KEY,
  lessonStartFromSearch,
  lessonStep,
  lessonTime,
  loadCompleted,
  saveCompleted,
  type CompletionStore,
  type LessonEvent,
  type LessonPhase,
} from "../src/state/lesson.ts";

describe("transitions", () => {
  const PHASES: LessonPhase[] = ["arriving", "briefing", "playing", "yourTurn"];
  const EVENTS: LessonEvent[] = ["moved", "start", "end", "skip", "replay"];

  test("exactly the flow's edges exist; every other event is ignored", () => {
    const edges: string[] = [];
    for (const phase of PHASES)
      for (const event of EVENTS) {
        const to = lessonStep(phase, event, "brief");
        if (to !== null) edges.push(`${phase} -${event}-> ${to}`);
      }
    expect(edges).toEqual([
      "arriving -moved-> briefing",
      "briefing -start-> playing",
      "playing -end-> yourTurn",
      "playing -skip-> yourTurn",
      "yourTurn -replay-> playing",
    ]);
  });

  test("the move lands where the page opens chapters", () => {
    expect(lessonStep("arriving", "moved", "play")).toBe("playing");
    expect(lessonStep("arriving", "moved", "done")).toBe("yourTurn");
  });
});

describe("loop time", () => {
  test("0 before the pass, the pass while it plays, the lesson's end after", () => {
    expect(lessonTime("arriving", 7, 18)).toBe(0);
    expect(lessonTime("briefing", 7, 18)).toBe(0);
    expect(lessonTime("playing", 7, 18)).toBe(7);
    expect(lessonTime("yourTurn", 7, 18)).toBe(18);
  });
});

describe("opening", () => {
  test("real time opens on the brief, a driven clock on the pass; ?lesson= overrides both", () => {
    expect(lessonStartFromSearch("", false)).toBe("brief");
    expect(lessonStartFromSearch("?clock=held&t=4", true)).toBe("play");
    expect(lessonStartFromSearch("?clock=held&lesson=brief", true)).toBe("brief");
    expect(lessonStartFromSearch("?lesson=done", false)).toBe("done");
    expect(lessonStartFromSearch("?lesson=bogus", false)).toBe("brief");
  });
});

describe("remembered completion", () => {
  const KNOWN = ["autocomplete", "tokenizer"] as const;
  const mapStore = (): CompletionStore & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    };
  };

  test("what is saved loads back, keeping only chapters the page knows", () => {
    const store = mapStore();
    saveCompleted(() => store, ["tokenizer", "autocomplete"]);
    expect(loadCompleted(() => store, KNOWN)).toEqual(["autocomplete", "tokenizer"]);
    store.data.set(COMPLETED_KEY, JSON.stringify(["tokenizer", "retired-chapter"]));
    expect(loadCompleted(() => store, KNOWN)).toEqual(["tokenizer"]);
  });

  test("an empty or garbled store reads as nothing completed", () => {
    const store = mapStore();
    expect(loadCompleted(() => store, KNOWN)).toEqual([]);
    store.data.set(COMPLETED_KEY, "{not json");
    expect(loadCompleted(() => store, KNOWN)).toEqual([]);
    store.data.set(COMPLETED_KEY, JSON.stringify({ autocomplete: true }));
    expect(loadCompleted(() => store, KNOWN)).toEqual([]);
  });

  test("storage that is unavailable or refuses is ignored: nothing loads, saving is a no-op", () => {
    const blocked = (): CompletionStore => {
      throw new Error("SecurityError: storage is disabled");
    };
    const refusing: CompletionStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(loadCompleted(blocked, KNOWN)).toEqual([]);
    expect(loadCompleted(() => refusing, KNOWN)).toEqual([]);
    expect(() => saveCompleted(blocked, ["autocomplete"])).not.toThrow();
    expect(() => saveCompleted(() => refusing, ["autocomplete"])).not.toThrow();
  });
});
