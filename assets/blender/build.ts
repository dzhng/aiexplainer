/**
 * `bun run props:build`: rebuilds every prop from its Blender script into
 * apps/explainer/public/props/<name>.glb, plus the Draco-compressed parser fixture.
 * Set BLENDER to override the Blender binary.
 */
import { readdir } from "node:fs/promises";
import path from "node:path";

const here = import.meta.dirname;
const repo = path.resolve(here, "../..");
const blender = process.env.BLENDER ?? "/Applications/Blender.app/Contents/MacOS/Blender";

async function run(script: string, out: string, extra: string[] = []) {
  const proc = Bun.spawn(
    [
      blender,
      "-b",
      "--factory-startup",
      "--python",
      path.join(here, script),
      "--",
      "--out",
      out,
      ...extra,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  if (code !== 0 || !stdout.includes(`exported ${out}`))
    throw new Error(`${script} failed (${code}):\n${stdout}\n${stderr}`);
  console.log(path.relative(repo, out));
}

const scripts = (await readdir(here)).filter((f) => f.endsWith(".py") && f !== "common.py");
for (const script of scripts)
  await run(
    script,
    path.join(repo, "apps/explainer/public/props", script.replace(/\.py$/, ".glb")),
  );
await run(
  "axis_probe.py",
  path.join(repo, "packages/renderer/test/fixtures/axis_probe.draco.glb"),
  ["--draco"],
);
