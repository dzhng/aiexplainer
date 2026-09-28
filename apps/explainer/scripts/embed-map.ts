/**
 * Writes chapter 2's map (`src/scene/embed-map.json`), offline: which words are pinned, the
 * PCA the map is drawn with, and each pin's position. The words are the `embed` model's
 * neighbour-probe pairs (training/probes/prompts/neighbours.json), the 30 pairs (60 words,
 * the slice's cap) whose partners are nearest in the model's own 64 directions. The PCA is
 * fitted to those 60 rows of the real `tok_emb` table, so the map spends its 3 directions on
 * the words it shows; any other word (typed text) is projected with the same basis.
 *
 *   bun scripts/embed-map.ts
 */
import { transformerModel } from "@repo/llm";
import path from "node:path";
import { pca, row } from "./pca.ts";
import { shippedModel } from "./shipped.ts";

export const PINNED_PAIRS = 30;

const loaded = await shippedModel("embed");
const model = transformerModel(loaded);
const tokenizer = loaded.tokenizer!;
const d = model.arch.dModel;
const probePairs: [string, string][] = await Bun.file(
  path.resolve(import.meta.dirname, "../../../training/probes/prompts/neighbours.json"),
).json();

/** The word's one token with its leading space (how it appears mid-sentence), if it is one. */
const tokenOf = (word: string) => {
  const ids = tokenizer.encode(` ${word}`);
  return ids.length === 1 ? ids[0]! : null;
};
const unit = (id: number) => row(model.tokEmb, d, id, true);
const cosine = (a: number, b: number) => {
  const [ua, ub] = [unit(a), unit(b)];
  return ua.reduce((s, x, k) => s + x * ub[k]!, 0);
};

// The probe's own measure, among the candidate words: the share of other words further from
// a than its partner b is.
const pairs = probePairs
  .map(([a, b], order) => ({ a, b, ia: tokenOf(a), ib: tokenOf(b), order }))
  .filter((p): p is typeof p & { ia: number; ib: number } => p.ia !== null && p.ib !== null);
const candidates = pairs.flatMap((p) => [p.ia, p.ib]);
const ranked = pairs
  .map((p) => {
    const close = cosine(p.ia, p.ib);
    const others = candidates.filter((x) => x !== p.ia && x !== p.ib);
    return { ...p, share: others.filter((o) => cosine(p.ia, o) < close).length / others.length };
  })
  .sort((x, y) => y.share - x.share || x.order - y.order)
  .slice(0, PINNED_PAIRS)
  .sort((x, y) => x.order - y.order);

const pinned = ranked.flatMap((p) => [
  { word: p.a, id: p.ia },
  { word: p.b, id: p.ib },
]);
const fit = pca(
  pinned.map((p) => row(model.tokEmb, d, p.id, false)),
  3,
);
const round = (x: number) => Number(x.toPrecision(9));
const project = (id: number) => {
  const r = row(model.tokEmb, d, id, false);
  return fit.components.map((c) => round(c.reduce((s, x, k) => s + x * (r[k]! - fit.mean[k]!), 0)));
};

const map = {
  model: "embed",
  weightsSha256: loaded.manifest.weightsSha256,
  fittedTo: "the pinned words' rows of tok_emb",
  mean: fit.mean.map(round),
  components: fit.components.map((c) => c.map(round)),
  variances: fit.variances.map(round),
  pairs: ranked.map((p) => [p.a, p.b]),
  pins: pinned.map((p) => ({ ...p, at: project(p.id) })),
};
const out = path.resolve(import.meta.dirname, "../src/scene/embed-map.json");
await Bun.write(out, `${JSON.stringify(map, null, 2)}\n`);
console.log("wrote", path.relative(process.cwd(), out), `(${map.pins.length} pins)`);
