/**
 * Chapter 3's scene, built from the kit (`block`, `bars`, `die`, `contactShadow`): on a work
 * table, the word the machine is looking at on a card, a strip of score bars behind it (the
 * word's arrow scored against every word's arrow: the highest scores of the whole
 * vocabulary), and a loaded die whose faces are the top six words plus “every other word”,
 * each face as wide around the rim as its probability at the current temperature. The die
 * rolls to a stop angle drawn from the seeded generator, so the face on top is exactly
 * `sample()` over the faces.
 *
 * Temperature: until the reader moves the slider, the loop's `temperature` channel drives it
 * (the cold → hot demo), and the HUD slider plays along (`SliderDef.loop`); once they move
 * it, the slider does.
 *
 * The roll is read at a line across the drum just off its rim, towards the camera: the face
 * under that line is the next word.
 *
 * Loop channels read: `input` (which loop input), `bars` (0 → 1 bar growth), `glow` (the top
 * six bars light up), `form` (0 → 1: the die grows out of them), `roll` (each unit is one roll:
 * n → n + 1 rolls and lands), `temperature`, and the notes `landed`, `tempNote`, `failure`.
 */
import {
  faceAt,
  KIT,
  placeBar,
  placeDie,
  type BarSlot,
  type BlockPart,
  type Part,
  type SceneAnchor,
  type SceneDesc,
} from "@repo/renderer";
import { probabilities, seededRng } from "@repo/llm";
import type { Vec3 } from "math";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";
import { stepAt } from "../step.ts";
import { tableParts, tableTop, type TableSpec } from "./table.ts";
import { share } from "../../chapters/format.ts";

const TABLE: TableSpec = { center: [0, 0.74, 0], size: [3.0, 0.08, 1.7], legHeight: 0.7 };
const TOP = tableTop(TABLE);
/** The die: six word faces and one “every other word” face. */
export const WORD_FACES = 6;
const FACES = WORD_FACES + 1;
const STAVES = 12;
const DIE = { radius: 0.3, length: 0.5, thickness: 0.045, x: 0.7, z0: -0.08, z1: 0.42 };
/** Turns the die makes in one roll before it settles. */
const TURNS = 2;
/** Score bars: the highest scores in the vocabulary, left to right. */
export const SCORE_BARS = 12;
const BARS = { x0: -0.95, pitch: 0.12, z: -0.55, width: 0.08, depth: 0.08, maxHeight: 0.55 };
const CARD = { x: -0.45, z: 0.35, width: 0.46, height: 0.16, depth: 0.03 };
/** Seed of roll n: each roll draws from its own seeded generator, so every loop is the same. */
export const ROLL_SEED = 3000;
const FACE_MATERIALS = ["dieA", "dieB", "dieA", "dieB", "dieA", "dieB", "dieOther"];

/** Dynamics slots: 0 static, the bars, the card, the die's faces then its core. */
const BAR_SLOT = 1;
const CARD_SLOT = BAR_SLOT + SCORE_BARS;
const DIE_SLOT = CARD_SLOT + 1;
const POINTER_SLOT = DIE_SLOT + FACES + 1;
/** Where the roll is read: radians round the drum from its top towards the camera. */
const READING = 0.75;

/** Chapter 3's run (`runtime/runs/sampling.ts`). */
export interface LogitsRun {
  kind: "logits";
  /**
   * One step per loop input (or one for typed text): the prompt, its last token (the only one
   * this model reads), the forward pass's next-token scores over the whole vocabulary, their
   * mean, and the highest-scoring tokens in order.
   */
  steps: {
    text: string;
    last: string;
    logits: number[];
    meanLogit: number;
    top: { id: number; text: string; logit: number }[];
  }[];
}

type LogitsStep = LogitsRun["steps"][number];

/**
 * The die's face shares at temperature `t`: the top six words' probabilities (in score order)
 * and everything else as the last face. `probs` is `probabilities(logits, t)` over the whole
 * vocabulary.
 */
export function faceShares(step: LogitsStep, probs: ArrayLike<number>, out: number[]): number[] {
  let top = 0;
  for (let f = 0; f < WORD_FACES; f++) {
    out[f] = probs[step.top[f]!.id]!;
    top += out[f]!;
  }
  out[WORD_FACES] = Math.max(0, 1 - top);
  return out;
}

/** Roll `n`'s draw in [0, 1): the one number `sample()` takes from roll n's seeded generator. */
const rollDraw = (n: number) => seededRng(ROLL_SEED + n)();

/**
 * Where roll `n` stops: after `TURNS` more turns than the last roll, with the reading line at
 * fraction `rollDraw(n)` of the way round from face 0's start. The face there is exactly
 * `sample(shares, rng)` for roll n's generator.
 */
export function landingAngle(n: number): number {
  return READING - 2 * Math.PI * (rollDraw(n) + TURNS * (n + 1));
}

/** The face under the reading line. */
export const faceRead = (shares: ArrayLike<number>, angle: number) =>
  faceAt(shares, angle, READING);

/** Bits of spread (entropy) of a distribution. */
export function entropyBits(probs: ArrayLike<number>): number {
  let h = 0;
  for (let i = 0; i < probs.length; i++) {
    const p = probs[i]!;
    if (p > 0) h -= p * Math.log2(p);
  }
  return h;
}

interface Built {
  die: Part[];
  bars: BlockPart[];
  slots: BarSlot[];
  card: BlockPart;
  /** The reading line across the drum: the face under it is the roll. */
  pointer: BlockPart;
  anchors: Record<"top", SceneAnchor>;
  tagOf: { note: number; faces: number; bars: number; card: number; prompt: number };
  /** Every stave's part id, by face; a face's word tag rides one of them. */
  staveIds: string[][];
  faceAnchors: SceneAnchor[];
  shares: number[];
  pose: {
    center: Vec3;
    radius: number;
    length: number;
    thickness: number;
    shares: number[];
    angle: number;
  };
  /** The probabilities, recomputed only when the step or the temperature changes. */
  probs: { step: LogitsStep | null; t: number; values: ArrayLike<number> };
  motion: number;
}

const built = new WeakMap<SceneDesc, Built>();

export const sampling: SceneBuilder = {
  assets: {},
  // The note, a word per face, a word per bar, the card's word, the prompt above it.
  tagCount: 1 + FACES + SCORE_BARS + 2,

  create(assets, revision) {
    const slots: BarSlot[] = Array.from({ length: SCORE_BARS }, (_, i) => ({
      x: BARS.x0 + i * BARS.pitch,
      z: BARS.z,
      floor: TOP,
      width: BARS.width,
      depth: BARS.depth,
      maxHeight: BARS.maxHeight,
    }));
    const barsKit = KIT.bars.build({ id: "bar", slot: BAR_SLOT, material: "bar", slots });
    const dieKit = KIT.die.build({
      id: "die",
      slot: DIE_SLOT,
      center: [DIE.x, TOP + DIE.radius, DIE.z0],
      radius: DIE.radius,
      length: DIE.length,
      thickness: DIE.thickness,
      materials: FACE_MATERIALS,
      staves: STAVES,
      coreMaterial: "dieB",
    });
    const card = KIT.block.build({
      id: "card",
      slot: CARD_SLOT,
      material: "card",
      center: [CARD.x, TOP + CARD.height / 2, CARD.z],
      size: [CARD.width, CARD.height, CARD.depth],
    }).parts[0] as BlockPart;
    const pointer = KIT.block.build({
      id: "pointer",
      slot: POINTER_SLOT,
      material: "arrow",
      center: [DIE.x, -50, 0],
      size: [1, 1, 1],
    }).parts[0] as BlockPart;
    const parts = [...tableParts(TABLE), ...barsKit.parts, card, ...dieKit.parts, pointer];
    const anchors = {
      // The reading line's far end: where the face that counts is read.
      top: { id: "die", part: "pointer", local: [0.5, 0, 0] as Vec3, priority: 3 },
    };
    const sceneAnchors: SceneAnchor[] = [
      anchors.top,
      { id: "scores", part: "bar.0", local: [-0.5, 0.2, 0.5], priority: 2 },
      { id: "word", part: "card", local: [-0.5, 0, 0.5], priority: 1 },
    ];
    const scene: SceneDesc = { revision, parts, anchors: sceneAnchors, assets };
    const tagOf = {
      note: 0,
      faces: 1,
      bars: 1 + FACES,
      card: 1 + FACES + SCORE_BARS,
      prompt: 2 + FACES + SCORE_BARS,
    };
    const staveIds = Array.from({ length: FACES }, (_, f) =>
      Array.from({ length: STAVES }, (_, s) => `die.face.${f}.${s}`),
    );
    const faceAnchors: SceneAnchor[] = staveIds.map((ids, f) => ({
      id: `face.${f}`,
      part: ids[0]!,
      local: [0, 1.8, 0],
      priority: 0,
    }));
    const tags: SceneTags = {
      anchors: [
        // Over the middle of the table, above the bars.
        { id: "note", part: "table", local: [0.08, 8, -0.28] as Vec3, priority: 0 },
        // Each face's word floats just off one of its staves (clear of its neighbours' bounds).
        ...faceAnchors,
        ...Array.from({ length: SCORE_BARS }, (_, i) => ({
          id: `bar.${i}`,
          part: `bar.${i}`,
          local: [0, 0.5, 0.5] as Vec3,
          priority: 0,
        })),
        { id: "card", part: "card", local: [0, 0, 0.5], priority: 0 },
        // On the table just in front of the card: the whole prompt, of which it sees one word.
        { id: "prompt", part: "card", local: [0, -0.45, 12], priority: 0 },
      ],
      text: [],
      emphasis: [],
    };
    tags.text = tags.anchors.map(() => "");
    // The card's word and the faces' words are written on their parts, in dark ink.
    tags.emphasis = tags.anchors.map(
      (_, i) => i === tagOf.card || (i >= tagOf.faces && i < tagOf.faces + FACES),
    );
    built.set(scene, {
      die: dieKit.parts,
      bars: barsKit.parts as BlockPart[],
      slots,
      card,
      pointer,
      anchors,
      tagOf,
      staveIds,
      faceAnchors,
      shares: Array.from({ length: FACES }, () => 1 / FACES),
      pose: {
        center: [DIE.x, TOP + DIE.radius, DIE.z0],
        radius: DIE.radius,
        length: DIE.length,
        thickness: DIE.thickness,
        shares: [],
        angle: 0,
      },
      probs: { step: null, t: Number.NaN, values: [] },
      motion: 0,
    });
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics, camera } = frame.input;
    const b = built.get(scene)!;
    const steps = run?.kind === "logits" ? run.steps : [];
    const typed = ui.text !== null;
    const step = stepAt(steps, typed, tl.channels.input);
    const temperature =
      !typed && !ui.sliderSet && tl.channels.temperature !== undefined
        ? tl.channels.temperature
        : ui.slider;
    const grow = typed ? 1 : (tl.channels.bars ?? 1);
    const glow = typed ? 0 : (tl.channels.glow ?? 0);
    const form = typed ? 1 : (tl.channels.form ?? 1);
    const roll = typed ? 1 : (tl.channels.roll ?? 1);
    const tags = frame.tags.text;
    tags.fill("");
    if (!step) return;

    // The whole vocabulary's probabilities at this temperature (the scores are fixed per step).
    const memo = b.probs;
    if (memo.step !== step || memo.t !== temperature) {
      memo.step = step;
      memo.t = temperature;
      memo.values = probabilities(step.logits, temperature);
    }
    const probs = memo.values;
    const shares = faceShares(step, probs, b.shares);

    // The score strip: the highest scores, measured up from the vocabulary's average score.
    const top = step.top;
    const high = top[0]!.logit - step.meanLogit;
    for (let i = 0; i < SCORE_BARS; i++) {
      const bar = top[i]!;
      const h = ((bar.logit - step.meanLogit) / high) * BARS.maxHeight * grow;
      placeBar(b.bars[i]!.transform, b.slots[i]!, Math.max(0, h));
      const lit = i < WORD_FACES;
      dynamics.intensity[BAR_SLOT + i] = lit ? 0.4 + glow * 0.8 : 0.25;
      tags[b.tagOf.bars + i] = lit && grow > 0.6 ? shown(bar.text) : "";
    }

    // The die: formed out of the lit bars, rolled, landed.
    // Roll n runs while `roll` goes n → n + 1: from where roll n − 1 stopped (or face 0 on top)
    // to its own stop, always turning the same way, slowing as it settles.
    const done = Math.floor(roll);
    const within = roll - done;
    const settle = 1 - (1 - within) ** 3;
    const pose = b.pose;
    const from = done === 0 ? READING : landingAngle(done - 1);
    pose.angle = within === 0 ? from : from + (landingAngle(done) - from) * settle;
    pose.shares = shares;
    const s = Math.max(0.001, form);
    pose.radius = DIE.radius * s;
    pose.length = DIE.length * s;
    pose.thickness = DIE.thickness * s;
    pose.center[0] = DIE.x;
    pose.center[1] = TOP + pose.radius;
    // Rolls go back and forth across the table.
    const [a, z] = done % 2 === 0 ? [DIE.z0, DIE.z1] : [DIE.z1, DIE.z0];
    pose.center[2] = a + (z - a) * settle;
    placeDie(b.die, FACES, STAVES, pose);
    const landed = within === 0 && done >= 1;
    const onTop = faceRead(shares, pose.angle);
    for (let f = 0; f < FACES; f++)
      dynamics.intensity[DIE_SLOT + f] = landed && f === onTop ? 0.25 : 0;
    dynamics.intensity[DIE_SLOT + FACES] = 0;
    // The reading line, just off the rim, across the drum's length.
    const out = pose.radius + 0.02 * s;
    const line = b.pointer.transform;
    line[0] = pose.length * 1.08;
    line[5] = 0.012 * s;
    line[10] = 0.012 * s;
    line[12] = pose.center[0];
    // Until the die has formed, the line (and the die's label riding it) is out of sight.
    line[13] = form < 0.05 ? -50 : pose.center[1] + Math.cos(READING) * out;
    line[14] = pose.center[2] + Math.sin(READING) * out;
    dynamics.intensity[POINTER_SLOT] = landed ? 1.5 : 0.6;

    // Face words, each on its face's stave nearest the camera, shown only when that stave
    // turns toward it.
    const eyeY = Math.sin(camera.pitch);
    const eyeZ = Math.cos(camera.pitch) * Math.cos(camera.yaw);
    const toEye = Math.atan2(eyeZ, eyeY);
    const turn = 2 * Math.PI;
    let start = pose.angle;
    for (let f = 0; f < FACES; f++) {
      const span = turn * shares[f]!;
      const into = (((toEye - start) % turn) + turn) % turn;
      // Inside the face's arc, the stave there; outside it, the stave at the nearer end.
      const k =
        into < span
          ? Math.min(STAVES - 1, Math.floor((into / span) * STAVES))
          : into - span < turn - into
            ? STAVES - 1
            : 0;
      const phi = start + ((k + 0.5) / STAVES) * span;
      start += span;
      b.faceAnchors[f]!.part = b.staveIds[f]![k]!;
      const facing = Math.cos(phi) * eyeY + Math.sin(phi) * eyeZ;
      const word = f < WORD_FACES ? shown(top[f]!.text) : "every other word";
      tags[b.tagOf.faces + f] =
        form > 0.9 && facing > 0.5 && shares[f]! > 0.035 ? `${word}\n${share(shares[f]!)}` : "";
    }

    tags[b.tagOf.card] = step.last.trim() || "␣";
    tags[b.tagOf.prompt] = `…${step.text.slice(-28)}`;
    tags[b.tagOf.note] = typed
      ? spreadNote(temperature, probs)
      : noteFor(tl.channels, temperature, probs, step, shares, onTop);

    // The die moves every frame it rolls: re-test what hides what.
    if (!landed || b.motion !== pose.angle) {
      b.motion = pose.angle;
      scene.layout = (scene.layout ?? 0) + 1;
    }
  },
};

function spreadNote(temperature: number, probs: ArrayLike<number>): string {
  return `temperature ${temperature.toFixed(1)}: spread (entropy) ${entropyBits(probs).toFixed(1)} bits`;
}

function noteFor(
  channels: Record<string, number>,
  temperature: number,
  probs: ArrayLike<number>,
  step: LogitsStep,
  shares: number[],
  onTop: number,
): string {
  if ((channels.failure ?? 0) > 0.5)
    return `only “${step.last.trim()}” counts: every story ending in it rolls this same die`;
  if ((channels.tempNote ?? 0) > 0.5) return spreadNote(temperature, probs);
  if ((channels.landed ?? 0) > 0.5) {
    const word =
      onTop < WORD_FACES ? `“${step.top[onTop]!.text.trim()}”` : "one of the other words";
    return `rolled ${word} (${share(shares[onTop]!)} of the rim)`;
  }
  return "";
}

/** A token as scene text: a bare space as ␣, punctuation in quotes so a lone "." still reads. */
export function shown(token: string): string {
  const text = token.trim();
  if (!text) return "␣";
  return /[\p{L}\p{N}]/u.test(text) ? text : `“${text}”`;
}
