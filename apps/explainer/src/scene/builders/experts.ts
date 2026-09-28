/**
 * Chapter 14's scene, built from the kit (`triageBays`, `block`, `bars`, `contactShadow`, `text`): a
 * row of 8 expert bays behind a router desk, the words queueing beside the desk, and a usage
 * bar in front of each bay.
 *
 * Every choice is the run's (`SceneRun` kind "experts": the `moe` router's real top-2 experts
 * and weights per token, from the forward trace). A word steps up to the desk, then two copies
 * of it walk into its two bays, whose lamps light while the other six stay dark. The usage
 * bars are the export gate's evidence, each bay's share of routing slots on held-out text.
 *
 * Loop channels read: `token` (which word is at the desk), `route` (0 at the desk → 1 in the
 * bays), `usage` (the histogram rising). Typed text holds its first word routed.
 */
import {
  KIT,
  TRIAGE_SLOTS,
  bayCenter,
  deskCenter,
  placeBar,
  text,
  type BarSlot,
  type BlockPart,
  type SceneAnchor,
  type SceneDesc,
  type SceneText,
  type TriageBaysParams,
} from "@repo/renderer";
import type { Vec3 } from "math";
import type { ExpertsRun, SceneBuilder, SceneFrame } from "../build-frame.ts";

const EXPERTS = 8;
const QUEUE = 6;
const BAYS: TriageBaysParams = {
  id: "triage",
  slot: 0,
  center: [0, 0, -0.55],
  bays: EXPERTS,
  bay: [0.5, 0.95, 0.55],
  gap: 0.07,
  desk: [0.8, 0.75, 0.5],
  // Front left of the row, so the words walk across to their bays in plain view.
  deskAt: [-2.95, 1.25],
  materials: { booth: "housing", wall: "metal", desk: "steel", lamp: "bar" },
};
const TILE: Vec3 = [0.36, 0.2, 0.06];
/**
 * Where queued words wait: a line in front of the desk running right along the bays, one
 * pitch apart, the next word at its left end by the desk. So the queue reads left to right
 * in story order, and each word steps left to the desk.
 */
const QUEUE_AT = { dx: 0.55, dz: 0.55, pitch: 0.42 };
/** A usage bar's height per unit share (1.0 = every slot), metres. */
const USAGE_HEIGHT = 3;
const LAMP_ON = 2.4;
const HIDDEN_Y = -5;

const desk = deskCenter(BAYS);
const deskTop: Vec3 = [desk[0], desk[1] + BAYS.desk[1] / 2 + TILE[1] / 2 + 0.01, desk[2]];

/** Where a word's copy stands once it is in bay `e`. */
function inBay(e: number): Vec3 {
  const [x, y, z] = bayCenter(BAYS, e);
  return [x, y + 0.35, z + 0.05];
}

const lerp = (a: Vec3, b: Vec3, u: number): Vec3 => [
  a[0] + (b[0] - a[0]) * u,
  a[1] + (b[1] - a[1]) * u + Math.sin(Math.PI * u) * 0.25,
  a[2] + (b[2] - a[2]) * u,
];

function put(t: number[], c: readonly number[], s: readonly number[] = TILE) {
  t[0] = s[0]!;
  t[5] = s[1]!;
  t[10] = s[2]!;
  t[12] = c[0]!;
  t[13] = c[1]!;
  t[14] = c[2]!;
}

/**
 * Font sizes (em), metres: a word on its tile, the routing note on the desk, a bay's weight
 * on its back wall and number on its floor, and a bay's usage share.
 */
const TEXT = { word: 0.1, desk: 0.1, weight: 0.12, number: 0.2, share: 0.085 };
/** The weight's height on a bay's back wall (unit block), clear of its word and its lamp. */
const WEIGHT_Y = 0.12;
/** The number's place on a bay's floor, toward its front (unit block). */
const NUMBER_Z = 0.25;

interface Texts {
  queue: SceneText[];
  copies: SceneText[];
  desk: SceneText;
  weights: SceneText[];
  shares: SceneText[];
  numbers: SceneText[];
}

interface Built {
  queue: BlockPart[];
  copies: BlockPart[];
  bars: BlockPart[];
  barSlots: BarSlot[];
  even: BlockPart;
  text: Texts;
}
const built = new WeakMap<SceneDesc, Built>();
const SLOT = {
  bays: 0,
  words: TRIAGE_SLOTS.lamps + EXPERTS,
  bars: TRIAGE_SLOTS.lamps + EXPERTS + 1,
  even: TRIAGE_SLOTS.lamps + EXPERTS + 1 + EXPERTS,
  shadow: TRIAGE_SLOTS.lamps + EXPERTS + 2 + EXPERTS,
} as const;

/** The routing the scene shows for word `n`: its two bays and the router's weights for them. */
function routing(run: ExpertsRun, n: number) {
  const token = run.tokens[Math.max(0, Math.min(n, run.tokens.length - 1))]!;
  return { text: token.text, bays: token.experts, weights: token.weights };
}

export const experts: SceneBuilder = {
  assets: {},

  create(assets, revision) {
    const triage = KIT.triageBays.build(BAYS);
    const tile = (id: string) =>
      KIT.block.build({
        id,
        slot: SLOT.words,
        material: "card",
        center: [0, HIDDEN_Y, 0],
        size: TILE,
      }).parts[0] as BlockPart;
    const queue = Array.from({ length: QUEUE }, (_, i) => tile(`word.${i}`));
    const copies = [tile("copy.0"), tile("copy.1")];
    const barSlots: BarSlot[] = Array.from({ length: EXPERTS }, (_, e) => {
      const [x, , z] = bayCenter(BAYS, e);
      return {
        x,
        z: z + BAYS.bay[2] / 2 + 0.2,
        floor: 0,
        width: 0.22,
        depth: 0.08,
        maxHeight: USAGE_HEIGHT,
      };
    });
    const bars = KIT.bars.build({
      id: "usage",
      slot: SLOT.bars,
      material: "prompt",
      slots: barSlots,
    });
    const shadow = KIT.contactShadow.build({
      id: "shadow",
      slot: SLOT.shadow,
      bounds: triage.bounds,
      softness: 0.25,
    });
    // The even share (1 ÷ experts) as a line across the bars: a bar on it got exactly its share.
    const [x0] = bayCenter(BAYS, 0);
    const [x1] = bayCenter(BAYS, EXPERTS - 1);
    const even = KIT.block.build({
      id: "usage.even",
      slot: SLOT.even,
      material: "card",
      center: [(x0 + x1) / 2, HIDDEN_Y, barSlots[0]!.z],
      size: [x1 - x0 + 0.4, 0.012, 0.012],
    }).parts[0] as BlockPart;
    const parts = [...shadow.parts, ...triage.parts, ...queue, ...copies, ...bars.parts, even];
    const anchors: SceneAnchor[] = [
      { id: "desk", part: "triage.desk", local: [0.5, 0.2, 0.5], priority: 3 },
      { id: "bays", part: "triage.bay.7", local: [0.5, 0.45, 0.5], priority: 2 },
      // Where the queue starts, low on the desk's front right corner (the tiles themselves move).
      { id: "tokens", part: "triage.desk", local: [0.5, -0.4, 0.5], priority: 2 },
      { id: "usage", part: "usage.0", local: [-0.5, 0, 0.5], priority: 1 },
    ];
    // Every word is written on its own tile; the routing note on the router desk's front; the
    // router's weight for a bay on that bay's back wall, above where its word stands; each
    // bay's number painted on its floor, at the front; each bay's usage share just above its
    // usage bar, which it measures.
    const wordOn = (p: BlockPart) =>
      text({
        id: p.id,
        part: p.id,
        local: [0, 0, 0.5],
        size: TEXT.word,
        style: "ink",
        maxWidth: TILE[0] - 0.04,
      });
    const onWall = (id: string, e: number, y: number, size: number) =>
      text({ id, part: `triage.bay.${e}`, local: [0, y, 0.5], size, style: "chalk" });
    const texts: Texts = {
      queue: queue.map(wordOn),
      copies: copies.map(wordOn),
      desk: text({
        id: "desk",
        part: "triage.desk",
        local: [0, 0.05, 0.5],
        size: TEXT.desk,
        style: "chalk",
        maxWidth: BAYS.desk[0] - 0.08,
      }),
      weights: Array.from({ length: EXPERTS }, (_, e) =>
        onWall(`weight.${e}`, e, WEIGHT_Y, TEXT.weight),
      ),
      shares: Array.from({ length: EXPERTS }, (_, e) =>
        text({
          id: `share.${e}`,
          part: `usage.${e}`,
          local: [0, 0.5, 0.5],
          size: TEXT.share,
          style: "chalk",
          align: [0.5, 1.3],
        }),
      ),
      numbers: Array.from({ length: EXPERTS }, (_, e) =>
        text({
          id: `number.${e}`,
          part: `triage.bay.${e}.floor`,
          local: [0, 0.5, NUMBER_Z],
          face: "top",
          size: TEXT.number,
          style: "chalk",
        }),
      ),
    };
    const scene: SceneDesc = {
      revision,
      parts,
      anchors,
      assets,
      text: [
        ...texts.queue,
        ...texts.copies,
        texts.desk,
        ...texts.weights,
        ...texts.shares,
        ...texts.numbers,
      ],
    };
    built.set(scene, {
      queue,
      copies,
      bars: bars.parts as BlockPart[],
      barSlots,
      even,
      text: texts,
    });
    return scene;
  },

  update(frame: SceneFrame, _def, tl, ui, run) {
    const { scene, dynamics } = frame.input;
    const { queue, copies, bars, barSlots, even, text: texts } = built.get(scene)!;
    for (const t of scene.text!) t.text = "";
    for (let e = 0; e < EXPERTS; e++) dynamics.intensity[TRIAGE_SLOTS.lamps + e] = 0;
    if (run?.kind !== "experts") return;
    const c = tl.channels;
    const held = ui.text !== null;
    const at = held ? 0 : Math.round(c.token ?? 0);
    const route = held ? 1 : (c.route ?? 0);
    const usage = held ? 1 : (c.usage ?? 0);
    const n = Math.max(0, Math.min(at, run.tokens.length - 1));

    // The queue: word n on the desk, the ones after it waiting in front, the rest gone.
    for (let i = 0; i < QUEUE; i++) {
      const t = queue[i]!.transform;
      const word = run.tokens[i];
      // Once the histogram rises, every word has been seen.
      if (!word || i < n || (i === n && route > 0.02) || (!held && usage > 0)) {
        put(t, [0, HIDDEN_Y, 0]);
        continue;
      }
      // Waiting words stand in a line from the desk rightward, the next one nearest.
      const waiting: Vec3 = [
        desk[0] + QUEUE_AT.dx + (i - n - 1) * QUEUE_AT.pitch,
        TILE[1] / 2 + 0.3,
        desk[2] + QUEUE_AT.dz,
      ];
      put(t, i === n ? deskTop : waiting);
      texts.queue[i]!.text = word.text.trim();
    }
    const { text: word, bays, weights } = routing(run, n);
    copies.forEach((copy, j) => {
      const bay = bays[j]!;
      if (route <= 0.02) return put(copy.transform, [0, HIDDEN_Y, 0]);
      put(copy.transform, lerp(deskTop, inBay(bay), route));
      texts.copies[j]!.text = word.trim();
    });
    if (route > 0.5) {
      bays.forEach((bay, j) => {
        dynamics.intensity[TRIAGE_SLOTS.lamps + bay] = LAMP_ON;
        texts.weights[bay]!.text = `${Math.round(weights[j]! * 100)}%`;
      });
      const to = bays.map((b) => b + 1).join(" and ");
      texts.desk.text = `“${word.trim()}” →\nbays ${to}\n(layer ${run.layer + 1} of ${run.layers})`;
    }
    for (let e = 0; e < EXPERTS; e++) {
      const used = run.usage[e]!;
      placeBar(bars[e]!.transform, barSlots[e]!, used * USAGE_HEIGHT * usage);
      if (usage > 0.9) texts.shares[e]!.text = `${(used * 100).toFixed(1)}%`;
    }
    for (let e = 0; e < EXPERTS; e++) {
      dynamics.intensity[SLOT.bars + e] = usage > 0 ? 1 : 0;
      texts.numbers[e]!.text = `${e + 1}`;
    }
    const share = 1 / EXPERTS;
    even.transform[13] = usage > 0.9 ? share * USAGE_HEIGHT : HIDDEN_Y;
  },
};
