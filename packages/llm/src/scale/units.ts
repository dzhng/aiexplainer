/**
 * Unit brands for production arithmetic. They are plain numbers at runtime; the compiler
 * refuses to mix them (bytes are never seconds), so every conversion goes through a rate.
 */
declare const unit: unique symbol;
type Unit<U extends string> = number & { readonly [unit]: U };

export type Bytes = Unit<"B">;
export type Seconds = Unit<"s">;
export type Flops = Unit<"FLOP">;
export type BytesPerSec = Unit<"B/s">;
export type FlopsPerSec = Unit<"FLOP/s">;
export type TokensPerSec = Unit<"tok/s">;
/** Arithmetic intensity: FLOPs done per byte moved. */
export type FlopsPerByte = Unit<"FLOP/B">;

export const bytes = (n: number) => n as Bytes;
export const seconds = (n: number) => n as Seconds;
export const flops = (n: number) => n as Flops;
export const bytesPerSec = (n: number) => n as BytesPerSec;
export const flopsPerSec = (n: number) => n as FlopsPerSec;

/** Time to move `b` bytes at `rate`. */
export const transferTime = (b: Bytes, rate: BytesPerSec) => seconds(b / rate);
/** Time to do `f` FLOPs at `rate`. */
export const computeTime = (f: Flops, rate: FlopsPerSec) => seconds(f / rate);
