export interface AdapterReport {
  vendor: string;
  architecture: string;
  isFallbackAdapter: boolean;
  features: string[];
}

/** Reports the adapter WebGPU would give us, or `null` when there is none. */
export async function probeAdapter(gpu: GPU | undefined): Promise<AdapterReport | null> {
  const adapter = await gpu?.requestAdapter();
  if (!adapter) return null;
  const { vendor, architecture, isFallbackAdapter } = adapter.info;
  return { vendor, architecture, isFallbackAdapter, features: [...adapter.features].sort() };
}
