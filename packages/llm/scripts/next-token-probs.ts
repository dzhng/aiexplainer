// Next-token probabilities from the shipped TypeScript runtime, for probes that must
// measure exactly what the browser computes (training/probes/runtime.py calls this).
//
//   bun packages/llm/scripts/next-token-probs.ts <manifest.json> < prompts.json > probs.json
//
// stdin: `number[][]` token sequences. stdout: `number[][]`, softmax at temperature 1.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchModel, forward, probabilities, transformerModel } from "../src/index.ts";

const manifest = Bun.argv[2];
if (!manifest) throw new Error("usage: next-token-probs.ts <manifest.json> < prompts.json");
const model = transformerModel(await fetchModel(pathToFileURL(path.resolve(manifest))));
const prompts: number[][] = JSON.parse(await Bun.stdin.text());
const out = prompts.map((tokens) => Array.from(probabilities(forward(model, tokens).logits, 1)));
await Bun.write(Bun.stdout, JSON.stringify(out));
