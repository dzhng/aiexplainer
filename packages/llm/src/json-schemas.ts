// The JSON Schemas `bun run schema` writes to schema/, so training/ can validate what
// it exports against the zod formats this package owns.
import { z } from "zod";
import { ModelManifest, ModelScenarios } from "./manifest.ts";
import { TokenizerEvidence, TokenizerFile } from "./tokenizer.ts";

const SCHEMAS = {
  "manifest.schema.json": ModelManifest,
  "scenarios.schema.json": ModelScenarios,
  "tokenizer.schema.json": TokenizerFile,
  "tokenizer-evidence.schema.json": TokenizerEvidence,
};

/** File name (under schema/) → JSON Schema text. */
export function jsonSchemaFiles(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SCHEMAS).map(([file, schema]) => [
      file,
      `${JSON.stringify(z.toJSONSchema(schema), null, 2)}\n`,
    ]),
  );
}
