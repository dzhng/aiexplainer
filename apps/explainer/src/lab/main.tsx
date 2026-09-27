import { probeAdapter } from "@repo/renderer";
import { createRoot } from "react-dom/client";
import { clockFromSearch, type HeldClock } from "../runtime/clock.ts";
import { installProbe } from "./probe.ts";
import { AdapterPage } from "./pages/AdapterPage.tsx";
import { ArithPage } from "./pages/ArithPage.tsx";

const clock = clockFromSearch(location.search);
const { probe, markReady } = installProbe((t) => (clock as Partial<HeldClock>).set?.(t));
const route = location.pathname.replace(/^\/lab\/?/, "").split("/")[0] || "adapter";
const root = createRoot(document.getElementById("root")!);

probe.adapter = await probeAdapter(navigator.gpu);
switch (route) {
  case "adapter":
    root.render(<AdapterPage adapter={probe.adapter} />);
    break;
  case "arith":
    root.render(<ArithPage />);
    break;
  default:
    root.render(<p>Unknown lab route: {route}</p>);
}
markReady();
