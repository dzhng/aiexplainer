/**
 * Every GPU buffer and texture is allocated through a scope of this registry, so counts
 * and bytes are known and everything is freed deterministically. Size- or data-dependent
 * resources live in a `Slot`: a replacement is built into a fresh scope and swapped in
 * whole, and a build that lands after `dispose` is freed on arrival.
 */
import { d, type TgpuBuffer, type TgpuRoot } from "typegpu";
import type { AnyData } from "typegpu/data";
import type { RegistryStats } from "./frame-input.ts";

const BYTES_PER_TEXEL: Partial<Record<GPUTextureFormat, number>> = {
  rgba16float: 8,
  depth32float: 4,
  rgba8unorm: 4,
  bgra8unorm: 4,
};

interface TextureDesc {
  size: readonly [number, number];
  format: GPUTextureFormat;
  sampleCount?: number;
  mipLevelCount?: number;
}

export function textureBytes(desc: TextureDesc): number {
  const texel = BYTES_PER_TEXEL[desc.format];
  if (texel === undefined) throw new Error(`registry: no byte size known for ${desc.format}`);
  let bytes = 0;
  for (let mip = 0; mip < (desc.mipLevelCount ?? 1); mip++) {
    const w = Math.max(1, desc.size[0] >> mip);
    const h = Math.max(1, desc.size[1] >> mip);
    bytes += w * h * texel * (desc.sampleCount ?? 1);
  }
  return bytes;
}

interface Tracked {
  destroy(): void;
  bytes: number;
}

export class Scope {
  #items: Tracked[] = [];
  #disposed = false;

  constructor(
    readonly root: TgpuRoot,
    private readonly onDispose: (scope: Scope) => void,
  ) {}

  buffer<T extends AnyData>(schema: T) {
    this.#assertLive();
    // `createBuffer` validates schemas at the type level; `AnyData` is already a valid schema.
    const buffer = this.root.createBuffer(schema as never) as TgpuBuffer<T>;
    this.#items.push({ destroy: () => buffer.destroy(), bytes: d.sizeOf(schema) });
    return buffer;
  }

  texture<const T extends TextureDesc>(desc: T) {
    this.#assertLive();
    const texture = this.root.createTexture(desc);
    this.#items.push({ destroy: () => texture.destroy(), bytes: textureBytes(desc) });
    return texture;
  }

  /** Tracks a raw WebGPU resource TypeGPU has no typed form for (query sets, map buffers). */
  raw<T extends { destroy(): void }>(resource: T, bytes: number): T {
    this.#assertLive();
    this.#items.push({ destroy: () => resource.destroy(), bytes });
    return resource;
  }

  stats(into: RegistryStats): void {
    into.count += this.#items.length;
    for (const item of this.#items) into.bytes += item.bytes;
  }

  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    for (const item of this.#items) item.destroy();
    this.#items = [];
    this.onDispose(this);
  }

  #assertLive(): void {
    if (this.#disposed) throw new Error("registry: allocation in a disposed scope");
  }
}

/** A replaceable resource set: the value and the scope that owns its GPU memory. */
export class Slot<T> {
  #current: { scope: Scope; value: T } | null = null;

  constructor(private readonly registry: Registry) {}

  get value(): T | null {
    return this.#current?.value ?? null;
  }

  /** Installs `value` (built in `scope`) and frees the previous one. */
  swap(scope: Scope, value: T): void {
    if (this.registry.disposed) {
      scope.dispose();
      return;
    }
    this.#current?.scope.dispose();
    this.#current = { scope, value };
  }

  clear(): void {
    this.#current?.scope.dispose();
    this.#current = null;
  }
}

export class Registry {
  #scopes = new Set<Scope>();
  #disposed = false;

  constructor(readonly root: TgpuRoot) {}

  get disposed(): boolean {
    return this.#disposed;
  }

  scope(): Scope {
    const scope = new Scope(this.root, (s) => this.#scopes.delete(s));
    this.#scopes.add(scope);
    return scope;
  }

  slot<T>(): Slot<T> {
    return new Slot<T>(this);
  }

  stats(into: RegistryStats = { count: 0, bytes: 0 }): RegistryStats {
    into.count = 0;
    into.bytes = 0;
    for (const scope of this.#scopes) scope.stats(into);
    return into;
  }

  /** Frees every scope; later swaps free their builds immediately. */
  dispose(): void {
    this.#disposed = true;
    for (const scope of this.#scopes) scope.dispose();
  }
}
