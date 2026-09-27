/**
 * Real-GPU browser harness (spec slice 01). Opens a route in headless Chrome with a
 * hardware WebGPU adapter, optionally holds the clock and screenshots it, and fails on
 * a fallback adapter, a page error, or any console warning/error.
 *
 *   bun scripts/verify.ts --route /lab/adapter [--t 12.5] [--out name] [--base http://…]
 *   bun scripts/verify.ts --route /lab/adapter --browser shell   # negative control: expect failure
 *   bun scripts/verify.ts --route '/lab/renderer?fixture=boxes' --t 0 --out boxes --crop 'part:*'
 *
 * `--crop` takes comma-separated probe crop names (a trailing `*` matches a prefix) and
 * screenshots their union, padded, instead of the whole viewport.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser } from "playwright";
import { createServer, type ViteDevServer } from "vite";

const appRoot = path.resolve(import.meta.dirname, "..");
const repoRoot = path.resolve(appRoot, "../..");

const { values: args } = parseArgs({
  options: {
    route: { type: "string", default: "/lab/adapter" },
    t: { type: "string" },
    out: { type: "string" },
    slice: { type: "string", default: "adhoc" },
    base: { type: "string" },
    browser: { type: "string", default: "chrome" },
    width: { type: "string", default: "1440" },
    height: { type: "string", default: "900" },
    crop: { type: "string" },
    pad: { type: "string", default: "16" },
  },
});

async function serve(): Promise<{ base: string; server?: ViteDevServer }> {
  if (args.base) return { base: args.base };
  // Loopback on a free port: other local projects often squat on the usual dev ports.
  const server = await createServer({
    root: appRoot,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (!base) throw new Error("vite dev server did not report a local URL");
  return { base, server };
}

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The padded union of the named crops, clamped to the viewport. */
function unionCrop(crops: Record<string, Rect>, spec: string): Rect {
  const names = spec.split(",").flatMap((name) => {
    const matches = name.endsWith("*")
      ? Object.keys(crops).filter((key) => key.startsWith(name.slice(0, -1)))
      : name in crops
        ? [name]
        : [];
    if (!matches.length)
      throw new Error(`crop "${name}" matched nothing; have ${Object.keys(crops).join(", ")}`);
    return matches;
  });
  const pad = Number(args.pad);
  const rects = names.map((name) => crops[name]!);
  const x0 = Math.max(0, Math.min(...rects.map((r) => r.x)) - pad);
  const y0 = Math.max(0, Math.min(...rects.map((r) => r.y)) - pad);
  const x1 = Math.min(Number(args.width), Math.max(...rects.map((r) => r.x + r.width)) + pad);
  const y1 = Math.min(Number(args.height), Math.max(...rects.map((r) => r.y + r.height)) + pad);
  return {
    x: Math.floor(x0),
    y: Math.floor(y0),
    width: Math.ceil(x1 - x0),
    height: Math.ceil(y1 - y0),
  };
}

function withClock(route: string): string {
  if (args.t === undefined) return route;
  const url = new URL(route, "http://x");
  url.searchParams.set("clock", "held");
  url.searchParams.set("t", args.t);
  return url.pathname + url.search;
}

const { base, server } = await serve();
// The default headless shell has no hardware adapter; `--browser shell` exists to prove the gate.
const browser: Browser = await chromium.launch(
  args.browser === "shell" ? { headless: true } : { headless: true, channel: "chrome" },
);
const failures: string[] = [];
try {
  const page = await browser.newPage({
    viewport: { width: Number(args.width), height: Number(args.height) },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error")
      failures.push(`console.${message.type()}: ${message.text()}`);
  });

  await page.goto(base + withClock(args.route));
  const installed = await page
    .waitForFunction(() => window.__explainer !== undefined, undefined, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!installed) throw new Error(`probe never installed\n${failures.join("\n")}`);
  await page.evaluate(() => window.__explainer!.ready);
  const probe = await page.evaluate(() => ({
    adapter: window.__explainer!.adapter,
    errors: window.__explainer!.errors,
    receipt: window.__explainer!.receipt?.(),
    crops: window.__explainer!.crops?.(),
    results: window.__explainer!.results,
  }));

  console.log("adapter", JSON.stringify(probe.adapter));
  if (probe.receipt) console.log("receipt", JSON.stringify(probe.receipt));
  if (probe.results !== undefined) console.log("results", JSON.stringify(probe.results));
  if (!probe.adapter) failures.push("no WebGPU adapter");
  else if (probe.adapter.isFallbackAdapter) failures.push("fallback (software) adapter");
  failures.push(...probe.errors.map((e) => `probe: ${e}`));

  if (args.out) {
    const dir = path.join(repoRoot, "throwaway/shots", args.slice);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${args.out}.png`);
    const clip = args.crop ? unionCrop(probe.crops ?? {}, args.crop) : undefined;
    if (clip) console.log("crop", JSON.stringify(clip));
    await page.screenshot({ path: file, clip });
    console.log("shot", path.relative(repoRoot, file));
  }
} finally {
  await browser.close();
  await server?.close();
}

if (failures.length) {
  console.error(failures.map((f) => `FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log("PASS", args.route);
