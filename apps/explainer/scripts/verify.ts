/**
 * Real-GPU browser harness (spec slice 01). Opens a route in headless Chrome with a
 * hardware WebGPU adapter, optionally holds the clock and screenshots it, and fails on
 * a fallback adapter, a page error, or any console warning/error.
 *
 *   bun scripts/verify.ts --route /lab/adapter [--t 12.5] [--out name] [--base http://…]
 *   bun scripts/verify.ts --route /lab/adapter --browser shell   # negative control: expect failure
 *   bun scripts/verify.ts --route '/#0' --browser webkit --no-webgpu --expect fallback
 *   bun scripts/verify.ts --route '/#0' --base https://<preview>.vercel.app   # a deployment
 *   bun scripts/verify.ts --route '/#0' --out hud --press '?' --crop panel:tl,panel:help
 *   bun scripts/verify.ts --route '/lab/renderer?fixture=boxes' --t 0 --out boxes --crop 'part:near+part:far'
 *   bun scripts/verify.ts --route /lab/kit/board --t 0,1,2,3 --out board --crop part:board
 *
 * - `--t` holds the clock; a comma list (`0,1,2`) shoots each time in one session as
 *   `<out>-t<time>`.
 * - `--press` sends keys (comma-separated) once the page is ready.
 * - `--crop` names crops from the probe's `crops()` (DOM `data-crop` tags plus the scene's
 *   `part:*` / `label:*`), comma-separated; each is saved as `<out>-<crop>.png`, padded by
 *   `--pad` px. Within one crop, `a+b` shoots the union, a trailing `*` matches a prefix (a
 *   wildcard that matches nothing, e.g. every label hidden, shoots the whole viewport), and
 *   `rect:x,y,w,h` is a literal rectangle. `--size N` shoots an N×N square centred on it.
 * - `--ui '{"text":"happy"}'` sets app controls through the probe (`setUi`) once ready.
 * - `--outline safe` draws that crop's rectangle on the page before shooting (framing review).
 * - `--full` shoots the whole scrolling page (uncropped shots only), e.g. `/lab/tokens`.
 * - `--mask 'part:board*'` fills that crop (same syntax as one `--crop` item) flat grey before
 *   shooting, so a shot judges what is around the subject (the environment) on its own.
 * - `--strip 0:22:1` shoots held times start…end by step with the loop's beat burned in under
 *   each frame, then tiles them into `<out>-strip.png` (ffmpeg, a build-time tool, D41).
 * - `--check subject-first` (with `?emissive=0`) hides every overlay and checks the scene's
 *   parts outshine the room: the brightest lit pixel (p99.9 luminance) and the mean luminance
 *   inside the parts' crop both beat the rest of the frame.
 * - `--check label-dots` (on a fixture of flat magenta markers with one anchor each) proves
 *   CPU placement and GPU raster agree: every visible label's dot, and the placement it came
 *   from, must lie within 2 px of its marker's rendered pixel centroid.
 * - `--no-webgpu` removes `navigator.gpu` before the page runs (Playwright's WebKit has
 *   WebGPU on, so this is how it stands in for a browser without it).
 * - `--expect fallback` passes only if the page chose the fallback (no adapter is then fine);
 *   by default the page must have chosen the 3D app on a hardware adapter.
 * - `--base` opens a deployment instead of a dev server; a protected Vercel preview needs
 *   `VERCEL_AUTOMATION_BYPASS_SECRET` (see harness.ts).
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { Page } from "playwright";
import type { CropRect } from "../src/lab/probe.ts";
import {
  FFMPEG,
  launch,
  openPage,
  repoRoot,
  serve,
  settle,
  waitReady,
  type BrowserKind,
} from "./harness.ts";

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
    press: { type: "string" },
    crop: { type: "string" },
    pad: { type: "string", default: "12" },
    size: { type: "string" },
    check: { type: "string" },
    ui: { type: "string" },
    strip: { type: "string" },
    outline: { type: "string" },
    expect: { type: "string", default: "app" },
    "no-webgpu": { type: "boolean", default: false },
    mask: { type: "string" },
    full: { type: "boolean" },
  },
});

/**
 * The clip for one `--crop` item, clamped to the viewport; `undefined` means the whole
 * viewport, `null` a named crop that does not exist.
 */
function resolveCrop(crops: Record<string, CropRect>, spec: string): CropRect | undefined | null {
  const literal = /^rect:(\d+),(\d+),(\d+),(\d+)$/.exec(spec);
  if (literal) {
    const [x, y, width, height] = literal.slice(1).map(Number) as [number, number, number, number];
    return { x, y, width, height };
  }
  const names: string[] = [];
  for (const name of spec.split("+")) {
    if (name.endsWith("*"))
      names.push(...Object.keys(crops).filter((key) => key.startsWith(name.slice(0, -1))));
    else if (name in crops) names.push(name);
    else return null;
  }
  if (!names.length) {
    console.log(`crop "${spec}" matched nothing visible; shooting the whole viewport`);
    return undefined;
  }
  const rects = names.map((name) => crops[name]!);
  const x0 = Math.min(...rects.map((r) => r.x));
  const y0 = Math.min(...rects.map((r) => r.y));
  const x1 = Math.max(...rects.map((r) => r.x + r.width));
  const y1 = Math.max(...rects.map((r) => r.y + r.height));
  const width = Number(args.width);
  const height = Number(args.height);
  if (args.size) {
    const size = Number(args.size);
    const x = Math.min(Math.max(0, Math.round((x0 + x1 - size) / 2)), width - size);
    const y = Math.min(Math.max(0, Math.round((y0 + y1 - size) / 2)), height - size);
    return { x, y, width: size, height: size };
  }
  const pad = Number(args.pad);
  const left = Math.max(0, Math.floor(x0 - pad));
  const top = Math.max(0, Math.floor(y0 - pad));
  const right = Math.min(width, Math.ceil(x1 + pad));
  const bottom = Math.min(height, Math.ceil(y1 + pad));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

/** `--strip a:b:s` is shorthand for the held times a, a+s, …, b. */
function stripTimes(spec: string): string[] {
  const [start, end, step] = spec.split(":").map(Number) as [number, number, number];
  if (!(step > 0) || !(end >= start)) throw new Error(`--strip ${spec}: want start:end:step`);
  const out: string[] = [];
  for (let t = start; t <= end + 1e-9; t += step) out.push(String(Math.round(t * 1000) / 1000));
  return out;
}

const times = args.strip ? stripTimes(args.strip) : (args.t?.split(",") ?? []);
if (args.strip) args.t = times[0];

function withClock(route: string): string {
  if (args.t === undefined) return route;
  const url = new URL(route, "http://x");
  url.searchParams.set("clock", "held");
  url.searchParams.set("t", times[0]!);
  return url.pathname + url.search + url.hash;
}

/**
 * Luminance inside the union of the scene's `part:*` crops vs outside it, from a screenshot
 * with every DOM overlay hidden; decoded in the page (no image library here). Returns failures.
 */
async function checkSubjectFirst(page: Page): Promise<string[]> {
  const crops = await page.evaluate(() => window.__explainer!.crops());
  const subject = resolveCrop(crops, "part:*");
  if (!subject) return ["subject-first: no part:* crops"];
  await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    for (const el of document.querySelectorAll<HTMLElement>("body *"))
      if (el !== canvas && !el.contains(canvas)) el.style.visibility = "hidden";
    for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
  });
  const png = (await page.screenshot()).toString("base64");
  const stats = await page.evaluate(
    async ({ png, rect }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const { data } = ctx.getImageData(0, 0, c.width, c.height);
      // Screenshot pixels are CSS pixels × dpr; the crop is in CSS pixels.
      const k = img.width / window.innerWidth;
      const inside: number[] = [];
      const outside: number[] = [];
      for (let y = 0; y < c.height; y++)
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          const lum = 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
          const inRect =
            x >= rect.x * k &&
            x < (rect.x + rect.width) * k &&
            y >= rect.y * k &&
            y < (rect.y + rect.height) * k;
          (inRect ? inside : outside).push(lum);
        }
      const summary = (v: number[]) => {
        v.sort((a, b) => a - b);
        return {
          mean: v.reduce((n, x) => n + x, 0) / v.length,
          p999: v[Math.floor(v.length * 0.999)]!,
        };
      };
      return { subject: summary(inside), room: summary(outside) };
    },
    { png, rect: subject },
  );
  const f = (n: number) => n.toFixed(1);
  console.log(
    `subject-first: subject mean ${f(stats.subject.mean)} p99.9 ${f(stats.subject.p999)}; ` +
      `room mean ${f(stats.room.mean)} p99.9 ${f(stats.room.p999)}`,
  );
  const failures: string[] = [];
  if (!(stats.subject.p999 > stats.room.p999))
    failures.push("subject-first: the room's brightest lit pixels outshine the subject's");
  if (!(stats.subject.mean > stats.room.mean))
    failures.push("subject-first: the room is brighter on average than the subject");
  return failures;
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

const server = await serve(args.base);
const browser = await launch(args.browser as BrowserKind);
const failures: string[] = [];
try {
  const opened = await openPage(browser, server.base + withClock(args.route), {
    width: Number(args.width),
    height: Number(args.height),
    noWebGPU: args["no-webgpu"],
  });
  const { page } = opened;
  await waitReady(opened);
  const { adapter, support } = await page.evaluate(() => ({
    adapter: window.__explainer!.adapter,
    support: window.__explainer!.support,
  }));
  console.log("adapter", JSON.stringify(adapter));
  if (support) console.log("support", support);
  if (args.expect === "fallback") {
    const shown = await page.evaluate(() => document.querySelector("[data-fallback]") !== null);
    if (!shown || support === "webgpu") failures.push(`expected the fallback page, got ${support}`);
  } else if (!adapter) failures.push("no WebGPU adapter");
  else if (adapter.isFallbackAdapter) failures.push("fallback (software) adapter");
  else if (support !== undefined && support !== "webgpu")
    failures.push(`the page chose the fallback (${support})`);

  for (const key of args.press?.split(",") ?? []) await page.keyboard.press(key);
  if (args.ui) {
    const ui = JSON.parse(args.ui) as Record<string, unknown>;
    const set = await page.evaluate((u) => {
      if (!window.__explainer!.setUi) return false;
      window.__explainer!.setUi(u);
      return true;
    }, ui);
    if (!set) failures.push("--ui: this page has no setUi");
    // The scene's model output comes back from the worker asynchronously, and a view change
    // eases in over `look.views.durationSec` (0.6 s) of real time.
    await page.waitForTimeout(900);
  }
  // React commits what the keys changed, then the browser paints it.
  await settle(page);
  const probe = await page.evaluate(() => ({
    errors: window.__explainer!.errors,
    receipt: window.__explainer!.receipt?.(),
    results: window.__explainer!.results,
  }));
  if (probe.receipt) console.log("receipt", JSON.stringify(probe.receipt));
  if (probe.results !== undefined) console.log("results", JSON.stringify(probe.results));
  failures.push(...probe.errors.map((e) => `probe: ${e}`));

  if (args.check === "label-dots") failures.push(...(await checkLabelDots(page)));
  else if (args.check === "subject-first") failures.push(...(await checkSubjectFirst(page)));
  else if (args.check) failures.push(`unknown check "${args.check}"`);

  if (args.out) {
    const dir = path.join(repoRoot, "throwaway/shots", args.slice);
    await mkdir(dir, { recursive: true });
    const save = async (name: string, clip?: CropRect) => {
      const file = path.join(dir, `${name}.png`);
      await page.screenshot({ path: file, clip, fullPage: !clip && args.full });
      console.log("shot", path.relative(repoRoot, file));
    };
    for (const t of times.length > 1 ? times : [undefined]) {
      if (t !== undefined) {
        await page.evaluate(async (time) => {
          window.__explainer!.setTime(time);
          for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
        }, Number(t));
      }
      const [crops, labels] = await page.evaluate(() => [
        window.__explainer!.crops(),
        window.__explainer!.labels?.(),
      ]);
      if (labels?.length)
        console.log(
          "labels",
          labels
            .map((l) => `${l.id}:${l.hiddenBy ?? "shown"}@${Math.round(l.x)},${Math.round(l.y)}`)
            .join(" "),
        );
      if (args.outline) {
        const rect = crops[args.outline];
        if (!rect) failures.push(`--outline: no crop ${args.outline}`);
        else
          await page.evaluate(({ x, y, width, height }) => {
            const box = document.getElementById("harness-outline") ?? document.createElement("div");
            box.id = "harness-outline";
            Object.assign(box.style, {
              position: "fixed",
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
              border: "2px dashed #ff3bd4",
              boxSizing: "border-box",
              pointerEvents: "none",
              zIndex: "10",
            });
            document.body.append(box);
          }, rect);
      }
      if (args.mask) {
        const rect = resolveCrop(crops, args.mask);
        if (!rect) failures.push(`--mask: no crop ${args.mask}`);
        else
          await page.evaluate(({ x, y, width, height }) => {
            const box = document.getElementById("harness-mask") ?? document.createElement("div");
            box.id = "harness-mask";
            Object.assign(box.style, {
              position: "fixed",
              left: `${x}px`,
              top: `${y}px`,
              width: `${width}px`,
              height: `${height}px`,
              background: "#3a3a3a",
              pointerEvents: "none",
              zIndex: "10",
            });
            document.body.append(box);
          }, rect);
      }
      if (args.strip) {
        const beat = await page.evaluate(() => window.__explainer!.beat?.() ?? null);
        await page.evaluate(
          (text) => {
            const bar = document.getElementById("harness-beat") ?? document.createElement("div");
            bar.id = "harness-beat";
            bar.textContent = text;
            Object.assign(bar.style, {
              position: "fixed",
              left: "0",
              right: "0",
              bottom: "0",
              padding: "10px 16px",
              background: "#000",
              color: "#fff",
              font: "600 22px/1.2 ui-monospace, monospace",
              zIndex: "20",
            });
            document.body.append(bar);
          },
          `t=${t}s  ${beat ? `[${beat.id}] ${beat.note}` : "(no beat)"}`,
        );
      }
      const name = t === undefined ? args.out : `${args.out}-t${t}`;
      const cropIds = args.crop?.split(",") ?? [];
      if (cropIds.length === 0) await save(name);
      for (const id of cropIds) {
        const clip = resolveCrop(crops, id);
        if (clip === null) {
          failures.push(`no crop ${id} (have: ${Object.keys(crops).join(", ") || "none"})`);
          continue;
        }
        await save(`${name}-${id.replace(/\W+/g, "-").replace(/^-|-$/g, "")}`, clip);
      }
    }
  }
  if (args.strip && args.out) {
    const dir = path.join(repoRoot, "throwaway/shots", args.slice);
    const inputs = times.flatMap((t) => ["-i", path.join(dir, `${args.out}-t${t}.png`)]);
    const columns = 4;
    const [w, h] = [480, Math.round((480 * Number(args.height)) / Number(args.width))];
    const scaled = times.map((_, i) => `[${i}]scale=${w}:${h}[s${i}]`).join(";");
    const layout = times.map((_, i) => `${(i % columns) * w}_${Math.floor(i / columns) * h}`);
    const tile = `${times.map((_, i) => `[s${i}]`).join("")}xstack=inputs=${times.length}:layout=${layout.join("|")}:fill=gray`;
    const file = path.join(dir, `${args.out}-strip.png`);
    const ffmpeg = Bun.spawnSync([
      FFMPEG,
      "-loglevel",
      "error",
      "-y",
      ...inputs,
      "-filter_complex",
      `${scaled};${tile}`,
      "-frames:v",
      "1",
      file,
    ]);
    if (ffmpeg.exitCode !== 0) failures.push(`strip: ffmpeg failed: ${ffmpeg.stderr.toString()}`);
    else console.log("strip", path.relative(repoRoot, file));
  }
  failures.push(...opened.failures);
} finally {
  await browser.close();
  await server.close();
}

if (failures.length) {
  console.error(failures.map((f) => `FAIL ${f}`).join("\n"));
  process.exit(1);
}
console.log("PASS", args.route);
