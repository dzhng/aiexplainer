/**
 * The renderer's debug layers from the page's query, for shots that isolate one layer:
 * `?emissive=0` hides the emissive glow; `?layers=flows` (a comma list of `Layer` names) shows
 * only those layers. The app and the lab pages read it the same way.
 */
import { Layer } from "@repo/renderer";

export function layersFrom(params: URLSearchParams): number {
  const only = params.get("layers");
  if (only !== null)
    return only.split(",").reduce((bits, name) => {
      if (!Object.hasOwn(Layer, name)) throw new Error(`?layers: unknown layer "${name}"`);
      return bits | Layer[name as keyof typeof Layer];
    }, 0);
  return params.get("emissive") === "0" ? ~Layer.emissive : ~0;
}
