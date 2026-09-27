/**
 * Real-GPU browser harness (spec slice 01). Opens a route in headless Chrome with a
 * hardware WebGPU adapter, optionally holds the clock and screenshots it, and fails on
 * a fallback adapter, a page error, or any console warning/error.
 *
 *   bun scripts/verify.ts --route /lab/adapter [--t 12.5] [--out name] [--base http://…]
 *   bun scripts/verify.ts --route /lab/adapter --browser shell   # negative control: expect failure
 *   bun scripts/verify.ts --route '/lab/renderer?fixture=boxes' --t 0 --out boxes --crop 'part:*'
 *   bun scripts/verify.ts --route /lab/kit/board --t 0,1,2,3 --out board --crop part:board
 *
 * `--crop` takes comma-separated probe crop names (a trailing `*` matches a prefix, and
 * `rect:x,y,w,h` is a literal rectangle) and screenshots their union, padded, instead of
 * the whole viewport. `--size N` instead shoots an N×N square centred on that union.
 *
 * `--check label-dots` (on a fixture of flat magenta markers with one anchor each) proves
 * CPU placement and GPU raster agree: every visible label's dot, and the placement it came
 * from, must lie within 2 px of its marker's rendered pixel centroid.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { chromium, type Browser, type Page } from "playwright";
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
    size: { type: "string" },
    check: { type: "string" },
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

/**
 * The padded union of the named crops, clamped to the viewport; `undefined` (the whole
 * viewport) when only wildcards were named and none matched, e.g. every label hidden.
 */
function unionCrop(crops: Record<string, Rect>, spec: string): Rect | undefined {
  const literal = /^rect:(\d+),(\d+),(\d+),(\d+)$/.exec(spec);
  if (literal) {
    const [x, y, width, height] = literal.slice(1).map(Number) as [number, number, number, number];
    return { x, y, width, height };
  }
  const names = spec.split(",").flatMap((name) => {
    const matches = name.endsWith("*")
      ? Object.keys(crops).filter((key) => key.startsWith(name.slice(0, -1)))
      : name in crops
        ? [name]
        : [];
    if (!matches.length && !name.endsWith("*"))
      throw new Error(`crop "${name}" matched nothing; have ${Object.keys(crops).join(", ")}`);
    return matches;
  });
  if (!names.length) {
    console.log(`crop "${spec}" matched nothing visible; shooting the whole viewport`);
    return undefined;
  }
  const rects = names.map((name) => crops[name]!);
  if (args.size) {
    const size = Number(args.size);
    const cx =
      (Math.min(...rects.map((r) => r.x)) + Math.max(...rects.map((r) => r.x + r.width))) / 2;
    const cy =
      (Math.min(...rects.map((r) => r.y)) + Math.max(...rects.map((r) => r.y + r.height))) / 2;
    const x = Math.min(Math.max(0, Math.round(cx - size / 2)), Number(args.width) - size);
    const y = Math.min(Math.max(0, Math.round(cy - size / 2)), Number(args.height) - size);
    return { x, y, width: size, height: size };
  }
  const pad = Number(args.pad);
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

/** `--t 0,1,2` shoots each held time in one session, as `<out>-t<time>.png`. */
const times = args.t?.split(",") ?? [];

function withClock(route: string): string {
  if (args.t === undefined) return route;
  const url = new URL(route, "http://x");
  url.searchParams.set("clock", "held");
  url.searchParams.set("t", times[0]!);
  return url.pathname + url.search;
}

/** Label dots vs rendered markers; returns failures. */
async function checkLabelDots(page: Page): Promise<string[]> {
  const dots = await page.evaluate(() =>
    (window.__explainer!.labels?.() ?? []).map((p) => {
      const node = document.querySelector<HTMLElement>(`[data-label="${p.id}"] [data-dot]`);
      const r = node?.getBoundingClientRect();
      return { ...p, domX: r ? r.left + r.width / 2 : NaN, domY: r ? r.top + r.height / 2 : NaN };
    }),
  );
  await page.evaluate(async () => {
    document.querySelector<HTMLElement>("[data-labels]")!.style.visibility = "hidden";
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
  });
  const png = (await page.screenshot()).toString("base64");
  const centroids = await page.evaluate(
    async ({ png, points }) => {
      const image = await createImageBitmap(
        await (await fetch(`data:image/png;base64,${png}`)).blob(),
      );
      const canvas = new OffscreenCanvas(image.width, image.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(image, 0, 0);
      const { data, width, height } = context.getImageData(0, 0, image.width, image.height);
      return points.map(({ x, y }) => {
        let sx = 0;
        let sy = 0;
        let n = 0;
        for (
          let py = Math.max(0, Math.round(y) - 30);
          py < Math.min(height, Math.round(y) + 30);
          py++
        ) {
          for (
            let px = Math.max(0, Math.round(x) - 30);
            px < Math.min(width, Math.round(x) + 30);
            px++
          ) {
            const i = (py * width + px) * 4;
            const [r, g, b] = [data[i]!, data[i + 1]!, data[i + 2]!];
            if (r - g > 60 && b - g > 60) {
              sx += px + 0.5;
              sy += py + 0.5;
              n++;
            }
          }
        }
        return n ? { x: sx / n, y: sy / n, n } : null;
      });
    },
    { png, points: dots.map(({ x, y }) => ({ x, y })) },
  );
  await page.evaluate(() => {
    document.querySelector<HTMLElement>("[data-labels]")!.style.visibility = "";
  });
  const failures: string[] = [];
  const report = dots.map((dot, i) => {
    const c = centroids[i];
    if (!dot.visible) return { id: dot.id, hidden: dot.hiddenBy };
    if (!c) {
      failures.push(`label-dots: no marker pixels near ${dot.id}`);
      return { id: dot.id, marker: null };
    }
    const placementError = Math.hypot(dot.x - c.x, dot.y - c.y);
    const domError = Math.hypot(dot.domX - c.x, dot.domY - c.y);
    if (placementError > 2 || domError > 2)
      failures.push(
        `label-dots: ${dot.id} is ${placementError.toFixed(2)} px (placement) / ${domError.toFixed(2)} px (dot) from its marker`,
      );
    return {
      id: dot.id,
      placementError: +placementError.toFixed(3),
      domError: +domError.toFixed(3),
      pixels: c.n,
    };
  });
  console.log("label-dots", JSON.stringify(report));
  if (!dots.some((d) => d.visible)) failures.push("label-dots: no visible labels to check");
  return failures;
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
    results: window.__explainer!.results,
  }));

  console.log("adapter", JSON.stringify(probe.adapter));
  if (probe.receipt) console.log("receipt", JSON.stringify(probe.receipt));
  if (probe.results !== undefined) console.log("results", JSON.stringify(probe.results));
  if (!probe.adapter) failures.push("no WebGPU adapter");
  else if (probe.adapter.isFallbackAdapter) failures.push("fallback (software) adapter");
  failures.push(...probe.errors.map((e) => `probe: ${e}`));

  if (args.check === "label-dots") failures.push(...(await checkLabelDots(page)));
  else if (args.check) failures.push(`unknown check "${args.check}"`);

  if (args.out) {
    const dir = path.join(repoRoot, "throwaway/shots", args.slice);
    await mkdir(dir, { recursive: true });
    for (const t of times.length > 1 ? times : [undefined]) {
      if (t !== undefined) {
        await page.evaluate(async (time) => {
          window.__explainer!.setTime(time);
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        }, Number(t));
      }
      const [crops, labels] = await page.evaluate(() => [
        window.__explainer!.crops?.(),
        window.__explainer!.labels?.(),
      ]);
      if (labels?.length)
        console.log(
          "labels",
          labels
            .map((l) => `${l.id}:${l.hiddenBy ?? "shown"}@${Math.round(l.x)},${Math.round(l.y)}`)
            .join(" "),
        );
      const file = path.join(dir, `${args.out}${t === undefined ? "" : `-t${t}`}.png`);
      const clip = args.crop ? unionCrop(crops ?? {}, args.crop) : undefined;
      if (clip) console.log("crop", JSON.stringify(clip));
      await page.screenshot({ path: file, clip });
      console.log("shot", path.relative(repoRoot, file));
    }
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
