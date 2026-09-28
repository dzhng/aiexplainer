/**
 * Chapter 15's scene: the finished machine, composed from the other chapters' scenes. It owns
 * no part of its own. Each station (`data/finished.ts`) is its chapter's scene, built and
 * updated by that chapter's builder through `buildFrame` into a frame of its own, at its own
 * loop time and on its own run; this scene copies every station's parts into one scene, scaled
 * and placed on a grid on the floor, and passes their dynamics and scene text through.
 *
 * On top it adds only the tour: the station in view pulses (its emission breathes) while the
 * rest dim, only its scene text and its label show, and `tourPose` frames it with its own
 * chapter's shot, scaled down with it. Back on the wide shot, a wave of light runs through the
 * machine in tour order. Its one part of its own is the route: a pipe along the floor from
 * station to station in tour order, pulses flowing along it, so the stations read as one
 * machine a word flows through.
 *
 * Each station's loop runs offset so that it plays its chapter's link-preview moment
 * (`ogTimeSec`) as the camera arrives. The slider holds the tour on one station.
 */
import { KIT, type OrbitPose, type Part, type SceneAnchor, type SceneDesc } from "@repo/renderer";
import type { Vec3 } from "math";
import {
  FLOOR,
  STATIONS,
  arrivesAt,
  wholeAgainAt,
  type Station,
} from "../../chapters/data/finished.ts";
import { createTimelineState, evalTimeline, type TimelineState } from "../../chapters/timeline.ts";
import type { ChapterDef, SceneBuilderId } from "../../chapters/types.ts";
import type { SceneTags } from "../../hud/SceneTags.tsx";
import { arrivalPose } from "../../runtime/arrival.ts";
import type { SceneBuilder, SceneFrame, SceneUi, buildFrame } from "../build-frame.ts";
import { nextRevision } from "../revision.ts";
import { shotPose } from "../shots.ts";

/** How bright the station in view breathes (× its own emission), and the others while it does. */
const PULSE = { low: 1.3, high: 2.1, periodSec: 0.8 };
const DIM = 0.06;
/** The closing wave: each station's flash, and the delay from one station to the next. */
const WAVE = { peak: 1.4, sec: 0.6, stagger: 0.12 };
/** How near a whole stop the tour must be for that station to count as in view. */
const IN_VIEW = 0.25;
/**
 * The route along the floor: its height, how far in front of each station's origin it runs,
 * how far past a row's end it turns, its radius, its pulses' speed (spacings per second) and
 * its brightness while the tour is at a stop.
 */
const ROUTE = {
  y: 0.02,
  front: 0.7,
  turn: 0.95,
  radius: 0.016,
  speed: 1.2,
  glow: 0.45,
  atStop: 0.2,
};

const STOPS = STATIONS.length;

/** Where station `n`'s scene origin stands: its grid cell, on the floor. */
export function stationOrigin(n: number): Vec3 {
  const rows = Math.ceil(STOPS / FLOOR.columns);
  const row = Math.floor(n / FLOOR.columns);
  const along = n % FLOOR.columns;
  const column = row % 2 === 0 ? along : FLOOR.columns - 1 - along;
  return [
    FLOOR.center[0] + (column - (FLOOR.columns - 1) / 2) * FLOOR.cell[0],
    0,
    FLOOR.center[1] + (row - (rows - 1) / 2) * FLOOR.cell[1],
  ];
}

/** Whether another row of stations stands between station `n` and the camera. */
const hasRowInFront = (n: number) =>
  Math.floor(n / FLOOR.columns) < Math.ceil(STOPS / FLOOR.columns) - 1;

/** Station `n`'s stop: its chapter's shot, scaled down and moved with it. */
function stopPose(n: number): OrbitPose {
  const { def, scale, shot } = STATIONS[n]!;
  const pose = shotPose(shot ?? def.shot);
  const at = stationOrigin(n);
  return {
    target: [
      at[0] + pose.target[0] * scale,
      at[1] + pose.target[1] * scale,
      at[2] + pose.target[2] * scale,
    ],
    yaw: pose.yaw,
    pitch: hasRowInFront(n) ? Math.max(pose.pitch, FLOOR.minPitch) : pose.pitch,
    distance: pose.distance * scale,
    fovY: pose.fovY,
  };
}

/** The route's centreline: in front of each station in tour order, round each row's end. */
export function routePath(): Vec3[] {
  const path: Vec3[] = [];
  const at = (n: number, dx = 0): Vec3 => {
    const o = stationOrigin(n);
    return [o[0] + dx, ROUTE.y, o[2] + ROUTE.front];
  };
  for (let n = 0; n < STOPS; n++) {
    const row = Math.floor(n / FLOOR.columns);
    const way = row % 2 === 0 ? 1 : -1;
    if (n === 0) path.push(at(0, -ROUTE.turn));
    else if (n % FLOOR.columns === 0) {
      // Round the end of the row above, then along to this row's first station.
      const turnX = at(n - 1)[0] - way * ROUTE.turn;
      path.push([turnX, ROUTE.y, at(n - 1)[2]], [turnX, ROUTE.y, at(n)[2]]);
    }
    path.push(at(n));
  }
  const lastWay = Math.floor((STOPS - 1) / FLOOR.columns) % 2 === 0 ? 1 : -1;
  // It ends just past the last station: the word leaves the machine there.
  path.push(at(STOPS - 1, (lastWay * ROUTE.turn) / 2));
  return path;
}

let poses: OrbitPose[] | null = null;
/** Every stop's camera: the wide shot, the stations in order, the wide shot again. */
function tourPoses(def: ChapterDef): OrbitPose[] {
  poses ??= [shotPose(def.shot), ...STATIONS.map((_, n) => stopPose(n)), shotPose(def.shot)];
  return poses;
}

/** Where the tour is: stops counted from the wide shot (0), fractional while moving. */
function tourStop(def: ChapterDef, tl: TimelineState): number {
  return def.tour ? (tl.channels[def.tour.channel] ?? 0) : 0;
}

/** The station in view (0-based), or -1 while the camera moves or shows the whole machine. */
function stationInView(stop: number): number {
  const nearest = Math.round(stop);
  if (Math.abs(stop - nearest) > IN_VIEW || nearest < 1 || nearest > STOPS) return -1;
  return nearest - 1;
}

/** One station's own frame and where its parts, slots and tags land in the machine's. */
interface Placed {
  station: Station;
  origin: Vec3;
  prefix: string;
  frame: SceneFrame;
  tl: TimelineState;
  ui: SceneUi;
  /** The station scene's revision its parts were last copied at. */
  revision: number;
  slotBase: number;
  tagBase: number;
  /** Station part → the machine's copy of it. */
  copies: [Part, Part][];
  /** The machine's anchor for this station's label (its chapter's own label anchor). */
  anchor: SceneAnchor;
}

interface Built {
  placed: Placed[];
  /** The route's pipe and its pulses, after every station's parts. */
  route: Part[];
  routeSlot: number;
  /** Part id in a station → its id in the machine, cached so tag syncing allocates nothing. */
  ids: Map<string, string>;
}
const built = new WeakMap<SceneDesc, Built>();

function prefixed(b: Built, prefix: string, id: string): string {
  const key = prefix + id;
  let out = b.ids.get(key);
  if (out === undefined) b.ids.set(key, (out = key));
  return out;
}

/** The machine's copy of a station part: the same part, renamed, re-slotted and scaled. */
function copyPart(p: Placed, part: Part): Part {
  return {
    ...part,
    id: p.prefix + part.id,
    slot: p.slotBase + part.slot,
    transform: [...part.transform] as Part["transform"],
  };
}

/** (Re)copies every station's parts into the machine's scene: a new structure. */
function assemble(scene: SceneDesc, b: Built): void {
  scene.parts.length = 0;
  for (const p of b.placed) {
    p.copies = p.frame.input.scene.parts.map((part) => [part, copyPart(p, part)]);
    for (const [, copy] of p.copies) scene.parts.push(copy);
    p.revision = p.frame.input.scene.revision;
  }
  scene.parts.push(...b.route);
  scene.revision = nextRevision();
}

/** `out` = translate(origin) · scale · `m` (column-major 4×4). */
function place(out: number[], m: readonly number[], scale: number, origin: Vec3): void {
  for (let col = 0; col < 4; col++) {
    const w = m[col * 4 + 3]!;
    for (let r = 0; r < 3; r++) out[col * 4 + r] = m[col * 4 + r]! * scale + origin[r]! * w;
    out[col * 4 + 3] = w;
  }
}

/** The emission gain station `n` gets at this moment of the tour. */
function gain(n: number, inView: number, stop: number, t: number): number {
  // Between stops the rest stay dim; the station ahead brightens as the camera nears it.
  if (inView < 0 && stop > 0.5 && stop < STOPS + 0.5) return n === Math.round(stop) - 1 ? 1 : DIM;
  if (inView >= 0) {
    if (n !== inView) return DIM;
    const since = Math.max(0, t - arrivesAt(n));
    const breath = 0.5 - 0.5 * Math.cos((2 * Math.PI * since) / PULSE.periodSec);
    return PULSE.low + (PULSE.high - PULSE.low) * breath;
  }
  if (stop > STOPS + 0.5) {
    const u = (t - wholeAgainAt - n * WAVE.stagger) / WAVE.sec;
    return u > 0 && u < 1 ? 1 + WAVE.peak * Math.sin(Math.PI * u) : 1;
  }
  return 1;
}

type BuildFrame = typeof buildFrame;

/**
 * The finished machine's builder, over the other scenes' builders (`builders`) and the one
 * frame adapter they all run through (`build`), handed in by the registry that owns both.
 */
export function finishedScene(
  builders: Record<Exclude<SceneBuilderId, "finished">, SceneBuilder>,
  build: BuildFrame,
): SceneBuilder {
  const own = (s: Station) => builders[s.def.scene as Exclude<SceneBuilderId, "finished">];
  return {
    assets: Object.assign({}, ...STATIONS.map((s) => own(s).assets)),
    tagCount: STATIONS.reduce((n, s) => n + own(s).tagCount, 0),

    create(assets, revision) {
      const b: Built = { placed: [], route: [], routeSlot: 0, ids: new Map() };
      const tags: SceneTags = { anchors: [], text: [], style: [] };
      let slotBase = 0;
      STATIONS.forEach((station, n) => {
        const frame: SceneFrame = {
          builder: null,
          input: {
            camera: shotPose(station.def.shot),
            scene: { revision: 0, parts: [], anchors: [], assets },
            dynamics: {
              intensity: new Float32Array(1),
              widthScale: new Float32Array(1),
              flowPhase: new Float32Array(1),
            },
          },
          tags: { anchors: [], text: [], style: [] },
        };
        const ui: SceneUi = {
          follow: null,
          slider: station.def.slider?.initial ?? 0,
          sliderSet: false,
          text: null,
        };
        const tl = createTimelineState(station.def.loop);
        build(station.def, evalTimeline(station.def.loop, 0, tl), ui, null, frame);
        const prefix = `${station.def.slug}/`;
        const own = frame.input.scene.anchors.find((a) => a.id === station.label);
        if (!own) throw new Error(`finished: ${station.def.slug}'s scene has no ${station.label}`);
        const placed: Placed = {
          station,
          origin: stationOrigin(n),
          prefix,
          frame,
          tl,
          ui,
          revision: -1,
          slotBase,
          tagBase: tags.text.length,
          copies: [],
          anchor: { ...own, id: station.def.slug, part: prefix + own.part },
        };
        slotBase += frame.input.dynamics.intensity.length;
        for (const a of frame.tags.anchors)
          tags.anchors.push({ ...a, id: prefix + a.id, part: prefix + a.part });
        tags.text.push(...frame.tags.text.map(() => ""));
        tags.style.push(...frame.tags.style);
        b.placed.push(placed);
      });
      b.routeSlot = slotBase;
      const path = routePath();
      b.route = [
        { id: "route", material: "pipe", slot: slotBase, radius: ROUTE.radius },
        { id: "route.pulses", material: "pulse", slot: slotBase + 1, radius: ROUTE.radius * 1.1 },
      ].map((r) => KIT.tube.build({ ...r, path }).parts[0]!);
      const scene: SceneDesc = { revision, parts: [], anchors: [], assets };
      assemble(scene, b);
      scene.revision = revision;
      built.set(scene, b);
      return { scene, tags };
    },

    update(frame, def, tl, ui, run) {
      const { scene, dynamics } = frame.input;
      const b = built.get(scene)!;
      const runs = run?.kind === "finished" ? run.runs : null;
      const stop = tourStop(def, tl);
      const inView = stationInView(stop);
      let restructured = false;
      let layout = 0;
      b.placed.forEach((p, n) => {
        const { def: own } = p.station;
        p.ui.text = ui.text;
        evalTimeline(own.loop, own.ogTimeSec + tl.t - arrivesAt(n), p.tl);
        build(own, p.tl, p.ui, runs?.[own.slug] ?? null, p.frame);
        const sub = p.frame.input;
        if (sub.scene.revision !== p.revision) restructured = true;
        layout += sub.scene.layout ?? 0;
      });
      if (restructured) assemble(scene, b);
      scene.layout = layout + scene.revision;

      scene.anchors.length = 0;
      const text = frame.tags.text;
      b.placed.forEach((p, n) => {
        const sub = p.frame.input;
        const { scale } = p.station;
        for (const [part, copy] of p.copies)
          place(copy.transform as number[], part.transform as number[], scale, p.origin);
        const g = gain(n, inView, stop, tl.t);
        const { intensity, widthScale, flowPhase } = sub.dynamics;
        for (let k = 0; k < intensity.length; k++) {
          const slot = p.slotBase + k;
          if (slot >= dynamics.intensity.length) break;
          dynamics.intensity[slot] = intensity[k]! * g;
          dynamics.widthScale[slot] = widthScale[k]!;
          dynamics.flowPhase[slot] = flowPhase[k]!;
        }
        // Scene text: only the station in view speaks; its anchors follow its parts.
        const tags = p.frame.tags;
        for (let j = 0; j < tags.text.length; j++) {
          const anchor = frame.tags.anchors[p.tagBase + j]!;
          anchor.part = prefixed(b, p.prefix, tags.anchors[j]!.part);
          text[p.tagBase + j] = n === inView ? tags.text[j]! : "";
        }
        if (n === inView) {
          const own = sub.scene.anchors.find((a) => a.id === p.station.label)!;
          p.anchor.part = prefixed(b, p.prefix, own.part);
          scene.anchors.push(p.anchor);
        }
      });
      const route = inView >= 0 ? ROUTE.atStop : ROUTE.glow;
      for (const slot of [b.routeSlot, b.routeSlot + 1]) {
        dynamics.intensity[slot] = route;
        dynamics.flowPhase[slot] = tl.t * ROUTE.speed;
      }
    },

    tourPose(def, tl, ui, out) {
      const all = tourPoses(def);
      const stop = Math.min(Math.max(tourStop(def, tl), 0), all.length - 1);
      const from = Math.min(Math.floor(stop), all.length - 2);
      return arrivalPose(all[from]!, all[from + 1]!, stop - from, out);
    },
  };
}
