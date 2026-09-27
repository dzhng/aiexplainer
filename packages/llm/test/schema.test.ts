import { expect, test } from "bun:test";
import { MANIFEST_SCHEMA_FILE, manifestJsonSchemaText } from "../src/index.ts";

test("the committed JSON Schema is current (run `bun run schema` after changing the format)", async () => {
  const committed = await Bun.file(new URL(`../${MANIFEST_SCHEMA_FILE}`, import.meta.url)).text();
  expect(committed).toBe(manifestJsonSchemaText());
});
