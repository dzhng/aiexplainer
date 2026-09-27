import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import path from "node:path";
import { sharePage, siteOrigin } from "../scripts/share.ts";
import { CHAPTERS } from "../src/chapters/index.ts";
import { mediaFor } from "../src/runtime/media.ts";
import { writtenChapters } from "../src/state/app-state.ts";

const def = CHAPTERS.autocomplete!;

test("a share page carries absolute link-preview metadata and redirects to its chapter", () => {
  const html = sharePage(def, "https://example.test");
  expect(html).toContain(
    '<meta property="og:image" content="https://example.test/media/autocomplete-card.jpg" />',
  );
  expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
  expect(html).toContain(`<meta property="og:title" content="0 · ${def.title}`);
  expect(html).toContain('<meta property="og:url" content="https://example.test/c/0/" />');
  expect(html).toContain('<meta http-equiv="refresh" content="0; url=/#0" />');
  expect(html).toContain('location.replace("/#0")');
});

test("the origin is SITE_URL, else the Vercel deployment, else vite preview", () => {
  expect(siteOrigin({ SITE_URL: "https://a.test/", VERCEL_URL: "b.vercel.app" })).toBe(
    "https://a.test",
  );
  expect(siteOrigin({ VERCEL_URL: "b.vercel.app" })).toBe("https://b.vercel.app");
  expect(siteOrigin({})).toBe("http://localhost:4173");
});

test("every written chapter has its recorded video, poster and card (run `bun run media`)", () => {
  const publicDir = path.resolve(import.meta.dirname, "../public");
  for (const slug of writtenChapters(CHAPTERS)) {
    for (const file of Object.values(mediaFor(slug))) {
      expect({ file, exists: existsSync(path.join(publicDir, file)) }).toEqual({
        file,
        exists: true,
      });
    }
  }
});
