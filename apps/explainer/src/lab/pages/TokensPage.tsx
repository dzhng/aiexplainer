/**
 * `/lab/tokens`: the house style on one page (slice 13), the reference every chapter is
 * judged against. Each section is a specimen built from the same tokens and components the
 * app uses, so a token change shows here first:
 *   palette (DOM swatches, and through the real renderer and bloom at every emissive level),
 *   type scale, HUD panel, stat chips (once per scale), labels (both readings), flow rhythm,
 *   and the views (Whole, Cutaway, Exploded) on the chapter-0 board.
 * `?section=<id>` shows one section. The renderer sections are frames of their own lab
 * routes (`?section=emissive`, `/lab/scene/autocomplete?view=…`); the page is ready once
 * every frame is.
 */
import type { LoadedModel } from "@repo/llm";
import type { LabelPlacement } from "@repo/renderer";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { autocomplete } from "../../chapters/data/autocomplete.ts";
import { STAT_SCALES, type StatChip as StatChipDef, type StatScale } from "../../chapters/types.ts";
import hudCss from "../../hud/hud.module.css";
import { Labels, type LabelReading, type LabelsHandle } from "../../hud/Labels.tsx";
import { StatChip } from "../../hud/StatChip.tsx";
import { look, type PaletteToken, type TypeSize } from "../../look/look.ts";
import { fetchModel } from "../../runtime/models.ts";

/** One chip per scale, each resolved the way a chapter's chip would be. */
const SPECIMENS: Record<StatScale, StatChipDef> = {
  "this tiny model": {
    id: "scale-tiny",
    label: "chance of the top next word",
    format: "pct",
    scale: "this tiny model",
    value: { kind: "probe", probe: "top-successor" },
  },
  "Llama-3-8B": {
    id: "scale-llama",
    label: "parameters",
    format: "int",
    scale: "Llama-3-8B",
    value: { kind: "arith", fn: "params", args: {} },
  },
  "Llama-3-8B on H100 SXM": {
    id: "scale-h100",
    label: "fastest one reply can grow",
    format: "tok/s",
    scale: "Llama-3-8B on H100 SXM",
    value: {
      kind: "arith",
      fn: "decodeCeilingTokPerSec",
      args: { batch: 1, contextLen: 1024, weightBytes: 2, kvBytes: 2 },
    },
  },
  TinyStories: {
    id: "scale-tinystories",
    label: "words counted",
    format: "int",
    scale: "TinyStories",
    value: { kind: "model", metric: "training.tokensSeen" },
  },
};

const SECTIONS = ["palette", "type", "hud", "chips", "labels", "flow", "views"] as const;
type SectionId = (typeof SECTIONS)[number];

const s = {
  section: { marginBottom: 36 },
  h2: { fontSize: "var(--text-lg)", margin: "0 0 12px", color: "var(--ink)" },
  note: { fontSize: "var(--text-sm)", color: "var(--hud-muted)", margin: "0 0 12px" },
  row: { display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-start" },
  frame: { border: "1px solid var(--hud-line)", borderRadius: 8, background: "var(--bg-deep)" },
  caption: { fontSize: "var(--text-xs)", color: "var(--hud-muted)", marginTop: 4 },
} satisfies Record<string, CSSProperties>;

function Section({
  id,
  title,
  note,
  children,
}: {
  id: SectionId;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section style={s.section} data-crop={`section:${id}`}>
      <h2 style={s.h2}>{title}</h2>
      {note && <p style={s.note}>{note}</p>}
      {children}
    </section>
  );
}

/** A lab route in a frame; reports once that page's probe is ready. */
function LabFrame(props: {
  /** Render the page at full size and show it scaled by this (so its text keeps its proportions). */
  scale?: number;
  src: string;
  width: number;
  height: number;
  caption: string;
  onReady: () => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const { onReady } = props;
  const k = props.scale ?? 1;
  return (
    <figure style={{ margin: 0 }}>
      <div style={{ width: props.width * k, height: props.height * k, overflow: "hidden" }}>
        <iframe
          ref={ref}
          title={props.caption}
          src={props.src}
          width={props.width}
          height={props.height}
          style={{ ...s.frame, transform: `scale(${k})`, transformOrigin: "0 0" }}
          onLoad={() => {
            const probe = (ref.current?.contentWindow as Window | null)?.__explainer;
            if (probe) void probe.ready.then(onReady);
            else onReady();
          }}
        />
      </div>
      <figcaption style={s.caption}>{props.caption}</figcaption>
    </figure>
  );
}

function PaletteSection({ onReady }: { onReady: () => void }) {
  const tokens = Object.keys(look.palette) as PaletteToken[];
  const gains = Object.entries(look.materials.emissive)
    .map(([token, gain]) => `${token} ×${gain}`)
    .join(", ");
  return (
    <Section
      id="palette"
      title="Palette"
      note={`Each token as sRGB, then through the real renderer and bloom as an emissive swatch at 1×, 4× and 16× (rows, bottom up). Emissive gains in use: ${gains}.`}
    >
      <div style={{ ...s.row, marginBottom: 12 }}>
        {tokens.map((token) => (
          <div key={token} style={{ width: 96 }}>
            <div
              style={{
                height: 44,
                borderRadius: 6,
                background: look.palette[token],
                border: "1px solid var(--hud-line)",
              }}
            />
            <div style={s.caption}>
              {token}
              <br />
              {look.palette[token]}
            </div>
          </div>
        ))}
      </div>
      <LabFrame
        src="/lab/tokens?section=emissive"
        width={1100}
        height={420}
        caption="palette × emissive level, through bloom"
        onReady={onReady}
      />
    </Section>
  );
}

function TypeSection() {
  const sizes = Object.entries(look.type.sizePx) as [TypeSize, number][];
  return (
    <Section
      id="type"
      title="Type scale"
      note={`UI ${look.type.ui}; mono ${look.type.mono}; line height ${look.type.lineHeight}.`}
    >
      {sizes.map(([name, px]) => (
        <div
          key={name}
          style={{ display: "flex", gap: 16, alignItems: "baseline", color: "var(--ink)" }}
        >
          <code style={{ width: 90, fontSize: 12, color: "var(--hud-muted)" }}>
            {name} {px}px
          </code>
          <span style={{ fontFamily: "var(--font-ui)", fontSize: px }}>Word-pair counts</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: px }}>486 million</span>
        </div>
      ))}
    </Section>
  );
}

function HudSection() {
  const [view, setView] = useState("whole");
  const caption = autocomplete.caption.default;
  return (
    <Section
      id="hud"
      title="HUD panels"
      note="The live HUD's own classes: a caption box and a control group."
    >
      <div
        className={hudCss.hud}
        style={{ ...s.row, gap: 24, position: "static", pointerEvents: "auto" }}
      >
        <div
          className={hudCss.box}
          style={{ position: "relative", maxWidth: 380, padding: "14px 16px" }}
        >
          <div className={hudCss.caption}>
            {caption.story.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
        <div className={hudCss.box} style={{ position: "relative", padding: "12px 14px" }}>
          <div className={hudCss.group}>
            <div className={hudCss.groupHead}>View</div>
            <div className={hudCss.seg} role="group" aria-label="View">
              {["whole", "cutaway", "exploded"].map((v) => (
                <button key={v} type="button" aria-pressed={v === view} onClick={() => setView(v)}>
                  {v[0]!.toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function ChipsSection({ onReady }: { onReady: () => void }) {
  const [model, setModel] = useState<LoadedModel | null>(null);
  useEffect(() => {
    void fetchModel("counts").then(setModel);
  }, []);
  useEffect(() => {
    if (model) void document.fonts.ready.then(onReady);
  }, [model, onReady]);
  return (
    <Section id="chips" title="Stat chip, once per scale">
      <div
        className={hudCss.stats}
        data-crop="specimen:chips"
        style={{
          gridTemplateColumns: `repeat(${STAT_SCALES.length}, auto)`,
          justifyContent: "start",
        }}
      >
        {STAT_SCALES.map((scale) => (
          <StatChip key={scale} stat={SPECIMENS[scale]} model={model} slider={0} />
        ))}
      </div>
    </Section>
  );
}

/** The real label layer, pinned in a box: a transformed parent makes its fixed layer local. */
function LabelSpecimen({ reading }: { reading: LabelReading }) {
  const labels = useRef<LabelsHandle>(null);
  const defs = autocomplete.labels;
  useEffect(() => {
    const sides = ["up-right", "up-left", "down-right"] as const;
    const placements: LabelPlacement[] = defs.map((d, i) => ({
      id: d.anchor,
      x: i === 1 ? 330 : 40 + i * 30,
      y: 60 + i * 50,
      visible: true,
      side: sides[i % sides.length]!,
    }));
    labels.current?.update(placements);
  }, [defs, reading]);
  return (
    <figure style={{ margin: 0 }}>
      <div
        style={{
          ...s.frame,
          position: "relative",
          width: 520,
          height: 200,
          transform: "translateZ(0)",
          overflow: "hidden",
        }}
      >
        <Labels ref={labels} labels={defs} reading={reading} />
      </div>
      <figcaption style={s.caption}>{reading} reading</figcaption>
    </figure>
  );
}

function LabelsSection() {
  return (
    <Section
      id="labels"
      title="Labels"
      note="Chapter 0's labels in both readings, in the four pill sides' first three."
    >
      <div style={s.row}>
        <LabelSpecimen reading="analogy" />
        <LabelSpecimen reading="precise" />
      </div>
    </Section>
  );
}

/** Pulses along a line at the flow tokens' rate and spacing (renderer flow lands with its chapter). */
function FlowSection() {
  const { cyclesPerSec, spacing } = look.flow;
  const pxPerMetre = 160;
  const gap = spacing * pxPerMetre;
  const tokens: PaletteToken[] = ["flow", "focus", "active"];
  return (
    <Section
      id="flow"
      title="Flow rhythm"
      note={`${cyclesPerSec} pulses per second, ${spacing} m apart (drawn at ${pxPerMetre} px/m), per glow token.`}
    >
      <style>{`@keyframes tokens-flow { to { stroke-dashoffset: ${-gap}; } }`}</style>
      {tokens.map((token) => (
        <svg key={token} width={720} height={28} style={{ display: "block", marginBottom: 6 }}>
          <line
            x1={8}
            y1={14}
            x2={600}
            y2={14}
            stroke="var(--hud-line)"
            strokeWidth={6}
            strokeLinecap="round"
          />
          <line
            x1={8}
            y1={14}
            x2={600}
            y2={14}
            stroke={look.palette[token]}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${gap * 0.25} ${gap * 0.75}`}
            style={{
              animation: `tokens-flow ${1 / cyclesPerSec}s linear infinite`,
              filter: `drop-shadow(0 0 4px ${look.palette[token]})`,
            }}
          />
          <text x={616} y={18} fill="var(--hud-muted)" fontSize={11} textAnchor="start">
            {token}
          </text>
        </svg>
      ))}
    </Section>
  );
}

function ViewsSection({ onReady }: { onReady: () => void }) {
  const views = ["whole", "cutaway", "exploded"] as const;
  return (
    <Section
      id="views"
      title="Views"
      note="Chapter 0's board in each view: Cutaway caps what it cuts in the cap colour; Exploded pulls the layers apart."
    >
      <div style={s.row}>
        {views.map((view) => (
          <LabFrame
            key={view}
            src={`/lab/scene/autocomplete?labels=0&view=${view}&clock=held&t=5.4`}
            width={1440}
            height={900}
            scale={0.3}
            caption={view}
            onReady={onReady}
          />
        ))}
      </div>
    </Section>
  );
}

/** Calls `onReady` once `count` parts of the page have each reported ready. */
function useCountdown(count: number, onReady: () => void): () => void {
  const left = useRef(count);
  return () => {
    left.current -= 1;
    if (left.current === 0) onReady();
  };
}

export function TokensPage({ section, onReady }: { section: string | null; onReady: () => void }) {
  const shown: readonly SectionId[] =
    section === null ? SECTIONS : SECTIONS.filter((id) => id === section);
  // Palette: 1 frame; chips: model + fonts; views: 3 frames.
  const waits = { palette: 1, chips: 1, views: 3 } as Partial<Record<SectionId, number>>;
  const total = shown.reduce((n, id) => n + (waits[id] ?? 0), 0);
  const ready = useCountdown(total, onReady);
  useEffect(() => {
    if (total === 0) void document.fonts.ready.then(onReady);
  }, [total, onReady]);
  if (shown.length === 0) return <p>Unknown tokens section: {section}</p>;
  return (
    <main
      data-testid="tokens"
      style={{
        padding: "24px 32px",
        color: "var(--ink)",
        background: "var(--bg-deep)",
        minHeight: "100vh",
      }}
    >
      <h1 style={{ margin: "0 0 20px" }}>Look tokens</h1>
      {shown.includes("palette") && <PaletteSection onReady={ready} />}
      {shown.includes("type") && <TypeSection />}
      {shown.includes("hud") && <HudSection />}
      {shown.includes("chips") && <ChipsSection onReady={ready} />}
      {shown.includes("labels") && <LabelsSection />}
      {shown.includes("flow") && <FlowSection />}
      {shown.includes("views") && <ViewsSection onReady={ready} />}
    </main>
  );
}
