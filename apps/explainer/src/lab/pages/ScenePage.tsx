/**
 * `/lab/scene/<slug>`: one chapter's scene with no HUD, driven by its committed fixture run
 * (`fixtures/runs/<slug>.json`) at the clock's time (hold it with `?clock=held&t=`), so no
 * inference runs. Controls sit at the chapter's defaults. Every chapter slice reviews its
 * scene here; it is the same `chapterScene` the app draws.
 */
import type { FrameInput, SceneDesc } from "@repo/renderer";
import { useEffect, useRef } from "react";
import { CHAPTERS } from "../../chapters/index.ts";
import type { ChapterSlug } from "../../chapters/ladder.ts";
import { Labels, type LabelReading, type LabelsHandle } from "../../hud/Labels.tsx";
import { SceneTagsLayer, type SceneTagsHandle } from "../../hud/SceneTags.tsx";
import { lookConfig } from "../../look/look.ts";
import { SCENE_BUILDERS, type SceneRun } from "../../scene/build-frame.ts";
import { chapterScene, loadSceneAssets } from "../../runtime/chapter-scene.ts";
import type { Clock } from "../../runtime/clock.ts";
import type { ViewMode } from "../../chapters/types.ts";
import { runStage } from "../../runtime/stage.ts";
import type { ProbeApi } from "../probe.ts";

const runs = import.meta.glob<SceneRun>("../fixtures/runs/*.json", {
  eager: true,
  import: "default",
});

export interface ScenePageProps {
  slug: string;
  reading: LabelReading | null;
  debug: FrameInput["debug"];
  clock: Clock;
  probe: ProbeApi;
  onReady: () => void;
}

export function ScenePage({ slug, reading, debug, clock, probe, onReady }: ScenePageProps) {
  const def = CHAPTERS[slug as ChapterSlug];
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<LabelsHandle>(null);
  const tags = useRef<SceneTagsHandle>(null);

  useEffect(() => {
    if (!def) {
      probe.errors.push(`no written chapter "${slug}"`);
      onReady();
      return;
    }
    const run = runs[`../fixtures/runs/${slug}.json`] ?? null;
    if (def.model !== null && !run) probe.errors.push(`no fixture run for "${slug}"`);
    let dispose = () => {};
    let alive = true;
    const assets: SceneDesc["assets"] = {};
    // `?view=cutaway|exploded` opens the scene in that view (settled), for view shots.
    const asked = new URLSearchParams(location.search).get("view") as ViewMode | null;
    const ui = {
      follow: null,
      slider: def.slider.initial,
      view: asked && def.views.includes(asked) ? asked : (def.views[0] ?? "whole"),
      text: null,
    };
    const scene = chapterScene(def, assets, () => ({ def, ui, run, loopTime: clock.now() }));
    // `?yaw=<degrees>` turns the camera around the shot's target: a label sweep's azimuths.
    const yaw = (Number(new URLSearchParams(location.search).get("yaw") ?? 0) * Math.PI) / 180;
    void loadSceneAssets(def, assets)
      .then(() =>
        runStage({
          canvas: canvas.current!,
          look: lookConfig(),
          input: scene.input,
          clock,
          probe,
          debug,
          update: scene.update,
          pose: (pose) => {
            pose.yaw += yaw;
          },
          labels: labels.current,
          tags: { layer: tags.current, current: () => scene.frame.tags },
          onReady,
        }),
      )
      .then((stage) => {
        if (!alive) stage?.dispose();
        else if (stage) dispose = stage.dispose;
      })
      .catch((error) => {
        probe.errors.push(String(error));
        onReady();
      });
    return () => {
      alive = false;
      dispose();
    };
  }, [def, slug, debug, clock, probe, onReady]);

  if (!def) return <p>Unknown chapter: {slug}</p>;
  return (
    <>
      <canvas
        ref={canvas}
        style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", display: "block" }}
      />
      {reading && <Labels ref={labels} labels={def.labels} reading={reading} />}
      <SceneTagsLayer ref={tags} count={SCENE_BUILDERS[def.scene].tagCount} />
    </>
  );
}
