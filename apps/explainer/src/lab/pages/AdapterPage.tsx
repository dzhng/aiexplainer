import type { AdapterReport } from "@repo/renderer";

export function AdapterPage({ adapter }: { adapter: AdapterReport | null }) {
  return (
    <main style={{ fontFamily: "ui-monospace, monospace", padding: 24 }}>
      <h1>WebGPU adapter</h1>
      <pre data-testid="adapter">{JSON.stringify(adapter, null, 2) ?? "no adapter"}</pre>
    </main>
  );
}
