import { Layer, probeAdapter } from "@repo/renderer";
import { createRoot } from "react-dom/client";
import { CHAPTERS } from "./chapters/index.ts";
import { Fallback } from "./fallback/Fallback.tsx";
import { installProbe } from "./lab/probe.ts";
import "./look/global.css";
import { applyCssVars } from "./look/look.ts";
import { App } from "./runtime/app.tsx";
import { arrivalFromSearch, clockFromSearch, clockIsDriven } from "./runtime/clock.ts";
import { browserSupportEnv, detectSupport } from "./runtime/support.ts";
import { chapterAt } from "./state/app-state.ts";

const params = new URLSearchParams(location.search);
const clock = clockFromSearch(location.search);
const { probe, markReady } = installProbe(clock);
applyCssVars(document.documentElement);
const root = createRoot(document.getElementById("root")!);

probe.adapter = await probeAdapter(navigator.gpu);
probe.support = detectSupport(
  browserSupportEnv(probe.adapter !== null && !probe.adapter.isFallbackAdapter),
);
if (probe.support === "webgpu") {
  // `?emissive=0` and `?bloom=0` isolate the renderer's layers for shots.
  const debug = {
    layers: params.get("emissive") === "0" ? ~Layer.emissive : ~0,
    bloom: params.get("bloom") !== "0",
  };
  root.render(
    <App
      hud={params.get("hud") !== "0"}
      hudMotion={!clockIsDriven(location.search)}
      clock={clock}
      probe={probe}
      debug={debug}
      onReady={markReady}
      arrival={arrivalFromSearch(location.search)}
    />,
  );
} else {
  // Phones, small windows and browsers without WebGPU get the video (D20, D29).
  const def = CHAPTERS[chapterAt(location.hash, CHAPTERS)]!;
  root.render(<Fallback def={def} reason={probe.support} />);
  void document.fonts.ready.then(markReady);
}
