/**
 * The HUD over the canvas, drawn from the current `ChapterDef` and `AppState`. One column on
 * the left reads top to bottom: the title panel (what this chapter is and says), then the
 * story panel, every scene control in the order a reader meets them (type your own text, or
 * try an example, turn the knob, follow a part, the label wording, play and help), numbered,
 * with the steps a chapter doesn't have left out. The scene keeps the rest of the screen; the
 * ladder sits at the bottom and the share links in the corner. Every control dispatches an
 * `Action`; the keyboard (`state/keys.ts`) sends the same.
 */
import type { ModelSource } from "@repo/llm";
import { useRef, useState, type CSSProperties, type Dispatch, type ReactNode } from "react";
import { LADDER, displayNumber } from "../chapters/ladder.ts";
import type { ChapterDef, SliderDef } from "../chapters/types.ts";
import { BRAND_NAME, SERIES_TITLE, X_PROFILE } from "../look/brand.ts";
import { sharePathFor, type Action, type AppState, type Chapters } from "../state/app-state.ts";
import { copyOrShow } from "../fallback/copy.ts";
import { Help } from "./Help.tsx";
import css from "./hud.module.css";
import {
  BrandMark,
  ChevronIcon,
  HelpIcon,
  PauseIcon,
  PlayIcon,
  ShareIcon,
  XIcon,
} from "./icons.tsx";
import { prefersReducedMotion, useArrivalIntro } from "./motion.ts";
import { liveModel } from "./live.ts";
import { StatChip } from "./StatChip.tsx";

export interface HudProps {
  state: AppState;
  dispatch: Dispatch<Action>;
  def: ChapterDef;
  chapters: Chapters;
  /** The chapter's model, once loaded; `null` before then or for a chapter without one. */
  model: ModelSource | null;
  /** Decorative motion is allowed (a live clock); reduced-motion readers still get none. */
  motion: boolean;
  /**
   * The slider value to show: the reader's, or the loop's while the loop still plays the
   * slider (`SliderDef.loop`). Chips that follow the slider read this too.
   */
  slider: number;
  /** The text the scene's last finished run answered (`null`: the loop's own inputs). */
  answered: string | null;
}

export function Hud(props: HudProps) {
  const root = useRef<HTMLDivElement>(null);
  const [reduced] = useState(prefersReducedMotion);
  const motion = props.motion && !reduced;
  // Arrival is the chapter's loop epoch (it bumps on every arrival, D32).
  useArrivalIntro(root, props.state.loopEpoch, motion);
  const hudProps = { ...props, motion };
  return (
    <div className={css.hud} ref={root} data-hud>
      <div className={css.column}>
        <TitlePanel {...hudProps} />
        <StoryPanel {...hudProps} />
      </div>
      <Ladder {...hudProps} />
      <Corner {...hudProps} />
      {props.state.helpOpen && <Help {...hudProps} />}
    </div>
  );
}

function TitlePanel({ state, dispatch, def, model, motion, slider }: HudProps) {
  const caption = (state.follow && def.caption.byFollow[state.follow]) || def.caption.default;
  return (
    <header className={css.tl} data-crop="panel:tl" data-intro="left">
      <div className={css.brand}>
        <BrandMark />
        {BRAND_NAME}
      </div>
      <p className={css.series}>{SERIES_TITLE}</p>
      <h1 className={css.title}>
        <span className={css.titleNum}>{displayNumber(def.slug)}</span>
        {def.title}
      </h1>
      <p className={css.why}>{def.why}</p>
      <div className={css.stats}>
        {def.stats.map((stat) => (
          <StatChip
            key={stat.id}
            stat={stat}
            model={model}
            slider={slider}
            countKey={motion ? state.loopEpoch : null}
          />
        ))}
      </div>
      <section className={`${css.box} ${css.caption}`} aria-live="polite">
        <p>{caption.story.join(" ")}</p>
        <button
          className={css.technical}
          aria-expanded={state.technicalOpen}
          onClick={() => dispatch({ type: "toggleTechnical" })}
        >
          <ChevronIcon />
          Technical
        </button>
        {state.technicalOpen && <p className={css.technicalText}>{caption.technical}</p>}
      </section>
    </header>
  );
}

/**
 * The reader's own text, the chapter's call to action: it says a real model is running (and
 * which kind, honestly), invites typing, and once the run has answered, says who answered.
 */
function LivePrompt({ state, dispatch, def, model, answered }: HudProps) {
  const live = model ? liveModel(model) : null;
  const scenario = def.scenarios.find((s) => s.id === state.scenario);
  const asked = state.text ?? scenario?.prompt ?? null;
  const status = !live
    ? "loading the model…"
    : asked === null
      ? live.invite
      : answered === asked
        ? live.receipt
        : "running…";
  return (
    <label className={css.prompt} data-crop="panel:prompt">
      <span className={css.promptRow}>
        <input
          className={css.promptInput}
          type="text"
          value={state.text ?? ""}
          placeholder="Type anything…"
          aria-label="Your text"
          spellCheck={false}
          autoComplete="off"
          maxLength={80}
          onChange={(e) => dispatch({ type: "setText", text: e.target.value })}
        />
      </span>
      {status && (
        <span className={css.receipt} aria-live="polite">
          {status}
        </span>
      )}
    </label>
  );
}

interface SegmentedProps<T> {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
  /** Extra classes: `css.box` frames a free-standing group, `css.quoted` keeps prompt case. */
  className?: string;
}

function Segmented<T>({ label, options, selected, onSelect, className }: SegmentedProps<T>) {
  return (
    <div className={`${css.seg} ${className ?? ""}`} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.label} aria-pressed={o.value === selected} onClick={() => onSelect(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** One numbered step of the story panel; `aside` sits at the end of its heading. */
function Step({
  n,
  title,
  aside,
  children,
}: {
  n: number;
  title: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={css.step}>
      <div className={css.stepHead}>
        <span className={css.stepNum}>{n}</span>
        {title}
        {aside && <span className={css.stepAside}>{aside}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * Every scene control, in story order. A step shows only where the chapter has it, and the
 * numbers count the steps shown.
 */
function StoryPanel(props: HudProps) {
  const { state, dispatch, def, slider: value, motion } = props;
  const steps: { title: string; aside?: ReactNode; body: ReactNode }[] = [];
  if (def.model !== null)
    steps.push({
      title: "Type your own text",
      aside: (
        <span className={css.live} title="Running in your browser, on your device">
          <span className={`${css.liveDot} ${motion ? css.livePulse : ""}`} aria-hidden />
          Live
        </span>
      ),
      body: <LivePrompt {...props} />,
    });
  if (def.scenarios.length > 0)
    steps.push({
      title: def.model !== null ? "Or try an example" : "Try an example",
      body: (
        <Segmented
          label="Try an example"
          options={def.scenarios.map((s) => ({
            value: s.id as string | null,
            // A scenario is a prompt the machine continues, so it reads as quoted, unfinished text.
            label: `“${s.label}…”`,
          }))}
          selected={state.scenario}
          onSelect={(id) =>
            dispatch({ type: "setScenario", scenario: id === state.scenario ? null : id })
          }
          className={css.quoted}
        />
      ),
    });
  if (def.slider)
    steps.push({
      title: `Turn the knob: ${def.slider.label}`,
      body: <Knob slider={def.slider} value={value} dispatch={dispatch} />,
    });
  steps.push({
    title: "Follow a part",
    aside:
      def.follow.length > 0 ? (
        <span className={css.keys}>keys 1–{def.follow.length + 1}</span>
      ) : undefined,
    body: (
      <Segmented
        label="Follow a part"
        options={[
          { value: null, label: "All" },
          ...def.follow.map((f) => ({ value: f.id as string | null, label: f.label })),
        ]}
        selected={state.follow}
        onSelect={(follow) => dispatch({ type: "setFollow", follow })}
      />
    ),
  });
  return (
    <nav
      className={`${css.box} ${css.story}`}
      data-crop="panel:story"
      data-intro="left"
      aria-label="Controls"
    >
      {steps.map((step, i) => (
        <Step key={step.title} n={i + 1} title={step.title} aside={step.aside}>
          {step.body}
        </Step>
      ))}
      <div className={css.storyFoot}>
        <div className={css.labelMode} title={LABEL_MODE_HINT}>
          <span className={css.labelModeHead}>Labels</span>
          <Segmented
            label={LABEL_MODE_HINT}
            options={[
              { value: "analogy", label: "Analogy" },
              { value: "technical", label: "Technical" },
            ]}
            selected={state.labelMode}
            onSelect={(mode) => mode !== state.labelMode && dispatch({ type: "toggleLabelMode" })}
          />
        </div>
        <div className={css.loopControls}>
          <button
            className={css.iconButton}
            aria-label={state.playing ? "Pause the loop" : "Play the loop"}
            title={state.playing ? "Pause the loop (Space)" : "Play the loop (Space)"}
            onClick={() => dispatch({ type: "togglePlay" })}
          >
            {state.playing ? <PauseIcon /> : <PlayIcon />}
          </button>
          <button
            className={css.iconButton}
            aria-label="Help"
            aria-pressed={state.helpOpen}
            title="Help (?)"
            onClick={() => dispatch({ type: "toggleHelp" })}
          >
            <HelpIcon />
          </button>
        </div>
      </div>
    </nav>
  );
}

/** What the label toggle does, for its tooltip and screen readers. */
const LABEL_MODE_HINT = "Label wording: the everyday analogy or the technical term";

/** The chapter's one knob: a real quantity of the mechanism, live in the scene and the chips. */
function Knob({
  slider,
  value,
  dispatch,
}: {
  slider: SliderDef;
  value: number;
  dispatch: Dispatch<Action>;
}) {
  const fill = ((value - slider.min) / (slider.max - slider.min || 1)) * 100;
  return (
    <>
      <div className={css.slider}>
        <input
          id="hud-slider"
          type="range"
          aria-label={slider.label}
          min={slider.min}
          max={slider.max}
          step={slider.step}
          value={value}
          style={{ "--fill": `${fill}%` } as CSSProperties}
          onChange={(e) => dispatch({ type: "setSlider", value: Number(e.target.value) })}
        />
        <output className={css.sliderValue} htmlFor="hud-slider">
          {value === slider.max && slider.maxLabel ? slider.maxLabel : value}
        </output>
      </div>
      <p className={css.hint}>{slider.hint}</p>
    </>
  );
}

function Ladder({ state, dispatch, chapters }: HudProps) {
  return (
    <nav
      className={`${css.box} ${css.ladder}`}
      data-crop="panel:ladder"
      data-intro="below"
      aria-label="Chapters"
    >
      {LADDER.map((slug, n) => {
        const def = chapters[slug];
        if (slug === state.chapter && def)
          return (
            <button key={slug} className={css.rung} aria-current="step" title={def.title}>
              <span className={css.rungDot} />
              <span className={css.rungNum}>{n}</span>
              <span className={css.rungTitle}>{def.title}</span>
            </button>
          );
        return (
          <button
            key={slug}
            className={css.rung}
            disabled={!def}
            title={def ? `${n} · ${def.title}` : `Chapter ${n} is coming soon`}
            aria-label={def ? `Chapter ${n}: ${def.title}` : `Chapter ${n}, coming soon`}
            onClick={() => dispatch({ type: "goto", chapter: slug })}
          >
            {n}
          </button>
        );
      })}
    </nav>
  );
}

function Corner({ def }: HudProps) {
  const [copied, setCopied] = useState(false);
  const share = () => {
    // The share route carries the chapter's own link-preview card, then opens `/#N` (D34).
    const url = `${location.origin}${sharePathFor(def.slug)}`;
    void copyOrShow(url, navigator.clipboard, (link) => window.prompt("Copy this link", link)).then(
      (copied) => {
        if (!copied) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
    );
  };
  return (
    <div className={css.corner} data-crop="panel:corner" data-intro="below">
      <button
        className={`${css.box} ${css.pill} ${copied ? "" : css.pillSquare}`}
        aria-label="Copy a link to this chapter"
        title="Copy a link to this chapter"
        onClick={share}
      >
        <ShareIcon />
        {copied && "Link copied"}
      </button>
      <a className={`${css.box} ${css.pill}`} href={X_PROFILE} target="_blank" rel="noreferrer">
        <XIcon />
        Follow on X
      </a>
    </div>
  );
}
