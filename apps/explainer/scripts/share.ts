/**
 * Share routes (D34), a post-build step: `dist/c/<N>/index.html` for every written chapter,
 * with its own link-preview metadata (crawlers ignore `#` fragments) and a redirect to the
 * app at `/#N` (meta refresh without JS, `location.replace` with it).
 *
 *   bun scripts/share.ts                      # after `vite build` (the `build` script runs it)
 *   bun scripts/share.ts --check [--base url] # load each page with JS off and on
 *
 * `og:image` must be absolute. The origin is `SITE_URL` if set, else the Vercel deployment
 * (`VERCEL_URL`), else `vite preview`'s local address.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { CHAPTERS } from "../src/chapters/index.ts";
import { displayNumber } from "../src/chapters/ladder.ts";
import type { ChapterDef } from "../src/chapters/types.ts";
import { SERIES_TITLE } from "../src/look/brand.ts";
import { CARD_SIZE, mediaFor } from "../src/runtime/media.ts";
import { hashFor, sharePathFor, writtenChapters } from "../src/state/app-state.ts";
import { preview } from "vite";
import { appRoot, launch, openPage } from "./harness.ts";

const PREVIEW_ORIGIN = "http://localhost:4173";

export function siteOrigin(env: Record<string, string | undefined> = process.env): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, "");
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL}`;
  return PREVIEW_ORIGIN;
}

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The share page for one chapter. */
export function sharePage(def: ChapterDef, origin: string): string {
  const title = `${displayNumber(def.slug)} · ${def.title} — ${SERIES_TITLE}`;
  const target = `/${hashFor(def.slug)}`;
  const meta = {
    "og:type": "website",
    "og:site_name": SERIES_TITLE,
    "og:title": title,
    "og:description": def.why,
    "og:url": `${origin}${sharePathFor(def.slug)}`,
    "og:image": `${origin}${mediaFor(def.slug).card}`,
    "og:image:width": String(CARD_SIZE.width),
    "og:image:height": String(CARD_SIZE.height),
    "og:image:alt": `The machine from chapter ${displayNumber(def.slug)}: ${def.title}`,
  };
  const twitter = {
    "twitter:card": "summary_large_image",
    "twitter:title": title,
    "twitter:description": def.why,
    "twitter:image": meta["og:image"],
  };
  const tags = [
    ...Object.entries(meta).map(([k, v]) => `<meta property="${k}" content="${escape(v)}" />`),
    ...Object.entries(twitter).map(([k, v]) => `<meta name="${k}" content="${escape(v)}" />`),
  ];
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escape(title)}</title>
    <meta name="description" content="${escape(def.why)}" />
    ${tags.join("\n    ")}
    <link rel="icon" href="data:," />
    <meta http-equiv="refresh" content="0; url=${target}" />
    <script>location.replace(${JSON.stringify(target)});</script>
  </head>
  <body>
    <a href="${target}">${escape(title)}</a>
  </body>
</html>
`;
}

async function write(): Promise<void> {
  const origin = siteOrigin();
  for (const slug of writtenChapters(CHAPTERS)) {
    const file = path.join(appRoot, "dist", sharePathFor(slug), "index.html");
    await mkdir(path.dirname(file), { recursive: true });
    await Bun.write(file, sharePage(CHAPTERS[slug]!, origin));
    console.log("share", path.relative(appRoot, file), "→", `${origin}${mediaFor(slug).card}`);
  }
}

/** Each share page lands on its chapter with JS off (meta refresh) and on (script). */
async function check(base: string): Promise<string[]> {
  const failures: string[] = [];
  const browser = await launch("chrome");
  try {
    for (const slug of writtenChapters(CHAPTERS)) {
      for (const javaScript of [false, true]) {
        const url = `${base}${sharePathFor(slug)}`;
        const { page } = await openPage(browser, url, { width: 1280, height: 720, javaScript });
        const want = `${base}/${hashFor(slug)}`;
        await page.waitForURL(want, { timeout: 10_000 }).catch(() => {});
        const landed = page.url();
        console.log(`${url} (JS ${javaScript ? "on" : "off"}) → ${landed}`);
        if (landed !== want)
          failures.push(`${url} with JS ${javaScript ? "on" : "off"} landed on ${landed}`);
        await page.context().close();
      }
    }
  } finally {
    await browser.close();
  }
  return failures;
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { check: { type: "boolean", default: false }, base: { type: "string" } },
  });
  if (!values.check) await write();
  else {
    // The built site on the origin `write` baked into the pages, once it is listening.
    const server = values.base
      ? undefined
      : await preview({
          root: appRoot,
          logLevel: "error",
          preview: { port: 4173, strictPort: true },
        });
    const failures = await check(values.base ?? PREVIEW_ORIGIN).finally(() => server?.close());
    if (failures.length) {
      console.error(failures.map((f) => `FAIL ${f}`).join("\n"));
      process.exit(1);
    }
    console.log("PASS share pages");
  }
}
