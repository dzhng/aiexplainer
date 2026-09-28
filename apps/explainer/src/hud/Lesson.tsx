/**
 * The lesson's HUD (`state/lesson.ts`): the brief card over the scene with its Start button,
 * the lesson bar at the head of the story panel (watching with Skip, or your turn with
 * Replay), and the Next button under the left column. Each dispatches the same actions as
 * the keyboard.
 */
import { useEffect, useRef, type Dispatch } from "react";
import { chapterName } from "../chapters/ladder.ts";
import type { ChapterDef } from "../chapters/types.ts";
import {
  neighbour,
  nextUnlocked,
  writtenChapters,
  type Action,
  type AppState,
  type Chapters,
} from "../state/app-state.ts";
import css from "./hud.module.css";
import { ChevronIcon, PauseIcon, PlayIcon, ReplayIcon, SkipIcon } from "./icons.tsx";

interface LessonProps {
  state: AppState;
  dispatch: Dispatch<Action>;
  def: ChapterDef;
}

/** The brief: what the lesson is about and what to watch for, then Start (Enter). */
export function LessonBrief({ dispatch, def, motion }: LessonProps & { motion: boolean }) {
  return (
    <div className={css.briefStage}>
      <section
        className={`${css.box} ${css.brief} ${motion ? css.briefIn : ""}`}
        data-crop="panel:brief"
        aria-labelledby="lesson-brief-title"
      >
        <p className={css.briefKicker}>{chapterName(def.slug)} · the lesson</p>
        <h2 className={css.briefTitle} id="lesson-brief-title">
          {def.title}
        </h2>
        <p className={css.briefText}>{def.brief.join(" ")}</p>
        <div className={css.briefFoot}>
          <button
            className={css.start}
            // The brief is the page's one call to action: Enter or Space presses it at once.
            autoFocus
            onClick={() => dispatch({ type: "lesson", event: "start" })}
          >
            <PlayIcon />
            Start the lesson
          </button>
          <span className={css.keyHint}>
            or press <kbd>Enter</kbd>
          </span>
        </div>
      </section>
    </div>
  );
}

/**
 * The head of the story panel: before the lesson, a note that the controls come after it;
 * while it plays, its progress with pause and Skip; after it, "Your turn" with Replay.
 */
export function LessonBar({
  state,
  dispatch,
  def,
  progress,
}: LessonProps & { progress: () => number | null }) {
  if (state.lesson === "yourTurn")
    return (
      <div className={`${css.lessonBar} ${css.lessonYours}`}>
        <div className={css.lessonHead}>
          <span className={css.lessonTitle}>Your turn</span>
          <button
            className={css.lessonAction}
            onClick={() => dispatch({ type: "lesson", event: "replay" })}
          >
            <ReplayIcon />
            Replay lesson
          </button>
        </div>
        <p className={css.lessonNote}>{yourTurnNote(def)}</p>
      </div>
    );
  if (state.lesson === "playing")
    return (
      <div className={css.lessonBar}>
        <div className={css.lessonHead}>
          <span className={css.lessonTitle}>Watch the lesson</span>
          <button
            className={css.iconButton}
            aria-label={state.paused ? "Resume the lesson" : "Pause the lesson"}
            title={state.paused ? "Resume the lesson (Space)" : "Pause the lesson (Space)"}
            onClick={() => dispatch({ type: "togglePause" })}
          >
            {state.paused ? <PlayIcon /> : <PauseIcon />}
          </button>
          <button
            className={css.lessonAction}
            onClick={() => dispatch({ type: "lesson", event: "skip" })}
          >
            <SkipIcon />
            Skip
          </button>
        </div>
        <Progress progress={progress} />
        <p className={css.lessonNote}>The controls below are yours when it ends.</p>
      </div>
    );
  return (
    <div className={css.lessonBar}>
      <p className={css.lessonNote}>The controls below are yours once the lesson has played.</p>
    </div>
  );
}

/** What the reader can do on their turn, naming only the controls this chapter has. */
function yourTurnNote(def: ChapterDef): string {
  const verbs = [
    def.model !== null && "type your own text",
    def.scenarios.length > 0 && "try an example",
    def.slider && "turn the knob",
  ].filter((v): v is string => typeof v === "string");
  if (verbs.length === 0) return "Look around: drag to orbit the scene.";
  const list =
    verbs.length === 1 ? verbs[0]! : `${verbs.slice(0, -1).join(", ")} or ${verbs.at(-1)}`;
  return `${list[0]!.toUpperCase()}${list.slice(1)}: the scene follows you.`;
}

/**
 * The pass's progress, 0–1, drawn every animation frame straight onto the bar (no React
 * render per frame). It reads the scene's own loop time, so a held clock shows its time.
 */
function Progress({ progress }: { progress: () => number | null }) {
  const fill = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const p = progress();
      if (fill.current) fill.current.style.scale = `${Math.min(1, Math.max(0, p ?? 0))} 1`;
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [progress]);
  return (
    <span className={css.progress} aria-hidden>
      <span className={css.progressFill} ref={fill} />
    </span>
  );
}

/**
 * Next: the next chapter, open once this chapter's lesson ended or was skipped. The last
 * chapter's goes back to the intro instead.
 */
export function NextButton({ state, dispatch, chapters }: LessonProps & { chapters: Chapters }) {
  const open = nextUnlocked(state);
  const next = neighbour(state, chapters, 1);
  const first = writtenChapters(chapters)[0]!;
  const kicker = next ? `Next · ${chapterName(next)}` : "You built the whole machine";
  const title = next ? chapters[next]!.title : "Back to the intro";
  return (
    <button
      className={`${css.box} ${css.next}`}
      data-crop="panel:next"
      data-intro="left"
      disabled={!open}
      aria-label={next ? `Next: ${chapterName(next)}, ${title}` : title}
      onClick={() => dispatch(next ? { type: "next" } : { type: "goto", chapter: first })}
    >
      <span className={css.nextKicker}>{kicker}</span>
      <span className={css.nextTitle}>
        {title}
        <ChevronIcon />
      </span>
      {!open && <span className={css.nextNote}>Opens when the lesson ends, or skip it</span>}
    </button>
  );
}
