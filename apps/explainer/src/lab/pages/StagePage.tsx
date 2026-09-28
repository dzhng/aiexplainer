import { useEffect, useRef, useState } from "react";
import type { LabelDef } from "../../chapters/types.ts";
import { Labels, type LabelsHandle } from "../../hud/Labels.tsx";
import type { LabelMode } from "../../state/app-state.ts";
import type { Clock } from "../../runtime/clock.ts";
import type { ProbeApi } from "../probe.ts";
import { runStage, type StageOptions } from "../../runtime/stage.ts";

export type StageScene = Pick<StageOptions, "look" | "input" | "pose"> & { labels?: LabelDef[] };

export interface StagePageProps {
  scene: () => StageScene | Promise<StageScene>;
  debug?: StageOptions["debug"];
  /** `null` hides the label layer (`?labels=0`). */
  reading: LabelMode | null;
  clock: Clock;
  probe: ProbeApi;
  onReady: () => void;
}

/** A full-window canvas running the real renderer on the scene `scene()` returns. */
export function StagePage({ scene, debug, reading, clock, probe, onReady }: StagePageProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const labels = useRef<LabelsHandle>(null);
  const [loaded, setLoaded] = useState<StageScene | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(scene)
      .then(
        (s) => cancelled || setLoaded(s),
        (error) => {
          probe.errors.push(String(error));
          onReady();
        },
      );
    return () => {
      cancelled = true;
    };
  }, [scene, probe, onReady]);

  useEffect(() => {
    if (!loaded) return;
    let dispose = () => {};
    let cancelled = false;
    runStage({
      canvas: canvas.current!,
      ...loaded,
      labels: labels.current,
      debug,
      clock,
      probe,
      onReady,
    }).then(
      (stage) => {
        if (cancelled) stage?.dispose();
        else if (stage) dispose = stage.dispose;
      },
      (error) => {
        probe.errors.push(String(error));
        onReady();
      },
    );
    return () => {
      cancelled = true;
      dispose();
    };
  }, [loaded, debug, clock, probe, onReady]);

  return (
    <>
      <canvas
        ref={canvas}
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          display: "block",
          touchAction: "none",
        }}
      />
      {loaded?.labels && reading && (
        <Labels ref={labels} labels={loaded.labels} reading={reading} />
      )}
    </>
  );
}
