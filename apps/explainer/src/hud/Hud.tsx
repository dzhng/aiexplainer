/**
 * The HUD over the canvas, drawn from the current `ChapterDef` and `AppState`: the title panel
 * (top left), the controls (top right), the chapter ladder (bottom), the corner links, and the
 * help panel. Every control dispatches an `Action`; the keyboard (`state/keys.ts`) sends the same.
 */
import type { LoadedModel } from "@repo/llm";
import { useState, type CSSProperties, type Dispatch } from "react";
import { LADDER, displayNumber } from "../chapters/ladder.ts";
import type { ChapterDef, ViewMode } from "../chapters/types.ts";
import { hashFor, type Action, type AppState, type Chapters } from "../state/app-state.ts";
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
import { StatChip } from "./StatChip.tsx";

const SERIES_TITLE = "How LLMs work, from first principles";
const X_PROFILE = "https://x.com/dzhng";
const VIEW_NAMES: Record<ViewMode, string> = {
  whole: "Whole",
  cutaway: "Cutaway",
  exploded: "Exploded",
};

export interface HudProps {
  state: AppState;
  dispatch: Dispatch<Action>;
  def: ChapterDef;
  chapters: Chapters;
  /** The chapter's model, once loaded; `null` before then or for a chapter without one. */
  model: LoadedModel | null;
}

export function Hud(props: HudProps) {
  return (
    <div className={css.hud}>
      <TitlePanel {...props} />
      <Controls {...props} />
      <Ladder {...props} />
      <Corner {...props} />
      {props.state.helpOpen && <Help {...props} />}
    </div>
  );
}

function TitlePanel({ state, dispatch, def, model }: HudProps) {
  const caption = (state.follow && def.caption.byFollow[state.follow]) || def.caption.default;
  return (
    <header className={css.tl} data-crop="panel:tl">
      <div className={css.brand}>
        <BrandMark />
        dzhng
      </div>
      <p className={css.series}>{SERIES_TITLE}</p>
      <h1 className={css.title}>
        <span className={css.titleNum}>{displayNumber(def.slug)}</span>
        {def.title}
      </h1>
      <p className={css.why}>{def.why}</p>
      <div className={css.stats}>
        {def.stats.map((stat) => (
          <StatChip key={stat.id} stat={stat} model={model} />
        ))}
      </div>
      <section className={`${css.box} ${css.caption}`} aria-live="polite">
        <p>{caption.story.join(" ")}</p>
        <button
          className={css.precisely}
          aria-expanded={state.precisionOpen}
          onClick={() => dispatch({ type: "togglePrecisely" })}
        >
          <ChevronIcon />
          Precisely
        </button>
        {state.precisionOpen && <p className={css.preciseText}>{caption.precisely}</p>}
      </section>
    </header>
  );
}

interface SegmentedProps<T> {
  label: string;
  options: { value: T; label: string }[];
  selected: T;
  onSelect: (value: T) => void;
}

function Segmented<T>({ label, options, selected, onSelect }: SegmentedProps<T>) {
  return (
    <div className={css.seg} role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.label} aria-pressed={o.value === selected} onClick={() => onSelect(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Controls({ state, dispatch, def }: HudProps) {
  const { slider } = def;
  const fill = ((state.slider - slider.min) / (slider.max - slider.min || 1)) * 100;
  const followKeys = def.follow.length > 0 ? `keys 1–${def.follow.length + 1}` : "";
  return (
    <nav className={`${css.box} ${css.tr}`} data-crop="panel:tr" aria-label="Controls">
      <div className={css.group}>
        <div className={css.groupHead}>
          Follow <span className={css.keys}>{followKeys}</span>
        </div>
        <Segmented
          label="Follow"
          options={[
            { value: null, label: "All" },
            ...def.follow.map((f) => ({ value: f.id as string | null, label: f.label })),
          ]}
          selected={state.follow}
          onSelect={(follow) => dispatch({ type: "setFollow", follow })}
        />
      </div>
      <div className={css.group}>
        <label className={css.groupHead} htmlFor="hud-slider">
          {slider.label}
        </label>
        <div className={css.slider}>
          <input
            id="hud-slider"
            type="range"
            min={slider.min}
            max={slider.max}
            step={slider.step}
            value={state.slider}
            style={{ "--fill": `${fill}%` } as CSSProperties}
            onChange={(e) => dispatch({ type: "setSlider", value: Number(e.target.value) })}
          />
          <output className={css.sliderValue} htmlFor="hud-slider">
            {state.slider}
          </output>
        </div>
      </div>
      {def.scenarios.length > 0 && (
        <div className={css.group}>
          <div className={css.groupHead}>Try</div>
          <Segmented
            label="Try a prompt"
            options={def.scenarios.map((s) => ({
              value: s.id as string | null,
              // A scenario is a prompt the machine continues, so it reads as quoted, unfinished text.
              label: `“${s.label}…”`,
            }))}
            selected={state.scenario}
            onSelect={(id) =>
              dispatch({ type: "setScenario", scenario: id === state.scenario ? null : id })
            }
          />
        </div>
      )}
      <div className={css.group}>
        <div className={css.groupHead}>View</div>
        <div className={css.groupRow}>
          <Segmented
            label="View"
            options={def.views.map((v) => ({ value: v, label: VIEW_NAMES[v] }))}
            selected={state.view}
            onSelect={(view) => dispatch({ type: "setView", view })}
          />
          <button
            className={css.iconButton}
            aria-label={state.playing ? "Pause the loop" : "Play the loop"}
            title={state.playing ? "Pause (Space)" : "Play (Space)"}
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

function Ladder({ state, dispatch, chapters }: HudProps) {
  return (
    <nav className={`${css.box} ${css.ladder}`} data-crop="panel:ladder" aria-label="Chapters">
      {LADDER.map((slug, n) => {
        const def = chapters[slug];
        if (slug === state.chapter && def)
          return (
            <button key={slug} className={css.rung} aria-current="step" title={def.title}>
              <span className={css.rungDot} />
              <span className={css.rungNum}>{n}</span>
              {def.title}
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

function Corner({ state, dispatch, def }: HudProps) {
  const [copied, setCopied] = useState(false);
  const share = () => {
    const url = `${location.origin}/${hashFor(def.slug)}`;
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      // Clipboard access can be refused (permissions, insecure context): show the link instead.
      () => window.prompt("Copy this link", url),
    );
  };
  return (
    <div className={css.corner} data-crop="panel:corner">
      <Segmented
        label="Label reading"
        options={[
          { value: "analogy", label: "Analogy" },
          { value: "precise", label: "Precise" },
        ]}
        selected={state.labelMode}
        onSelect={(mode) => mode !== state.labelMode && dispatch({ type: "toggleLabelMode" })}
      />
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
