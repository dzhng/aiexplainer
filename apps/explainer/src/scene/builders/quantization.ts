/**
 * Chapter 12's scene, built from the kit (`block`, `contactShadow`): a board showing one real
 * group of 32 weights as signed bars, a magnifier beside it on the weight the rounding moves
 * most, and two machines, 16-bit and 8-bit, each carrying its weights as a crate on its roof,
 * continuing the same prompt.
 *
 * Every number comes from the run (`SceneRun` kind "quantization", computed by the worker):
 * the strip's values are `full`'s stored f16 weights and `full-q8`'s `scale · q`; the 8-bit
 * crate's height is the measured `q8-bytes` ratio; the words are each model's greedy picks.
 * At the strip's scale the rounding is invisible (the honest read: the photo barely changes),
 * so the magnifier draws the chosen weight against the 8-bit grid, zoomed so one step shows:
 * a dim tick stays where the 16-bit value was, and the bright marker snaps onto a grid line.
 *
 * Loop channels read: `res` (0 16-bit → 1 8-bit), `crate` (the 8-bit crate appears),
 * `words` (words each machine has added), `trip` (the failure beat's pulse). Typed text or a
 * scenario shows everything at its end state; a moved slider picks 16- or 8-bit weights.
 */
import {
  KIT,
  blockFootprint,
  type BlockPart,
  type SceneAnchor,
  type SceneDesc,
} from "@repo/renderer";
import type { Vec3 } from "math";
import { formatStat } from "../../chapters/format.ts";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import type { QuantizationRun, SceneBuilder, SceneFrame } from "../build-frame.ts";
import { box } from "./parts.ts";

const BARS = 32;
/** The strip board: centre, size, and the bars' pitch, size and half-range, metres. */
const BOARD = { x: -0.95, y: 1.35, w: 2.35, h: 1.35 };
const BAR = { pitch: 0.068, width: 0.048, depth: 0.03, half: 0.56 };
/** The magnifier beside the board: centre, size, grid lines shown, one 8-bit step's height. */
const LENS = { x: 0.6, y: 1.35, w: 0.46, h: 1.35, lines: 9, step: 0.135 };
const MARKER = { w: 0.36, h: 0.022 };
/** The two machines (16-bit, then 8-bit) and the crate each carries; the 16-bit crate's height. */
const MACHINE = { w: 0.62, h: 0.62, d: 0.55, xs: [1.65, 2.45] as const };
const CRATE = { w: 0.48, d: 0.46, h: 0.95 };
const LAMP = { w: 0.34, h: 0.05, d: 0.02 };
const FOCUS_GAIN = 2.5;
const TRIP_GAIN = 0.9;

const EXPLODE = {
  strip: [0, 0, 0.45] as Vec3,
  board: [0, 0, -0.35] as Vec3,
  lens: [0.35, 0, 0.45] as Vec3,
  crates: [0, 0.3, 0.2] as Vec3,
  machines: [0.35, 0, 0] as Vec3,
};

/** Which strip weight the rounding moves most, in steps: the one the magnifier shows. */
export function lensIndex(strip: QuantizationRun["strip"]): number {
  let best = 0;
  let worst = -1;
  strip.full.forEach((v, i) => {
    const off = Math.abs(v / strip.scale - strip.q[i]!);
    if (off > worst) [best, worst] = [i, off];
  });
  return best;
}

/** The magnifier's zoom over the strip: how much taller one 8-bit step is drawn. */
function lensZoom(strip: QuantizationRun["strip"]): number {
  const largest = Math.max(...strip.full.map(Math.abs));
  return LENS.step / ((strip.scale / largest) * BAR.half);
}

/** Words each machine shows, and how many of those match between the two. */
function wordsShown(run: QuantizationRun, count: number) {
  const n = Math.max(0, Math.min(count, run.full.length, run.q8.length));
  const full = run.full.slice(0, n);
  const q8 = run.q8.slice(0, n);
  return { full, q8, same: full.filter((w, i) => w === q8[i]).length };
}

/** A block's transform: size and centre (allocation-free). */
function put(t: number[], size: readonly number[], center: readonly number[]) {
  t[0] = size[0]!;
  t[5] = size[1]!;
  t[10] = size[2]!;
  t[12] = center[0]!;
  t[13] = center[1]!;
  t[14] = center[2]!;
}

interface Built {
  bars: BlockPart[];
  marker: BlockPart;
  ghost: BlockPart;
  crate8: BlockPart;
}
const built = new WeakMap<SceneDesc, Built>();

const TAG = { words: 0, board: 1, lens: 2, c16: 3, c8: 4, ratio: 5 } as const;
/** Dynamics slots: board 0, bars 1…32, then the rest one each. */
const SLOT = {
  board: 0,
  bars: 1,
  lens: 1 + BARS,
  grid: 2 + BARS,
  marker: 3 + BARS,
  ghost: 4 + BARS,
  crates: 5 + BARS,
  machines: 6 + BARS,
  lamps: 7 + BARS,
  shadow: 8 + BARS,
} as const;

const barX = (i: number) => BOARD.x + (i - (BARS - 1) / 2) * BAR.pitch;
const crateY = (h: number) => MACHINE.h + h / 2;

export const quantization: SceneBuilder = {
  assets: {},
  tagCount: 6,

  create(assets, revision) {
    const legs = (id: string, slot: number, x: number, w: number, explode: Vec3) =>
      [-1, 1].map((side, i) =>
        box(
          `${id}.leg.${i}`,
          slot,
          "metal",
          [x + side * (w / 2 - 0.12), (BOARD.y - BOARD.h / 2) / 2, -0.05],
          [0.06, BOARD.y - BOARD.h / 2, 0.06],
          explode,
        ),
      );
    const boardLegs = legs("board", SLOT.board, BOARD.x, BOARD.w, EXPLODE.board);
    const lensLegs = legs("lens", SLOT.lens, LENS.x, LENS.w + 0.1, EXPLODE.lens);
    const board = [
      box(
        "board",
        SLOT.board,
        "housing",
        [BOARD.x, BOARD.y, -0.05],
        [BOARD.w, BOARD.h, 0.06],
        EXPLODE.board,
      ),
      ...boardLegs,
      box(
        "board.zero",
        SLOT.board,
        "card",
        [BOARD.x, BOARD.y, 0.0],
        [BOARD.w - 0.12, 0.006, 0.01],
        EXPLODE.strip,
      ),
    ];
    const bars = Array.from({ length: BARS }, (_, i) =>
      box(
        `bar.${i}`,
        SLOT.bars + i,
        "bar",
        [barX(i), BOARD.y, 0.02],
        [BAR.width, 0.01, BAR.depth],
        EXPLODE.strip,
      ),
    );
    const lens = [
      box(
        "lens",
        SLOT.lens,
        "housing",
        [LENS.x, LENS.y, -0.05],
        [LENS.w, LENS.h, 0.06],
        EXPLODE.lens,
      ),
      ...lensLegs,
      ...Array.from({ length: LENS.lines }, (_, k) =>
        box(
          `lens.grid.${k}`,
          SLOT.grid,
          "card",
          [LENS.x, LENS.y + (k - (LENS.lines - 1) / 2) * LENS.step, 0.0],
          [LENS.w - 0.08, 0.012, 0.012],
          EXPLODE.lens,
        ),
      ),
    ];
    // The ghost stays where the 16-bit value was; the marker is the value now.
    const ghost = box(
      "lens.ghost",
      SLOT.ghost,
      "prompt",
      [LENS.x, LENS.y, 0.015],
      [MARKER.w * 0.55, MARKER.h * 0.6, 0.02],
      EXPLODE.lens,
    );
    const marker = box(
      "lens.marker",
      SLOT.marker,
      "bar",
      [LENS.x, LENS.y, 0.025],
      [MARKER.w, MARKER.h, 0.03],
      EXPLODE.lens,
    );
    const bodies = MACHINE.xs.map((x, i) =>
      box(
        `machine.${i}`,
        SLOT.machines,
        "steel",
        [x, MACHINE.h / 2, 0],
        [MACHINE.w, MACHINE.h, MACHINE.d],
        EXPLODE.machines,
      ),
    );
    const machines = MACHINE.xs.flatMap((x, i) => [
      bodies[i]!,
      box(
        `machine.lamp.${i}`,
        SLOT.lamps,
        "bar",
        [x, MACHINE.h * 0.7, MACHINE.d / 2 + LAMP.d / 2],
        [LAMP.w, LAMP.h, LAMP.d],
        EXPLODE.machines,
      ),
    ]);
    const crate16 = box(
      "crate.16",
      SLOT.crates,
      "crate",
      [MACHINE.xs[0], crateY(CRATE.h), 0],
      [CRATE.w, CRATE.h, CRATE.d],
      EXPLODE.crates,
    );
    const crate8 = box(
      "crate.8",
      SLOT.crates,
      "crate",
      [MACHINE.xs[1], crateY(0.004), 0],
      [CRATE.w, 0.004, CRATE.d],
      EXPLODE.crates,
    );
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: SLOT.shadow,
      bounds: [BOARD.x - BOARD.w / 2, 0, -0.4, MACHINE.xs[1] + MACHINE.w / 2, 0.1, 0.45],
      softness: 0.25,
      // Each leg and each machine's base touches the floor.
      feet: [...boardLegs, ...lensLegs, ...bodies].map(blockFootprint),
    });
    const parts = [
      ...shadow.parts,
      ...board,
      ...bars,
      ...lens,
      ghost,
      marker,
      ...machines,
      crate16,
      crate8,
    ];
    const anchors: SceneAnchor[] = [
      { id: "strip", part: "board", local: [-0.42, 0.5, 0.5], priority: 2 },
      { id: "lens", part: "lens", local: [0.5, -0.42, 0.5], priority: 2 },
      { id: "crates", part: "crate.16", local: [-0.5, 0.3, 0.5], priority: 2 },
      { id: "machines", part: "machine.1", local: [0.5, -0.38, 0.5], priority: 3 },
    ];
    const scene: SceneDesc = { revision, parts, anchors, assets };
    built.set(scene, { bars, marker, ghost, crate8 });
    const tags: SceneTags = {
      anchors: [
        // Above both crates, between the machines.
        {
          id: "words",
          part: "crate.16",
          local: [((MACHINE.xs[1] - MACHINE.xs[0]) * 0.85) / CRATE.w, 0.62, 0],
          priority: 0,
        },
        { id: "board", part: "board", local: [0, 0.56, 0.5], priority: 0 },
        { id: "lens", part: "lens", local: [0, 0.56, 0.5], priority: 0 },
        { id: "c16", part: "machine.0", local: [0, -0.3, 0.5], priority: 0 },
        { id: "c8", part: "machine.1", local: [0, -0.3, 0.5], priority: 0 },
        // Just above the 8-bit crate, which grows from the machine's roof.
        { id: "ratio", part: "crate.8", local: [0, 0.5, 0.5], priority: 0 },
      ],
      text: Array.from({ length: 6 }, () => ""),
      style: ["above", "above", "above", "above", "above", "above"],
    };
    return { scene, tags };
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const { bars, marker, ghost, crate8 } = built.get(scene)!;
    const texts = frame.tags.text;
    const typed = ui.text !== null;
    const c = tl.channels;
    const res = typed || ui.sliderSet ? (ui.slider === 1 ? 1 : 0) : (c.res ?? 0);
    const crate = typed || ui.sliderSet ? 1 : (c.crate ?? 0);
    const words = typed ? Infinity : Math.round(c.words ?? 0);
    const trip = typed ? 0 : (c.trip ?? 0);
    if (run?.kind !== "quantization") {
      texts.fill("");
      return;
    }
    const { strip } = run;
    const largest = Math.max(...strip.full.map(Math.abs));
    const lensAt = lensIndex(strip);
    for (let i = 0; i < BARS; i++) {
      const v = strip.full[i]! + (strip.q8[i]! - strip.full[i]!) * res;
      const h = Math.max(0.004, (Math.abs(v) / largest) * BAR.half);
      put(
        bars[i]!.transform,
        [BAR.width, h, BAR.depth],
        [barX(i), BOARD.y + Math.sign(v) * (h / 2), 0.02],
      );
      dynamics.intensity[SLOT.bars + i] = i === lensAt ? FOCUS_GAIN : 0.6;
    }
    // The magnifier centres on the chosen weight's 8-bit number: the 16-bit value sits between
    // grid lines (the ghost stays there) and the marker snaps onto the line as it rounds.
    const was = strip.full[lensAt]! / strip.scale - strip.q[lensAt]!;
    put(
      ghost.transform,
      [MARKER.w * 0.55, MARKER.h * 0.6, 0.02],
      [LENS.x, LENS.y + was * LENS.step, 0.015],
    );
    put(
      marker.transform,
      [MARKER.w, MARKER.h, 0.03],
      [LENS.x, LENS.y + was * (1 - res) * LENS.step, 0.025],
    );
    dynamics.intensity[SLOT.marker] = FOCUS_GAIN;
    dynamics.intensity[SLOT.ghost] = res > 0.05 ? 0.8 : 0;

    const h8 = Math.max(0.004, CRATE.h * run.byteRatio * crate);
    put(crate8.transform, [CRATE.w, h8, CRATE.d], [MACHINE.xs[1], crateY(h8), 0]);
    dynamics.intensity[SLOT.crates] = 0;
    dynamics.intensity[SLOT.lamps] = 0.35 + trip * TRIP_GAIN;

    const shown = wordsShown(run, words);
    const tail = run.prompt.length > 16 ? `…${run.prompt.slice(-14)}` : run.prompt;
    const n = shown.full.length;
    const note = trip > 0.5 ? " · still one word per trip" : "";
    texts[TAG.words] =
      n > 0
        ? `16-bit: ${tail}${shown.full.join("")}\n 8-bit: ${tail}${shown.q8.join("")}\nsame word ${shown.same} of ${n}${note}`
        : `${tail}…`;
    texts[TAG.board] =
      res < 0.5 ? "32 real weights, stored at 16 bits" : "the same weights, rounded to 8 bits";
    texts[TAG.lens] =
      `one weight, zoomed ×${Math.round(lensZoom(strip))}\none line = one 8-bit step`;
    texts[TAG.c16] = "16-bit";
    texts[TAG.c8] = "8-bit";
    texts[TAG.ratio] = crate > 0.5 ? `${formatStat(run.byteRatio, "pct")} of the bytes` : "";
  },
};
