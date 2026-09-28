/**
 * Chapter 10's scene: chapter 9's machine and rail, with a rack of sticky notes above the
 * machine (the kit's `noteRack`: one shelf per layer, one column per word). Each word writes its
 * notes once; after the first pass, a step feeds only the new word and reads every note instead
 * of rereading the text. Then the rack shows what sharing saves (GQA: four readers, two sets of
 * notes) and what a sliding window does (only the last few columns kept; the rest evicted).
 *
 * Every number is the run's (`runtime/runs/kv-cache.ts`) or arithmetic: the words and each
 * step's `fed` are the worker's cached generation, the windowed words its generation with a
 * ring cache of the window's size, the bytes this tiny model's notes per word
 * (`kvBytesPerToken`), and the Llama-3-8B figures `ARITH`'s.
 *
 * Loop channels read: `step` (as chapter 9: steps done and the live step's phase), `ghost`
 * (0 → 1 → 0: the notes each reader would keep without sharing appear, smaller, then go),
 * `shared` (the note that says what sharing saves), `window` (0 → 1 notes outside the window
 * are evicted) and `trip` (the failure beat's note). Typed text shows every step done.
 */
import { evalArith } from "@repo/llm";
import {
  KIT,
  placeNote,
  rackSize,
  type BlockPart,
  type NoteRackParams,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  type TubePart,
} from "@repo/renderer";
import type { Vec3 } from "math";
import { formatStat, tokenLabel } from "../../chapters/format.ts";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { SceneBuilder, SceneFrame } from "../build-frame.ts";
import {
  buildLine,
  cardFlight,
  LAYERS,
  PHASE,
  placeCard,
  placeFeed,
  placeTile,
  RAIL_SLOTS,
  slotX,
  LINE,
} from "./generation.ts";
import { box } from "./parts.ts";

/** Chapter 10's run (`runtime/runs/kv-cache.ts`). */
export interface KvRun {
  kind: "kv-cache";
  prompt: string;
  tokens: string[];
  /** The cached generation: each word, and the tokens its step fed (the prompt, then one). */
  steps: { word: string; fed: number }[];
  /** The same draw with only the last `window` positions' notes kept. */
  windowed: string[];
  window: number;
  layers: number;
  heads: number;
  kvHeads: number;
  /** This tiny model's notes per word, bytes (f32 keys and values). */
  bytesPerToken: number;
}

export const KV_STEPS = 4;
export const KV_WINDOW = 4;
/** Note slots per cell: a key/value pair per head without sharing (4 heads). */
const SLOTS_PER_CELL = 4;

const RACK: NoteRackParams = {
  id: "rack",
  slot: 0,
  center: [0.45, 3.3, -0.75],
  layers: LAYERS,
  columns: RAIL_SLOTS,
  notes: SLOTS_PER_CELL,
  pitch: [0.22, 0.2],
  materials: { frame: "housing", note: "neuron" },
  explode: [0, 0.3, -0.3],
};

/** Unshared notes are drawn at this share of a real note's size. */
const GHOST_SIZE = 0.85;

const fraction = (a: number, b: number) => (a * 2 === b ? "half" : `${a}/${b} of`);

interface Built {
  tiles: BlockPart[];
  feeds: TubePart[];
  bands: BlockPart[];
  notes: BlockPart[];
  card: BlockPart;
  slots: { feeds: number; bands: number; read: number };
}

const built = new WeakMap<SceneDesc, Built>();

const noteIndex = (l: number, c: number, n: number) => (l * RAIL_SLOTS + c) * SLOTS_PER_CELL + n;

export const kvCache: SceneBuilder = {
  assets: {},
  // A word per rail slot, the new word's card, the rack's memory note, the sharing note, the
  // window note, and the failure note.
  tagCount: RAIL_SLOTS + 3,

  create(assets, revision) {
    const rack = KIT.noteRack.build(RACK);
    const rackSlots = 1 + LAYERS * RAIL_SLOTS;
    const line = buildLine(rackSlots);
    let slot = line.next;
    const card = box("card", slot++, "card", LINE.birth, [0.5, 0.2, 0.06]);
    // The rack stands on two posts behind the machine, and a read line runs from it down into
    // the machine: lit while a word reads the notes.
    const { width, height } = rackSize(RACK);
    const [rx, ry, rz] = RACK.center;
    const postH = ry - height / 2;
    const posts = [-1, 1].map((side, i) =>
      box(
        `rack.post.${i}`,
        0,
        "metal",
        [rx + side * (width / 2 - 0.05), postH / 2, rz - 0.05],
        [0.07, postH, 0.07],
      ),
    );
    const readSlot = slot++;
    const read = KIT.tube.build({
      id: "read",
      slot: readSlot,
      material: "bar",
      path: [
        [rx, ry - height / 2 - 0.02, rz + 0.1],
        [
          LINE.machine.center[0] + 0.6,
          LINE.machine.center[1] + LINE.machine.size[1] / 2,
          LINE.machine.center[2],
        ],
      ],
      radius: 0.035,
    }).parts[0] as TubePart;
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: slot++,
      bounds: [-3.1, 0, -1.3, 3.1, 2.3, 1.1],
      softness: 0.35,
    });
    const parts: Part[] = [...shadow.parts, ...rack.parts, ...posts, read, ...line.parts, card];
    const anchors: SceneAnchor[] = [
      { id: "rack", part: "rack.frame.board", local: [-0.42, 0.5, 0.5], priority: 3 },
      { id: "machine", part: "machine", local: [-0.35, 0.5, 0.5], priority: 2 },
      { id: "rail", part: "rail", local: [-0.4, -0.5, 0.5], priority: 2 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    const b: Built = {
      tiles: line.tiles,
      feeds: line.feeds,
      bands: line.bands,
      notes: rack.parts.filter((p) => p.id.startsWith("rack.note.")) as BlockPart[],
      card,
      slots: { feeds: line.slots.feeds, bands: line.slots.bands, read: readSlot },
    };
    built.set(scene, b);
    pose(b, BUILT_POSE, null, null, null);
    const tags: SceneTags = {
      anchors: [
        ...Array.from({ length: RAIL_SLOTS }, (_, i) => ({
          id: `word.${i}`,
          part: `word.${i}`,
          local: [0, 0, 0.5] as Vec3,
          priority: 0,
        })),
        { id: "card", part: "card", local: [0, 0, 0.5], priority: 0 },
        { id: "memory", part: "rack.frame.board", local: [0.3, 0.5, 0.5], priority: 0 },
        // The phase note (sharing, the window, the trip): on the floor in front, right.
        { id: "note", part: "rack.frame.board", local: [0.62, 0, 0.5], priority: 0 },
      ],
      text: Array.from({ length: RAIL_SLOTS + 3 }, () => ""),
      emphasis: [...Array.from({ length: RAIL_SLOTS + 1 }, () => true), false, false],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const typed = ui.text !== null;
    const ch = (id: string, loop: number, still: number) =>
      typed ? still : (tl.channels[id] ?? loop);
    const state: Pose = {
      step: ch("step", KV_STEPS, KV_STEPS),
      ghost: ch("ghost", 0, 0),
      shared: ch("shared", 0, 0),
      window: ch("window", 0, 0),
      trip: ch("trip", 0, 0),
      words: ui.slider,
    };
    const data = run?.kind === "kv-cache" ? run : null;
    pose(
      built.get(frame.input.scene)!,
      state,
      data,
      frame.input.dynamics.intensity,
      frame.tags.text,
    );
  },
};

interface Pose {
  step: number;
  ghost: number;
  shared: number;
  window: number;
  trip: number;
  words: number;
}

const BUILT_POSE: Pose = {
  step: KV_STEPS,
  ghost: 0,
  shared: 0,
  window: 0,
  trip: 0,
  words: KV_STEPS,
};

/** Notes held after `done` steps of a `prompt`-token text (each word's notes written once). */
export function notesWritten(prompt: number, done: number): number {
  return done === 0 ? 0 : prompt + done - 1;
}

function pose(
  b: Built,
  state: Pose,
  data: KvRun | null,
  intensity: Float32Array | null,
  text: string[] | null,
): void {
  const prompt = data?.tokens.length ?? 10;
  const steps = data?.steps ?? [];
  const total = Math.min(steps.length, KV_STEPS, state.words);
  const done = Math.min(Math.floor(state.step), total);
  const phase = state.step - Math.floor(state.step);
  const live = done < total ? phase : 0;
  const onRail = prompt + done;
  const kvHeads = data?.kvHeads ?? 2;

  for (let i = 0; i < RAIL_SLOTS; i++) placeTile(b.tiles[i]!, i, i < onRail ? 1 : 0);

  // The live step's feed: the whole prompt on the first pass, then only the newest word.
  const sweep = Math.min(1, live / PHASE.sweep);
  const first = done === 0 ? 0 : onRail - 1;
  for (let i = 0; i < RAIL_SLOTS; i++) {
    const fed = live > 0 && i >= first && i < onRail;
    const lit = fed && sweep * (onRail - first) > i - first ? 1 : 0;
    // Once the notes exist, only the word being fed keeps its pipe to the machine.
    const piped = i < onRail && (done === 0 || fed || live === 0);
    placeFeed(b.feeds[i]!.transform, i, piped ? 1 : 0, 0.012);
    if (intensity) intensity[b.slots.feeds + i] = i < onRail ? 0.1 + 1.2 * lit : 0;
  }
  const running =
    live >= PHASE.sweep && live < PHASE.run ? (live - PHASE.sweep) / (PHASE.run - PHASE.sweep) : 0;
  if (intensity) {
    for (let l = 0; l < LAYERS; l++)
      intensity[b.slots.bands + l] = 0.5 + (running * LAYERS > l ? 1.1 : 0);
    // The read line glows while a word after the first pass reads the notes.
    intensity[b.slots.read] = done > 0 && live > PHASE.sweep * 0.5 && live < PHASE.run ? 1.6 : 0.15;
  }

  // Notes: a word's column is written as the pass that first reads it sweeps past; every
  // written column glows while a later step reads it. The model keeps one note per KV head;
  // the extra slots show, smaller, what unshared readers would need. The
  // window evicts every column older than its last `window` positions.
  const written =
    notesWritten(prompt, done) + (live > 0 ? Math.round(sweep * (onRail - first)) : 0);
  const kept = data ? Math.min(written, data.window) : written;
  const oldest = written - kept;
  for (let l = 0; l < LAYERS; l++)
    for (let c = 0; c < RAIL_SLOTS; c++) {
      const has = c < written;
      const evicted = has && c < oldest ? state.window : 0;
      for (let n = 0; n < SLOTS_PER_CELL; n++) {
        const shared = n < kvHeads;
        const fill = has ? (shared ? 1 : GHOST_SIZE * state.ghost) * (1 - evicted) : 0;
        placeNote(b.notes[noteIndex(l, c, n)]!.transform, RACK, l, c, n, fill);
      }
      if (intensity) {
        const reading = done > 0 && live > 0 && live < PHASE.run && has;
        intensity[RACK.slot + 1 + l * RAIL_SLOTS + c] = has ? (reading ? 0.8 : 0.2) : 0;
      }
    }

  // The new word: as in chapter 9, it appears above the machine and arcs to the rail.
  const flying = cardFlight(live);
  if (flying >= 0 && done < total)
    placeCard(b.card, flying, [slotX(onRail), LINE.rail.y + 0.25, LINE.rail.z]);
  else placeCard(b.card, -1);

  if (!text || !data) return;
  for (let i = 0; i < RAIL_SLOTS; i++) {
    const word = i < prompt ? data.tokens[i] : steps[i - prompt]?.word;
    // In the window phase, words whose notes were evicted drop out of the text shown.
    const dropped = state.window > 0.5 && i < oldest;
    text[i] = i < onRail && word && !dropped ? tokenLabel(word) : "";
  }
  text[RAIL_SLOTS] = flying >= 0 && done < total ? steps[done]!.word.trim() : "";
  const held = state.window > 0.5 ? kept : written;
  const perWord =
    state.ghost > 0.5 ? (data.bytesPerToken * data.heads) / data.kvHeads : data.bytesPerToken;
  text[RAIL_SLOTS + 1] = written
    ? `notes: ${held} words × ${formatStat(perWord, "bytes")} = ${formatStat(held * perWord, "bytes")}`
    : "";
  const wrote = steps
    .slice(0, total)
    .map((w) => w.word)
    .join("")
    .trim();
  const weights = formatStat(evalArith("weightBytes", { weightBytes: 2 }), "bytes");
  text[RAIL_SLOTS + 2] =
    state.ghost > 0.5
      ? `if each of the ${data.heads} readers kept its own:\n${data.heads} notes per word per block`
      : state.shared > 0.5
        ? `${data.heads} readers share ${data.kvHeads} sets of notes:\n${fraction(data.kvHeads, data.heads)} the memory`
        : state.window > 0.5
          ? `keep only the last ${data.window}: it writes “${data.windowed.join("").trim()}”\ninstead of “${wrote}” (not how Llama-3-8B runs)`
          : state.trip > 0.5
            ? `still, every new word waits while\nLlama-3-8B reads all ${weights} of weights`
            : "";
}
