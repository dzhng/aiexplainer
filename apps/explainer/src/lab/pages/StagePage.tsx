import { useEffect, useRef } from "react";
import type { Clock } from "../../runtime/clock.ts";
import type { ProbeApi } from "../probe.ts";
import { runStage, type StageOptions } from "../stage.ts";

export interface StagePageProps {
  scene: () => Pick<StageOptions, "look" | "input">;
  clock: Clock;
  probe: ProbeApi;
  onReady: () => void;
}

/** A full-window canvas running the real renderer on the scene `scene()` returns. */
export function StagePage({ scene, clock, probe, onReady }: StagePageProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let dispose = () => {};
    let cancelled = false;
    runStage({ canvas: ref.current!, ...scene(), clock, probe, onReady }).then(
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
  }, [scene, clock, probe, onReady]);
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
