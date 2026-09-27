// Dev CLI over the committed models in apps/explainer/public/models.
//
//   bun packages/llm/cli.ts next <model> <word> [k]   top successors of a word
//   bun packages/llm/cli.ts tokenize <text>           the shared tokenizer's pieces
import { countsModel, loadModel, loadTokenizer, nextWords } from "./src/index.ts";

const MODELS_DIR = new URL("../../apps/explainer/public/models/", import.meta.url);

async function load(id: string) {
  const dir = new URL(`${id}/`, MODELS_DIR);
  const manifest = await Bun.file(new URL("manifest.json", dir)).json();
  const weights = await Bun.file(new URL(manifest.weightsFile, dir)).arrayBuffer();
  return loadModel(manifest, weights);
}

async function next(id: string, word: string, k: number): Promise<void> {
  const model = countsModel(await load(id));
  const rows = nextWords(model, word, k);
  if (rows.length === 0) {
    console.log(`"${word}" is not one of the ${model.vocab.length} words this model knows.`);
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

const [command, ...args] = Bun.argv.slice(2);
if (command === "next" && args.length >= 2) {
  await next(args[0]!, args[1]!, Number(args[2] ?? 10));
} else if (command === "tokenize" && args.length === 1) {
  await tokenize(args[0]!);
} else {
  console.error("usage: bun packages/llm/cli.ts next <model> <word> [k]");
  console.error("       bun packages/llm/cli.ts tokenize <text>");
  process.exit(1);
}
