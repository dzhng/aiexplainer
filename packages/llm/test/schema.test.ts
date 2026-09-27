import { expect, test } from "bun:test";
import { jsonSchemaFiles } from "../src/json-schemas.ts";

test("the committed JSON Schemas are current (run `bun run schema` after changing a format)", async () => {
  for (const [file, text] of Object.entries(jsonSchemaFiles())) {
    const committed = await Bun.file(new URL(`../schema/${file}`, import.meta.url)).text();
    expect({ file, text: committed }).toEqual({ file, text });
  }
});
