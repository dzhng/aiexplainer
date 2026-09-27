// Dev CLI over the committed models in apps/explainer/public/models.
//
//   bun packages/llm/cli.ts next <model> <word> [k]      top successors of a word
//   bun packages/llm/cli.ts tokenize <text>              the shared tokenizer's pieces
//   bun packages/llm/cli.ts forward <model> <text>       top-5 next tokens, one attention row
//
// <model> is a model id or a path to a manifest.json.
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  countsModel,
  fetchModel,
  forward,
  loadTokenizer,
  nextWords,
  probabilities,
  promptTokens,
  transformerModel,
} from "./src/index.ts";

const MODELS_DIR = new URL("../../apps/explainer/public/models/", import.meta.url);

function manifestUrl(model: string): URL {
  return model.endsWith(".json")
    ? pathToFileURL(path.resolve(model))
    : new URL(`${model}/manifest.json`, MODELS_DIR);
}

async function next(model: string, word: string, k: number): Promise<void> {
  const counts = countsModel(await fetchModel(manifestUrl(model)));
  const rows = nextWords(counts, word, k);
  if (rows.length === 0) {
    console.log(`"${word}" is not one of the ${counts.vocab.length} words this model knows.`);
    return;
  }
  const width = Math.max(...rows.map((row) => row.word.length));
  for (const row of rows) {
    const count = row.count.toLocaleString("en-US").padStart(12);
    console.log(`${row.word.padEnd(width)} ${count}  ${(row.p * 100).toFixed(1).padStart(5)}%`);
  }
}

async function tokenize(text: string): Promise<void> {
  const tokenizer = loadTokenizer(
    await Bun.file(new URL("tokenizer/tokenizer.json", MODELS_DIR)).json(),
  );
  const ids = tokenizer.encode(text);
  console.log(`${ids.length} pieces for ${[...text].length} characters:`);
  tokenizer.pieces(ids).forEach(({ text: piece, byteSpan: [start, end] }, i) => {
    const shown = JSON.stringify(piece).padEnd(16);
    console.log(`${String(ids[i]).padStart(6)}  ${shown} bytes ${start}-${end}`);
  });
}

async function runForward(model: string, text: string): Promise<void> {
  const transformer = transformerModel(await fetchModel(manifestUrl(model)));
  const { tokenizer } = transformer;
  const tokens = promptTokens(tokenizer, text);
  const last = tokens.length - 1;
  const { logits, trace } = forward(transformer, tokens, {
    trace: { tokens: [last], heads: [0], layers: [0] },
  });
  const probs = probabilities(logits, 1);
  const top = Array.from(probs.keys())
    .sort((a, b) => probs[b]! - probs[a]!)
    .slice(0, 5);
  const show = (id: number) => JSON.stringify(tokenizer.decode([id]));
  console.log(`${transformer.id}: top next tokens after ${JSON.stringify(text)}`);
  for (const id of top) console.log(`  ${show(id).padEnd(16)} ${(probs[id]! * 100).toFixed(2)}%`);
  const attn = trace?.layers[0]?.attn;
  if (!attn) return;
  console.log(`layer 0, head 0: where the last token looks`);
  tokens.forEach((id, j) => {
    const weight = attn.weights.data[j]!;
    console.log(
      `  ${show(id).padEnd(16)} ${"#".repeat(Math.round(weight * 40)).padEnd(40)} ${weight.toFixed(3)}`,
    );
  });
}

const [command, ...args] = Bun.argv.slice(2);
if (command === "next" && args.length >= 2) {
  await next(args[0]!, args[1]!, Number(args[2] ?? 10));
} else if (command === "tokenize" && args.length === 1) {
  await tokenize(args[0]!);
} else if (command === "forward" && args.length === 2) {
  await runForward(args[0]!, args[1]!);
} else {
  console.error("usage: bun packages/llm/cli.ts next <model> <word> [k]");
  console.error("       bun packages/llm/cli.ts tokenize <text>");
  console.error("       bun packages/llm/cli.ts forward <model> <text>");
  process.exit(1);
}
