/**
 * Chapter 13's scene, built from the kit (`block`, `draftStrip`, `contactShadow`, `text`): a small
 * junior machine (the drafter), a big senior machine (the target), the draft strip between
 * them, and a rail with the story so far.
 *
 * Every word is the run's (`SceneRun` kind "speculative": seeded `speculate` rounds for each
 * k). A round plays as: the junior's guesses appear one by one, the senior checks them in one
 * read (its lamp pulses), then kept guesses turn gold, discarded ones dark, and the senior's
 * own word (blue) joins: a correction at the first rejection, a bonus if all were kept. The
 * slider picks k; the loop plays the first rounds for it.
 *
 * Loop channels read: `round` (which round), `phase` (0 → 1 drafting, 1.25 verdict, 1.5 the
 * kept words join the story), `check` (the senior's read), `heavy` (the failure beat).
 */
import {
  KIT,
  draftTileCenter,
  faceId,
  setDraftTile,
  text,
  type DraftTileState,
  type BlockPart,
  type Part,
  type SceneAnchor,
  type SceneDesc,
  type SceneText,
} from "@repo/renderer";
import type { Vec3 } from "math";
import { LOOP_ROUNDS, SPEC_RUN } from "../../chapters/data/speculative.ts";
import type { SceneBuilder, SceneFrame, SpeculativeRun } from "../build-frame.ts";
import { box } from "./parts.ts";

const TILES = SPEC_RUN.maxK + 1;
const TILE: Vec3 = [0.42, 0.26, 0.08];
const GAP = 0.05;
const STRIP_AT: Vec3 = [0, 1.7, 0.35];
const JUNIOR = { x: -2.05, size: [0.95, 0.95, 0.75] as Vec3 };
const SENIOR = { x: 2.05, size: [1.6, 1.7, 1.1] as Vec3 };
const RAIL = { y: 0.55, z: 0.75, size: [3.1, 0.06, 0.18] as Vec3 };
const LAMP = { h: 0.06, d: 0.02 };
/** How far a guess rises as it is drafted, metres. */
const RISE = 0.12;
const FACE_GLOW = 0.3;
/** How far a discarded guess falls out of the row, metres. */
const DROP = -0.3;

/** One round as the scene shows it at `phase`. */
export function roundView(round: SpeculativeRun["byK"][number]["rounds"][number], phase: number) {
  const k = round.drafted.length;
  const drafted = phase >= 1 ? k : Math.floor(phase * k + 1e-6);
  const verdict = phase >= 1.25;
  const states = Array.from({ length: k + 1 }, (_, i) => {
    // A kept <eos> ended the story: the senior adds no word.
    if (i === k) return verdict && round.next !== null ? "added" : "hidden";
    if (i >= drafted) return "hidden";
    if (!verdict) return "drafted";
    return i < round.accepted ? "accepted" : "rejected";
  });
  return { states, verdict, joined: phase >= 1.5 };
}

/** The story after `rounds` rounds: each round's kept guesses, then the target's word. */
export function storyAfter(rounds: SpeculativeRun["byK"][number]["rounds"], count: number) {
  return rounds
    .slice(0, count)
    .flatMap((r) => [...r.drafted.slice(0, r.accepted), r.next ?? ""])
    .join("");
}

/** Font sizes (em), metres: a tile's word, the senior's notes, the story on the rail. */
const TEXT = { tile: 0.1, note: 0.1, story: 0.11 };
/** The senior's notes sit this far up its front (unit block): under its lamp, clear of the rail. */
const NOTE_Y = -0.02;
/** Each tile's ink by the face showing: a discarded guess reads dim on its dark face. */
const TILE_STYLE: Record<DraftTileState, string> = {
  hidden: "ink",
  drafted: "ink",
  accepted: "ink",
  rejected: "muted",
  added: "ink",
};

interface Texts {
  tiles: SceneText[];
  added: SceneText;
  senior: SceneText;
  story: SceneText;
}

interface Built {
  strip: Part[];
  lamps: BlockPart[];
  text: Texts;
}
const built = new WeakMap<SceneDesc, Built>();
const SLOT = { junior: 0, senior: 1, lamps: 2, strip: 4, rail: 8, shadow: 9 } as const;

export const speculative: SceneBuilder = {
  assets: {},

  create(assets, revision) {
    const junior = box(
      "junior",
      SLOT.junior,
      "steel",
      [JUNIOR.x, JUNIOR.size[1] / 2, 0],
      JUNIOR.size,
    );
    const senior = box(
      "senior",
      SLOT.senior,
      "steel",
      [SENIOR.x, SENIOR.size[1] / 2, 0],
      SENIOR.size,
    );
    const lamps = [
      box(
        "junior.lamp",
        SLOT.lamps,
        "bar",
        [JUNIOR.x, JUNIOR.size[1] * 0.72, JUNIOR.size[2] / 2 + LAMP.d / 2],
        [JUNIOR.size[0] * 0.55, LAMP.h, LAMP.d],
      ),
      box(
        "senior.lamp",
        SLOT.lamps + 1,
        "bar",
        [SENIOR.x, SENIOR.size[1] * 0.78, SENIOR.size[2] / 2 + LAMP.d / 2],
        [SENIOR.size[0] * 0.6, LAMP.h, LAMP.d],
      ),
    ];
    const strip = KIT.draftStrip.build({
      id: "draft",
      slot: SLOT.strip,
      center: STRIP_AT,
      count: TILES,
      tile: TILE,
      gap: GAP,
      states: Array.from({ length: TILES }, () => "hidden"),
    });
    const rail = box("rail", SLOT.rail, "metal", [0, RAIL.y, RAIL.z], RAIL.size);
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: SLOT.shadow,
      bounds: [JUNIOR.x - 0.4, 0, -0.5, SENIOR.x + 0.7, 0.1, 0.9],
      softness: 0.25,
    });
    const parts = [...shadow.parts, junior, senior, ...lamps, ...strip.parts, rail];
    const anchors: SceneAnchor[] = [
      { id: "junior", part: "junior", local: [-0.5, 0.35, 0.5], priority: 2 },
      { id: "senior", part: "senior", local: [0.5, 0.2, 0.5], priority: 2 },
      { id: "draft", part: "rail", local: [-0.45, 13.5, 0], priority: 3 },
      { id: "output", part: "rail", local: [0.5, 0, 0.5], priority: 1 },
    ];
    // Each guess is written on its tile's showing face; the senior's word is captioned just
    // above its own tile. The round's notes (drafting, the verdict) and the failure note
    // are on the senior's front, where the draft is checked; the story stands on its rail.
    const texts: Texts = {
      tiles: Array.from({ length: TILES }, (_, i) =>
        text({
          id: `tile.${i}`,
          part: faceId("draft", i),
          local: [0, 0, 0.5],
          size: TEXT.tile,
          style: "ink",
          maxWidth: TILE[0] - 0.05,
        }),
      ),
      added: text({
        id: "added",
        part: faceId("draft", 0),
        local: [0, 0.5, 0.5],
        size: TEXT.note,
        style: "chalk",
        align: [0.5, 1.5],
      }),
      senior: text({
        id: "senior",
        part: "senior",
        local: [0, NOTE_Y, 0.5],
        size: TEXT.note,
        style: "chalk",
        maxWidth: SENIOR.size[0] - 0.15,
      }),
      story: text({
        id: "story",
        part: "rail",
        local: [0, 0.5, 0.5],
        size: TEXT.story,
        style: "chalk",
        align: [0.5, 1.3],
        maxWidth: RAIL.size[0],
      }),
    };
    const scene: SceneDesc = {
      revision,
      parts,
      anchors,
      assets,
      text: [...texts.tiles, texts.added, texts.senior, texts.story],
    };
    built.set(scene, { strip: strip.parts, lamps, text: texts });
    return scene;
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const { strip, text: texts } = built.get(scene)!;
    const c = tl.channels;
    for (const t of scene.text!) t.text = "";
    if (run?.kind !== "speculative") return;
    const byK = run.byK.find((r) => r.k === ui.slider) ?? run.byK[0]!;
    // Typed text or a moved slider shows the first round's verdict, held.
    const held = ui.text !== null || ui.sliderSet;
    const roundAt = held ? 0 : Math.min(Math.round(c.round ?? 0), LOOP_ROUNDS - 1);
    const round = byK.rounds[roundAt];
    const phase = held ? 1.5 : (c.phase ?? 0);
    const view = round ? roundView(round, phase) : null;
    const count = view?.states.length ?? 0;
    const params = { center: STRIP_AT, count, tile: TILE, gap: GAP };
    for (let i = 0; i < TILES; i++) {
      const state = view && i < count ? view.states[i]! : "hidden";
      // The senior's word takes the first discarded guess's place (or the next one, a bonus).
      const slot = round && i === round.drafted.length ? round.accepted : i;
      const center = draftTileCenter(params, Math.min(slot, Math.max(0, count - 1)));
      const lift = state === "rejected" ? DROP : RISE;
      setDraftTile(strip, i, state, center, TILE, lift);
      // The word is written on whichever face is showing, in that face's ink.
      const tile = texts.tiles[i]!;
      tile.part = faceId("draft", i, state);
      tile.style = TILE_STYLE[state];
      tile.text =
        state === "hidden" || !round
          ? ""
          : (i < round.drafted.length ? round.drafted[i]! : (round.next ?? "")).trim();
    }
    // The caption rides above the senior's word's own tile, wherever it sits.
    const heavy = held ? 0 : (c.heavy ?? 0);
    if (view?.verdict && round && heavy < 0.5) {
      const all = round.accepted === round.drafted.length;
      const kept = `round ${roundAt + 1}: kept ${round.accepted} of ${round.drafted.length}`;
      if (round.next === null) texts.senior.text = `${kept},\nand the story ends`;
      else {
        texts.added.text = all ? "bonus: the senior's own word" : "the senior's correction";
        texts.added.part = faceId("draft", count - 1, "added");
        texts.senior.text = `${kept},\nplus the senior's word`;
      }
    } else if (round && heavy < 0.5) {
      texts.senior.text = `round ${roundAt + 1}: the junior\ndrafts ${round.drafted.length} words`;
    }
    const done = roundAt + (view?.joined ? 1 : 0);
    const tail = run.prompt.length > 22 ? `…${run.prompt.slice(-20)}` : run.prompt;
    texts.story.text = `${tail}${storyAfter(byK.rounds, done)}`;
    if (heavy > 0.5) texts.senior.text = "every check still runs\nthe whole senior";

    // The kept and added faces glow softly, so the word on each stays readable.
    for (let k = 1; k <= 3; k++) dynamics.intensity[SLOT.strip + k] = FACE_GLOW;
    dynamics.intensity[SLOT.lamps] = 0.8 + (view && !view.verdict ? 1.2 : 0);
    dynamics.intensity[SLOT.lamps + 1] = 0.8 + (held ? 0 : (c.check ?? 0) * 2 + (c.heavy ?? 0));
  },
};
