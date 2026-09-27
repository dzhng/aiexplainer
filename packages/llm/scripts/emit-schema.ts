// Writes the JSON Schemas that training/tests validates every Python export against.
import { jsonSchemaFiles } from "../src/json-schemas.ts";

for (const [file, text] of Object.entries(jsonSchemaFiles())) {
  await Bun.write(new URL(`../schema/${file}`, import.meta.url), text);
  console.log(`wrote schema/${file}`);
}
