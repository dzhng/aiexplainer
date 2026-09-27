/**
 * The browser harness's shared parts (verify, record, share cards): serve the app, launch a
 * browser, and open a route with every page error and console warning collected, waiting
 * until the page's probe says it is ready.
 */
import path from "node:path";
import { chromium, webkit, type Browser, type Page } from "playwright";
import { createServer } from "vite";

export const appRoot = path.resolve(import.meta.dirname, "..");
export const repoRoot = path.resolve(appRoot, "../..");
export const FFMPEG = "/opt/homebrew/bin/ffmpeg";
export const FFPROBE = "/opt/homebrew/bin/ffprobe";

/**
 * Vercel's protection bypass for automation (never disabling protection). Set
 * `VERCEL_AUTOMATION_BYPASS_SECRET` to open a protected preview with `--base`.
 */
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

/** `base`, or a Vite dev server on a free loopback port (other projects squat the usual ones). */
export async function serve(base?: string): Promise<{ base: string; close: () => Promise<void> }> {
  if (base) return { base: base.replace(/\/$/, ""), close: async () => {} };
  const server = await createServer({
    root: appRoot,
    logLevel: "error",
    server: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  await server.listen();
  const local = server.resolvedUrls?.local[0]?.replace(/\/$/, "");
  if (!local) throw new Error("vite dev server did not report a local URL");
  return { base: local, close: () => server.close() };
}

export type BrowserKind = "chrome" | "shell" | "webkit";

/**
 * `chrome` has a hardware WebGPU adapter headless (in a secure context). The default headless
 * `shell` has none (the negative control), and `webkit` stands in for a browser without it.
 */
export function launch(kind: BrowserKind): Promise<Browser> {
  if (kind === "webkit") return webkit.launch({ headless: true });
  return chromium.launch(
    kind === "shell" ? { headless: true } : { headless: true, channel: "chrome" },
  );
}

export interface OpenedPage {
  page: Page;
  /** Page errors and console warnings/errors so far; the caller decides whether they fail. */
  failures: string[];
}

export async function openPage(
  browser: Browser,
  url: string,
  options: {
    width: number;
    height: number;
    javaScript?: boolean;
    /** Remove `navigator.gpu` before any page script runs (a browser without WebGPU). */
    noWebGPU?: boolean;
  },
): Promise<OpenedPage> {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: 1,
    javaScriptEnabled: options.javaScript ?? true,
    extraHTTPHeaders: BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {},
  });
  if (options.noWebGPU)
    await context.addInitScript(() => {
      delete (Navigator.prototype as { gpu?: unknown }).gpu;
    });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "warning" || message.type() === "error")
      failures.push(`console.${message.type()}: ${message.text()}`);
  });
  await page.goto(url);
  return { page, failures };
}

/** Waits for the page's probe (`window.__explainer`) to install and report ready. */
export async function waitReady({ page, failures }: OpenedPage): Promise<void> {
  const installed = await page
    .waitForFunction(() => window.__explainer !== undefined, undefined, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!installed) throw new Error(`probe never installed\n${failures.join("\n")}`);
  const ready = await page
    .waitForFunction(() => window.__explainer!.ready.then(() => true), undefined, {
      timeout: 60_000,
    })
    .then(() => true)
    .catch(() => false);
  if (!ready) throw new Error(`page never became ready\n${failures.join("\n")}`);
}

/** Two frames: React commits, then the browser paints. */
export function settle(page: Page): Promise<unknown> {
  return page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
}

export function run(command: string[]): string {
  const result = Bun.spawnSync(command);
  if (result.exitCode !== 0)
    throw new Error(`${path.basename(command[0]!)} failed: ${result.stderr.toString()}`);
  return result.stdout.toString();
}
