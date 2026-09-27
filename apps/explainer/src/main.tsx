import { probeAdapter } from "@repo/renderer";
import { createRoot } from "react-dom/client";
import { installProbe } from "./lab/probe.ts";
import "./look/global.css";
import { applyCssVars } from "./look/look.ts";
import { App } from "./runtime/app.tsx";
import { clockFromSearch, type HeldClock } from "./runtime/clock.ts";

const params = new URLSearchParams(location.search);
const clock = clockFromSearch(location.search);
const { probe, markReady } = installProbe((t) => (clock as Partial<HeldClock>).set?.(t));
applyCssVars(document.documentElement);

probe.adapter = await probeAdapter(navigator.gpu);
createRoot(document.getElementById("root")!).render(
  <App hud={params.get("hud") !== "0"} onReady={markReady} />,
);
