import { useEffect, useRef } from "react";
import type { Clock } from "../../runtime/clock.ts";
import type { ProbeApi } from "../probe.ts";
import { runStage, type StageOptions } from "../stage.ts";

export type StageScene = Pick<StageOptions, "look" | "input" | "pose">;

export interface StagePageProps {
  scene: () => StageScene | Promise<StageScene>;
  debug?: StageOptions["debug"];
  clock: Clock;
  probe: ProbeApi;
  onReady: () => void;
}

/** A full-window canvas running the real renderer on the scene `scene()` returns. */
export function StagePage({ scene, debug, clock, probe, onReady }: StagePageProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dispose = () => {};
    let cancelled = false;
    Promise.resolve()
      .then(scene)
      .then((s) => runStage({ canvas: ref.current!, ...s, debug, clock, probe, onReady }))
      .then(
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
  }, [scene, debug, clock, probe, onReady]);
  return (
    <canvas
      ref={ref}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        display: "block",
        touchAction: "none",
      }}
    />
  );
}
