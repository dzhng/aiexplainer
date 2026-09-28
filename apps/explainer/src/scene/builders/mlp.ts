/**
 * Chapter 6's scene: the word's arrow runs across the face of a panel of yes/no questions
 * (the kit's `questionPanel`: one lamp per MLP neuron shown), the most active lamps light up,
 * each sends a push pipe onto the arrow, the arrow thickens column by column as the pushes
 * add up, and a pair of bars reads how sure the machine is of its next word with every lamp
 * on and then with the brightest ones switched off. The failure beat raises a row of four
 * small panels in front, stacked with nothing carrying the arrow past them: it dies after
 * the first.
 *
 * Every number is the run's (`runtime/runs/mlp.ts`): lamp brightness is the neuron's
 * |activation| (the trace's `mlp.act`), pipe width its push on the answer's score, the arrow's
 * thickness the running sum of those pushes, the bars the model's real probabilities, and the
 * teaser's arrow the `noresidual` model's traced stream size.
 *
 * Loop channels read: `arrowIn` (0 → 1 as the arrow slides in), `lamps` (0 → 1 lamps light,
 * most active first), `pushes` (0 → 1 pipes reach the arrow), `onBar` and `offBar` (the two
 * readout bars rise), `teaser` (the teaser row rises) and `teaserFlow` (0 → 1 how far along
 * that row the arrow has travelled). Typed text shows everything lit, without the teaser.
 */
import { clamp } from "math";
import {
  KIT,
  blockFootprint,
  lampCenter,
  panelSize,
  placeBar,
  placePush,
  placeSegment,
  text,
  type BarSlot,
  type BlockPart,
  type Part,
  type QuestionPanelParams,
  type SceneAnchor,
  type SceneDesc,
  type SceneText,
  type TubePart,
} from "@repo/renderer";
import type { Vec3 } from "math";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";
import { share } from "../../chapters/format.ts";
import { box, segment } from "./parts.ts";

/** Chapter 6's run (`runtime/runs/mlp.ts`). */
export interface MlpRun {
  kind: "mlp";
  /** The text the arrow carries (the loop's input, or the reader's). */
  prompt: string;
  /** The model's top next token with the whole panel on, as text. */
  answer: string;
  /** p(answer) with the panel on, and with the `offCount` most active neurons switched off. */
  p: number;
  pOff: number;
  offCount: number;
  /**
   * The shown lamps in neuron order: the most active neurons at the last position (by
   * |activation|, `rank` 0 the most), each with its activation from the trace and its push on
   * the answer's score (the drop in the answer's logit when that neuron alone is switched off).
   */
  lamps: { neuron: number; act: number; push: number; rank: number }[];
  /**
   * The teaser: the `noresidual` model's stream size (RMS) at the last position entering
   * each of its layers and leaving the last, as a share of the embedding's.
   */
  fade: number[];
}

const LAMP_COLS = 6;
const LAMP_ROWS = 4;
export const MLP_LAMPS = LAMP_COLS * LAMP_ROWS;

const PANEL: QuestionPanelParams = {
  id: "panel",
  slot: 0,
  center: [0, 1.6, 0],
  cols: LAMP_COLS,
  rows: LAMP_ROWS,
  pitch: 0.36,
  lampSize: 0.2,
  arrow: { y: 1.6, z: 0.42 },
  materials: { housing: "housing", rim: "metal", lamp: "neuron", push: "bar" },
};
const PANEL_SLOTS = 1 + 2 * MLP_LAMPS;

/** The arrow: where it starts, its thickness before any push and at the full sum, its tip. */
const ARROW = { from: -3.1, radius: 0.022, pushed: 0.05, tip: 0.13 } as const;
/** Readout: two bars in glass tracks on a plinth right of the panel; the arrow points at them. */
const READOUT = { x: 2.3, z: 0.42, gap: 0.72, width: 0.2, depth: 0.2, floor: 0.3, max: 1.35 };
const ARROW_END = READOUT.x - READOUT.gap / 2 - 0.42;
/** Push pipe radius: a floor so every pipe shows, plus a share of the largest push. */
const PUSH_RADIUS = { min: 0.008, span: 0.05 };
/**
 * Emission of a lit lamp at full activation and of a dark one. Brightness follows
 * (|activation| ÷ the largest)^contrast, so a lamp at half the largest reads clearly dimmer.
 */
const LAMP_GLOW = { lit: 1.2, dark: 0.02, contrast: 4 };
/** Pipe glow by push toward the answer; a pipe that pushes away from it stays dim. */
const PUSH_GLOW = { min: 0.2, span: 0.9, against: 0.06 };

/** The failure teaser: four small panels in a row on the floor in front, nothing past them. */
const TEASER = { panels: 4, z: 1.7, x0: -2.2, step: 0.8, size: [0.36, 0.44, 0.08] as Vec3 };
const TEASER_SINK = 0.6;

/**
 * Font sizes (em), metres: the prompt over the arrow, each bar's reading over its track, the
 * title on the plinth's front (two lines, to fill it), and the teaser's notes.
 */
const TEXT = { prompt: 0.1, readout: 0.09, title: 0.1, teaser: 0.1 };

/** The arrow's pieces: the stretch into the panel, one per lamp column, the stretch out. */
const ARROW_PIECES = LAMP_COLS + 2;

interface Built {
  pushes: TubePart[];
  arrow: TubePart[];
  tip: BlockPart;
  bars: BlockPart[];
  barSlots: BarSlot[];
  panels: BlockPart[];
  links: TubePart[];
  slots: { arrow: number; bars: number; links: number };
  /** The prompt, the two bars' readouts, the readout's title, and the teaser's two notes. */
  text: SceneText[];
}

const built = new WeakMap<SceneDesc, Built>();

/** A diamond on the arrow's tip: a cube turned 45° about Z. */
function placeTip(transform: number[], x: number, y: number, z: number, size: number) {
  const c = Math.SQRT1_2 * size;
  transform[0] = c;
  transform[1] = c;
  transform[4] = -c;
  transform[5] = c;
  transform[10] = size * 0.6;
  transform[12] = x;
  transform[13] = y;
  transform[14] = z;
}

/** Where arrow piece i starts and ends along X: in to the panel, column by column, out. */
function pieceSpan(i: number): [number, number] {
  const { width } = panelSize(PANEL);
  const edge = (c: number) => lampCenter(PANEL, c)[0] - PANEL.pitch / 2;
  if (i === 0) return [ARROW.from, PANEL.center[0] - width / 2];
  if (i === ARROW_PIECES - 1) return [edge(LAMP_COLS), ARROW_END];
  const left = i === 1 ? PANEL.center[0] - width / 2 : edge(i - 1);
  return [left, edge(i)];
}

export const mlp: SceneBuilder = {
  assets: {},

  create(assets, revision) {
    const panel = KIT.questionPanel.build(PANEL);
    let slot = PANEL_SLOTS;
    const arrowSlot = slot;
    const arrow = Array.from({ length: ARROW_PIECES }, (_, i) =>
      segment(i === 0 ? "arrow" : `arrow.${i}`, slot++, "bar"),
    );
    const tip = box("arrow.tip", arrowSlot + ARROW_PIECES - 1, "bar", [0, 0, 0], [1, 1, 1]);

    const barSlots: BarSlot[] = [0, 1].map((i) => ({
      x: READOUT.x + (i - 0.5) * READOUT.gap,
      z: READOUT.z,
      floor: READOUT.floor,
      width: READOUT.width,
      depth: READOUT.depth,
      maxHeight: READOUT.max,
    }));
    const barsSlot = slot;
    slot += 2;
    const bars = KIT.bars.build({
      id: "readout",
      slot: barsSlot,
      material: "bar",
      slots: barSlots,
    });
    const plainSlot = slot++;
    const plinth = box(
      "readout.plinth",
      plainSlot,
      "housing",
      [READOUT.x, READOUT.floor / 2, READOUT.z],
      [READOUT.gap + READOUT.width + 0.24, READOUT.floor, READOUT.depth + 0.2],
    );
    // Each bar stands in a glass track its full height tall, so a short bar reads as a gauge.
    const tracks = barSlots.map((bar, i) => {
      const track = box(
        `readout.track.${i}`,
        plainSlot,
        "glass",
        [bar.x, bar.floor + bar.maxHeight / 2, bar.z],
        [bar.width + 0.06, bar.maxHeight, bar.depth + 0.06],
      );
      return track;
    });
    const panels = Array.from({ length: TEASER.panels }, (_, i) =>
      box(
        `teaser.${i}`,
        plainSlot,
        "housing",
        [TEASER.x0 + i * TEASER.step, -TEASER_SINK, TEASER.z],
        TEASER.size,
      ),
    );
    const linksSlot = slot;
    // One arrow stretch into each small panel, and one out of the last.
    const links = Array.from({ length: TEASER.panels + 1 }, (_, i) =>
      segment(`teaser.link.${i}`, linksSlot + i, "bar"),
    );

    // Soft contact shadows ground the panel and the readout on the floor.
    const shadowSlot = linksSlot + links.length;
    const shadows = [
      KIT.contactShadow.build({
        id: "shadow",
        slot: shadowSlot,
        bounds: panel.bounds,
        softness: 0.3,
        // The panel stands on its two legs (`<id>.leg.{0,1}`).
        feet: panel.parts
          .filter((part) => part.id.startsWith(`${PANEL.id}.leg.`))
          .map((leg) => blockFootprint(leg as BlockPart)),
      }),
      KIT.contactShadow.build({
        id: "readout.shadow",
        slot: shadowSlot,
        bounds: [
          READOUT.x - READOUT.gap,
          0,
          READOUT.z - READOUT.depth,
          READOUT.x + READOUT.gap,
          READOUT.floor,
          READOUT.z + READOUT.depth,
        ],
        softness: 0.2,
      }),
    ].flatMap((shadow) => shadow.parts);

    const parts: Part[] = [
      ...shadows,
      ...panel.parts,
      ...arrow,
      tip,
      ...bars.parts,
      plinth,
      ...tracks,
      ...panels,
      ...links,
    ];
    const anchors: SceneAnchor[] = [
      { id: "panel", part: "panel.rim.0", local: [-0.36, 0.5, 0.5], priority: 3 },
      // On the arrow's incoming stretch (its surface, toward the camera).
      { id: "arrow", part: "arrow", local: [-1.05, 0.35, 0], priority: 2 },
      { id: "readout", part: "readout.0", local: [-0.5, 0.15, 0.5], priority: 2 },
      { id: "teaser", part: "teaser.0", local: [0, 0.5, 0.5], priority: 1 },
    ];
    // The prompt stands over the arrow's incoming stretch, facing the eye (the tube has no
    // face to write on); the title is printed on the plinth's front, and each bar's reading
    // just over the top of its glass track, in the track's face; the teaser's notes stand
    // over its first and after its last small panel.
    const texts: SceneText[] = [
      text({
        id: "prompt",
        part: "arrow",
        local: [0, 0.7, 0],
        face: "camera",
        size: TEXT.prompt,
        style: "chalk",
        align: [0.5, 1.6],
      }),
      ...[0, 1].map((i) =>
        text({
          id: i === 0 ? "bar.on" : "bar.off",
          part: `readout.track.${i}`,
          local: [0, 0.5, 0.5],
          size: TEXT.readout,
          style: "chalk",
          align: [0.5, 1.25],
          maxWidth: READOUT.gap - 0.06,
        }),
      ),
      text({
        id: "readout.title",
        part: "readout.plinth",
        local: [0, 0, 0.5],
        size: TEXT.title,
        style: "chalk",
        maxWidth: plinth.transform[0]! - 0.06,
      }),
      text({
        id: "teaser.note",
        part: "teaser.0",
        local: [-0.5, 0.5, 0.5],
        face: "camera",
        size: TEXT.teaser,
        style: "chalk",
        align: [0, 1.3],
      }),
      text({
        id: "teaser.end",
        part: `teaser.${TEASER.panels - 1}`,
        local: [0.5, 0.5, 0.5],
        face: "camera",
        size: TEXT.teaser,
        style: "chalk",
        align: [0, 1.3],
      }),
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets, text: texts };
    const b: Built = {
      pushes: panel.parts.filter((p) => p.id.startsWith("panel.push.")) as TubePart[],
      arrow,
      tip,
      bars: bars.parts as BlockPart[],
      barSlots,
      panels,
      links,
      slots: { arrow: arrowSlot, bars: barsSlot, links: linksSlot },
      text: texts,
    };
    built.set(scene, b);
    // Built at full reach, so the label occluders match what the loop mostly shows.
    pose(b, BUILT_POSE, null, null, null);
    return scene;
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    // Typed text shows everything lit at once, without the loop's motion or the teaser.
    const typed = ui.text !== null;
    const ch = (id: string, fallback: number) => (typed ? fallback : (tl.channels[id] ?? fallback));
    const state: Pose = {
      arrowIn: ch("arrowIn", 1),
      lamps: ch("lamps", 1),
      pushes: ch("pushes", 1),
      onBar: ch("onBar", 1),
      offBar: ch("offBar", 1),
      ablate: ch("ablate", 0),
      teaser: ch("teaser", 0),
      teaserFlow: ch("teaserFlow", 0),
    };
    const b = built.get(frame.input.scene)!;
    const data = run?.kind === "mlp" ? run : null;
    pose(b, state, data, frame.input.dynamics.intensity, b.text);
  },
};

/** The loop's state as the scene reads it (see the channel list at the top). */
interface Pose {
  arrowIn: number;
  lamps: number;
  pushes: number;
  onBar: number;
  offBar: number;
  /** 0 → 1 the `offCount` most active lamps switch off (the ablation the off bar measures). */
  ablate: number;
  teaser: number;
  teaserFlow: number;
}

/** Everything at full reach with the teaser down: how the scene is built. */
const BUILT_POSE: Pose = {
  arrowIn: 1,
  lamps: 1,
  pushes: 1,
  onBar: 1,
  offBar: 1,
  ablate: 0,
  teaser: 0,
  teaserFlow: 0,
};

/**
 * Places every moving part for `state` and, when given, writes glows and scene text. With no
 * run, pipes take their thinnest width and the bars stay flat.
 */
function pose(
  b: Built,
  state: Pose,
  data: MlpRun | null,
  intensity: Float32Array | null,
  texts: SceneText[] | null,
): void {
  const { arrowIn, pushes, teaser, teaserFlow } = state;
  // Lamps: the run's lamps in neuron order; the slider keeps the most active `shown`.
  const lamps = data?.lamps ?? [];
  const maxAct = Math.max(1e-6, ...lamps.map((l) => Math.abs(l.act)));
  const maxPush = Math.max(1e-6, ...lamps.map((l) => Math.abs(l.push)));
  // The pushes landed so far, summed by lamp column, for the arrow's thickness.
  const landed = Array.from({ length: LAMP_COLS }, () => 0);
  let total = 0;
  for (let i = 0; i < MLP_LAMPS; i++) {
    const lamp = lamps[i];
    const shown = data === null || lamp !== undefined;
    const rank = lamp?.rank ?? i;
    // Most active first: the lamp of rank r lights once `lamps` passes r / count.
    const off = data !== null && rank < data.offCount ? state.ablate : 0;
    const on = shown ? clamp(state.lamps * MLP_LAMPS - rank, 0, 1) * (1 - off) : 0;
    const strength = lamp ? (Math.abs(lamp.act) / maxAct) ** LAMP_GLOW.contrast : 0;
    // The pipe grows from its lamp once lit, in the same order; its width is the push.
    const reach = shown ? clamp(pushes * MLP_LAMPS - rank, 0, 1) * (1 - off) : 0;
    const push = lamp && shown ? lamp.push : 0;
    const radius = PUSH_RADIUS.min + (PUSH_RADIUS.span * Math.abs(push)) / maxPush;
    placePush(b.pushes[i]!.transform, PANEL, i, reach > 0 ? radius : 1e-4, Math.max(reach, 1e-3));
    if (reach >= 1) landed[i % LAMP_COLS]! += push;
    total += Math.max(0, push);
    if (intensity) {
      intensity[PANEL.slot + 1 + i] = LAMP_GLOW.dark + on * strength * LAMP_GLOW.lit;
      intensity[PANEL.slot + 1 + MLP_LAMPS + i] =
        push > 0 ? PUSH_GLOW.min + (PUSH_GLOW.span * push) / maxPush : PUSH_GLOW.against;
    }
  }

  // The arrow slides in from the left to the readout, thickening past each column by the
  // pushes that have landed there so far (their running sum, as a share of the full sum).
  const { y, z } = PANEL.arrow;
  const head = ARROW.from + (ARROW_END - ARROW.from) * arrowIn;
  let sum = 0;
  for (let i = 0; i < ARROW_PIECES; i++) {
    const [left, right] = pieceSpan(i);
    if (i > 0 && i <= LAMP_COLS) sum += landed[i - 1]!;
    const pushed = total > 0 ? clamp(sum / total, 0, 1) : 0;
    const end = Math.min(right, head);
    placeSegment(
      b.arrow[i]!.transform,
      [left, y, z],
      [Math.max(left + 1e-3, end), y, z],
      end > left ? ARROW.radius + ARROW.pushed * pushed : 1e-4,
    );
    if (intensity) intensity[b.slots.arrow + i] = arrowIn * (0.25 + 0.55 * pushed);
  }
  placeTip(b.tip.transform, head + ARROW.tip * 0.5, y, z, ARROW.tip);

  // Readout: p(answer) with the whole panel on, then with the top neurons off.
  const withAll = data ? data.p * state.onBar : 0;
  const withoutTop = data ? data.pOff * state.offBar : 0;
  placeBar(b.bars[0]!.transform, b.barSlots[0]!, withAll * READOUT.max);
  placeBar(b.bars[1]!.transform, b.barSlots[1]!, withoutTop * READOUT.max);

  // The teaser: four small panels with nothing past them rise; the arrow dies after the first.
  const sink = (1 - teaser) * TEASER_SINK;
  const [sw, sh] = TEASER.size;
  for (const panel of b.panels) panel.transform[13] = sh / 2 - sink;
  const fade = data?.fade ?? [];
  for (let i = 0; i < b.links.length; i++) {
    // Link i runs into panel i; the last runs out of the final panel.
    const x1 = TEASER.x0 + i * TEASER.step - (i < TEASER.panels ? sw / 2 : -sw / 2 - 0.3);
    const x0 = i === 0 ? x1 - 0.6 : TEASER.x0 + (i - 1) * TEASER.step + sw / 2;
    const ly = sh * 0.5 - sink;
    const reached = clamp(teaserFlow * b.links.length - i, 0, 1);
    placeSegment(
      b.links[i]!.transform,
      [x0, ly, TEASER.z],
      [x0 + (x1 - x0) * Math.max(reached, 1e-3), ly, TEASER.z],
      reached > 0 && teaser > 0.05 ? 0.03 : 1e-4,
    );
    if (intensity) intensity[b.slots.links + i] = 1.4 * (fade[i] ?? 0) * teaser;
  }

  if (intensity) {
    intensity[b.slots.bars] = 0.8 * state.onBar;
    intensity[b.slots.bars + 1] = 0.8 * state.offBar;
  }
  if (!texts) return;
  const answer = data ? `“${data.answer.trim()}”` : "";
  const [prompt, on, off, title, note, end] = texts as [
    SceneText,
    SceneText,
    SceneText,
    SceneText,
    SceneText,
    SceneText,
  ];
  prompt.text = data && arrowIn > 0.05 ? `“${data.prompt}”` : "";
  on.text = data && withAll > 0 ? `all lamps on\n${answer} ${share(data.p)}` : "";
  off.text =
    data && withoutTop > 0 ? `${data.offCount} brightest off\n${answer} ${share(data.pOff)}` : "";
  title.text = data && state.onBar > 0 ? `chance the next\nword is ${answer}` : "";
  note.text = teaser > 0.6 ? "4 panels in a row, nothing else" : "";
  const left = fade.at(-1) ?? 0;
  end.text =
    teaser > 0.6 && teaserFlow > 0.95 ? `arrow left: ${left === 0 ? "0%" : share(left)}` : "";
}
