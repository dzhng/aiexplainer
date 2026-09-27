import { Layer, probeAdapter } from "@repo/renderer";
import { createRoot } from "react-dom/client";
import "../look/global.css";
import { applyCssVars } from "../look/look.ts";
import { clockFromSearch, type HeldClock } from "../runtime/clock.ts";
import { calibScene } from "./calib.ts";
import { loadFixture } from "./fixtures.ts";
import { kitScene } from "./kit.ts";
import { installProbe } from "./probe.ts";
import { measureBloom } from "./perf.ts";
import { registryBaseline } from "./registry-baseline.ts";
import { tokensScene } from "./tokens.ts";
import { AdapterPage } from "./pages/AdapterPage.tsx";
import { ScenePage } from "./pages/ScenePage.tsx";
import { StagePage } from "./pages/StagePage.tsx";
import { ArithPage } from "./pages/ArithPage.tsx";
import { ModelsPage } from "./pages/ModelsPage.tsx";
import { TokensPage } from "./pages/TokensPage.tsx";

const clock = clockFromSearch(location.search);
const { probe, markReady } = installProbe((t) => (clock as Partial<HeldClock>).set?.(t));
const params = new URLSearchParams(location.search);
const [first, sub = ""] = location.pathname.replace(/^\/lab\/?/, "").split("/");
const route = first || "adapter";
const root = createRoot(document.getElementById("root")!);
applyCssVars(document.documentElement);

probe.adapter = await probeAdapter(navigator.gpu);
const debug = {
  layers: params.get("emissive") === "0" ? ~Layer.emissive : ~0,
  bloom: params.get("bloom") !== "0",
};
// `?labels=0` hides the label layer; `?reading=precise` shows the precise wording.
const reading =
  params.get("labels") === "0" ? null : params.get("reading") === "precise" ? "precise" : "analogy";
// `?turntable=<rad/s>` spins the renderer fixtures' camera, for held-time orbit sweeps.
const turntable = Number(params.get("turntable") ?? 0);

const stage = (scene: Parameters<typeof StagePage>[0]["scene"]) =>
  root.render(
    <StagePage
      scene={scene}
      debug={debug}
      reading={reading}
      clock={clock}
      probe={probe}
      onReady={markReady}
    />,
  );

switch (route) {
  case "adapter":
    root.render(<AdapterPage adapter={probe.adapter} />);
    markReady();
    break;
  case "arith":
    root.render(<ArithPage />);
    markReady();
    break;
  case "models":
    // Waits for the inference worker's answers before it reports ready.
    root.render(<ModelsPage onReady={markReady} />);
    break;
  case "renderer":
    stage(async () => ({
      ...(await loadFixture(params.get("fixture") ?? "boxes")),
      pose: (pose, t) => {
        pose.yaw += t * turntable;
      },
    }));
    break;
  case "calib":
    stage(calibScene);
    break;
  case "scene":
    root.render(
      <ScenePage
        slug={sub}
        reading={reading}
        debug={debug}
        clock={clock}
        probe={probe}
        onReady={markReady}
      />,
    );
    break;
  case "kit":
    stage(() => kitScene(sub));
    break;
  case "tokens": {
    // `emissive` swatches go through the real renderer; every other section is DOM.
    const section = params.get("section");
    if (section === "emissive") stage(() => tokensScene(section));
    // Waits for its model and fonts before it reports ready.
    else root.render(<TokensPage section={section} onReady={markReady} />);
    break;
  }
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
