import { probeAdapter } from "@repo/renderer";
import { createRoot } from "react-dom/client";
import "../look/global.css";
import { applyCssVars } from "../look/look.ts";
import { clockFromSearch, type HeldClock } from "../runtime/clock.ts";
import { installProbe } from "./probe.ts";
import { AdapterPage } from "./pages/AdapterPage.tsx";
import { ArithPage } from "./pages/ArithPage.tsx";
import { TokensPage } from "./pages/TokensPage.tsx";

const clock = clockFromSearch(location.search);
const { probe, markReady } = installProbe((t) => (clock as Partial<HeldClock>).set?.(t));
const route = location.pathname.replace(/^\/lab\/?/, "").split("/")[0] || "adapter";
const root = createRoot(document.getElementById("root")!);
applyCssVars(document.documentElement);

probe.adapter = await probeAdapter(navigator.gpu);
switch (route) {
  case "adapter":
    root.render(<AdapterPage adapter={probe.adapter} />);
    markReady();
    break;
  case "arith":
    root.render(<ArithPage />);
    markReady();
    break;
  case "tokens": {
    // Waits for its model and fonts before it reports ready.
    const section = new URLSearchParams(location.search).get("section");
    root.render(<TokensPage section={section} onReady={markReady} />);
    break;
  }
  default:
    root.render(<p>Unknown lab route: {route}</p>);
    markReady();
}
