/**
 * How a stat chip writes its number. Three significant figures, en-US grouping, and decimal
 * (SI) byte units throughout, matching the GPU spec sheet ("80 GB", "3.35 TB/s") so sizes
 * compare at a glance. Fractions are passed as 0–1 for `pct`.
 */
import type { StatFormat } from "./types.ts";

const sig3 = (n: number) => Number(n.toPrecision(3)).toLocaleString("en-US");
const grouped = (n: number) => Math.round(n).toLocaleString("en-US");

function scaled(n: number, steps: readonly [number, string][], unit: string): string {
  for (const [size, name] of steps)
    if (Math.abs(n) >= size) return `${sig3(n / size)} ${name}${unit}`;
  return `${sig3(n)} ${unit}`.trim();
}

const WORDS: [number, string][] = [
  [1e12, "trillion"],
  [1e9, "billion"],
  [1e6, "million"],
];
const SI: [number, string][] = [
  [1e12, "T"],
  [1e9, "G"],
  [1e6, "M"],
  [1e3, "k"],
];

export function formatStat(value: number, format: StatFormat): string {
  switch (format) {
    case "int":
      return Math.abs(value) >= 1e6 ? scaled(value, WORDS, "") : grouped(value);
    case "num":
      // A measured average, e.g. characters per token: three figures, no unit.
      return sig3(value);
    case "bytes":
      return scaled(value, SI, "B");
    case "tok/s":
      return `${Math.abs(value) >= 100 ? grouped(value) : sig3(value)} tok/s`;
    case "s":
      return value < 1 ? `${sig3(value * 1000)} ms` : `${sig3(value)} s`;
    case "pct":
      // Three figures here too, so 0.9991 reads "99.9%" and never rounds up to a certainty.
      return `${sig3(value * 100)}%`;
    case "x":
      return `${sig3(value)}×`;
    case "nats":
      return `${sig3(value)} nats`;
  }
}
