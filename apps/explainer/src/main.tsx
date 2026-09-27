import { Layer, probeAdapter } from "@repo/renderer";
import { createRoot } from "react-dom/client";
import { installProbe } from "./lab/probe.ts";
import "./look/global.css";
import { applyCssVars } from "./look/look.ts";
import { App } from "./runtime/app.tsx";
import { arrivalFromSearch, clockFromSearch, type HeldClock } from "./runtime/clock.ts";

const params = new URLSearchParams(location.search);
const clock = clockFromSearch(location.search);
const { probe, markReady } = installProbe((t) => (clock as Partial<HeldClock>).set?.(t));
applyCssVars(document.documentElement);

probe.adapter = await probeAdapter(navigator.gpu);
// `?emissive=0` and `?bloom=0` isolate the renderer's layers for shots.
const debug = {
  layers: params.get("emissive") === "0" ? ~Layer.emissive : ~0,
  bloom: params.get("bloom") !== "0",
};
createRoot(document.getElementById("root")!).render(
  <App
    hud={params.get("hud") !== "0"}
    clock={clock}
    probe={probe}
    debug={debug}
    onReady={markReady}
    arrival={arrivalFromSearch(location.search)}
  />,
);
