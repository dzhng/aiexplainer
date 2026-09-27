// Writes the JSON Schema that training/tests validates every Python export against.
import { MANIFEST_SCHEMA_FILE, manifestJsonSchemaText } from "../src/manifest.ts";

await Bun.write(new URL(`../${MANIFEST_SCHEMA_FILE}`, import.meta.url), manifestJsonSchemaText());
console.log(`wrote ${MANIFEST_SCHEMA_FILE}`);
