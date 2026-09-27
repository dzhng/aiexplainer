import { Layer, probeAdapter } from "@repo/renderer";
import { createRoot } from "react-dom/client";
import { clockFromSearch, type HeldClock } from "../runtime/clock.ts";
import { calibScene } from "./calib.ts";
import { loadFixture } from "./fixtures.ts";
import { kitScene } from "./kit.ts";
import { installProbe } from "./probe.ts";
import { measureBloom } from "./perf.ts";
import { registryBaseline } from "./registry-baseline.ts";
import { tokensScene } from "./tokens.ts";
import { AdapterPage } from "./pages/AdapterPage.tsx";
import { StagePage } from "./pages/StagePage.tsx";

const clock = clockFromSearch(location.search);
const { probe, markReady } = installProbe((t) => (clock as Partial<HeldClock>).set?.(t));
const params = new URLSearchParams(location.search);
const [first, sub = ""] = location.pathname.replace(/^\/lab\/?/, "").split("/");
const route = first || "adapter";
const root = createRoot(document.getElementById("root")!);

probe.adapter = await probeAdapter(navigator.gpu);
const debug = {
  layers: params.get("emissive") === "0" ? ~Layer.emissive : ~0,
  bloom: params.get("bloom") !== "0",
};
const stage = (scene: Parameters<typeof StagePage>[0]["scene"]) =>
  root.render(
    <StagePage scene={scene} debug={debug} clock={clock} probe={probe} onReady={markReady} />,
  );

switch (route) {
  case "adapter":
    root.render(<AdapterPage adapter={probe.adapter} />);
    markReady();
    break;
  case "renderer":
    stage(() => loadFixture(params.get("fixture") ?? "boxes"));
    break;
  case "calib":
    stage(calibScene);
    break;
  case "kit":
    stage(() => kitScene(sub));
    break;
  case "tokens":
    stage(() => tokensScene(params.get("section") ?? "emissive"));
    break;
  case "perf": {
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh";
    document.body.append(canvas);
    measureBloom(canvas, probe, params.get("fixture") ?? "board-room")
      .catch((error) => probe.errors.push(String(error)))
      .finally(markReady);
    break;
  }
  case "registry": {
    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    registryBaseline(canvas, probe)
      .catch((error) => probe.errors.push(String(error)))
      .finally(markReady);
    break;
  }
  default:
    root.render(<p>Unknown lab route: {route}</p>);
    markReady();
}
