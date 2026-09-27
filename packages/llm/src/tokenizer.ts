// The shared byte-level BPE tokenizer (D28). training/tokenizer.py trains it with HF
// `tokenizers` and writes this minimal format; this runtime reproduces HF's encoding
// exactly (pinned by training/fixtures/tokenizer.parity.json).
import { z } from "zod";
import { ProbeResult, Sha256 } from "./manifest.ts";

const Id = z.int().nonnegative();

/**
 * `vocab` entries are GPT-2 byte-level strings: every byte is one printable character
 * (a space is "Ġ"). Merge `i` has rank `i` and makes the entry `vocab[left] + vocab[right]`.
 */
export const TokenizerFile = z.strictObject({
  vocab: z.array(z.string().min(1)).min(1),
  merges: z.array(z.tuple([Id, Id])),
  special: z.strictObject({ bos: Id, eos: Id }),
});
export type TokenizerFile = z.infer<typeof TokenizerFile>;

/** The chapter-1 probes (D25) and scenario prompts (O2), next to the tokenizer file. */
export const TokenizerEvidence = z.strictObject({
  tokenizerSha256: Sha256,
  evidence: z.array(ProbeResult).min(1),
  prompts: z.array(z.string().min(1)).min(1),
});
export type TokenizerEvidence = z.infer<typeof TokenizerEvidence>;

export interface Piece {
  /** The piece's bytes as text; a piece holding part of a character shows U+FFFD. */
  text: string;
  /** `[start, end)` into the UTF-8 bytes of `decode(ids)`. */
  byteSpan: [number, number];
}

export interface Tokenizer {
  vocabSize: number;
  special: { bos: number; eos: number };
  /** Text to ids. Special tokens are never parsed out of text: "<eos>" is plain text. */
  encode(text: string): Uint32Array;
  /** Ids to text; special tokens decode to their literal text, e.g. "<eos>". */
  decode(ids: ArrayLike<number>): string;
  pieces(ids: ArrayLike<number>): Piece[];
}

// GPT-2's pre-tokenizer: contractions, letters, digits and other symbols (each with at
// most one leading space), then runs of whitespace.
const PRE_TOKEN = /'s|'t|'re|'ve|'m|'ll|'d| ?\p{L}+| ?\p{N}+| ?[^\s\p{L}\p{N}]+|\s+(?!\S)|\s+/gu;

// GPT-2's reversible byte ↔ printable-character table.
const BYTE_TO_CHAR: string[] = [];
const CHAR_TO_BYTE = new Map<string, number>();
{
  const printable = (b: number) =>
    (b >= 0x21 && b <= 0x7e) || (b >= 0xa1 && b <= 0xac) || (b >= 0xae && b <= 0xff);
  let next = 256;
  for (let b = 0; b < 256; b++) {
    const char = String.fromCodePoint(printable(b) ? b : next++);
    BYTE_TO_CHAR[b] = char;
    CHAR_TO_BYTE.set(char, b);
  }
}

const utf8 = new TextEncoder();
// Lossy (a piece may hold part of a character) and BOM-preserving, so decode round-trips.
const lossyUtf8 = new TextDecoder("utf-8", { ignoreBOM: true });

export function loadTokenizer(json: unknown): Tokenizer {
  const { vocab, merges, special } = TokenizerFile.parse(json);
  const ids = new Map(vocab.map((token, id) => [token, id]));
  const specialIds = new Set([special.bos, special.eos]);
  for (const id of specialIds) {
    if (id >= vocab.length) throw new Error(`special id ${id} is outside the vocabulary`);
  }

  const idBytes = vocab.map((token, id) =>
    specialIds.has(id) ? utf8.encode(token) : Uint8Array.from(token, (char) => byteOf(char)),
  );
  const byteIds = BYTE_TO_CHAR.map((char) => {
    const id = ids.get(char);
    if (id === undefined) throw new Error(`byte "${char}" is missing from the vocabulary`);
    return id;
  });

  // (left, right) → merge rank and the merged id.
  const mergeTable = new Map<number, { rank: number; id: number }>();
  merges.forEach(([left, right], rank) => {
    const id = ids.get(`${vocab[left]}${vocab[right]}`);
    if (id === undefined) throw new Error(`merge ${rank} makes a token missing from the vocab`);
    mergeTable.set(left * vocab.length + right, { rank, id });
  });

  const cache = new Map<string, number[]>();
  const encodePiece = (piece: string): number[] => {
    const cached = cache.get(piece);
    if (cached) return cached;
    const symbols = Array.from(utf8.encode(piece), (byte) => byteIds[byte]!);
    // Merge the lowest-ranked adjacent pair (leftmost on ties) until none is mergeable.
    for (;;) {
      let best: { rank: number; id: number } | undefined;
      let at = -1;
      for (let i = 0; i + 1 < symbols.length; i++) {
        const merge = mergeTable.get(symbols[i]! * vocab.length + symbols[i + 1]!);
        if (merge && (!best || merge.rank < best.rank)) {
          best = merge;
          at = i;
        }
      }
      if (!best) break;
      symbols.splice(at, 2, best.id);
    }
    cache.set(piece, symbols);
    return symbols;
  };

  const bytesOf = (tokenIds: ArrayLike<number>): Uint8Array[] =>
    Array.from(tokenIds, (id) => {
      const bytes = idBytes[id];
      if (!bytes) throw new Error(`token id ${id} is outside the vocabulary`);
      return bytes;
    });

  return {
    vocabSize: vocab.length,
    special,
    encode(text) {
      const out: number[] = [];
      for (const [piece] of text.matchAll(PRE_TOKEN)) out.push(...encodePiece(piece));
      return Uint32Array.from(out);
    },
    decode(tokenIds) {
      return lossyUtf8.decode(concat(bytesOf(tokenIds)));
    },
    pieces(tokenIds) {
      let start = 0;
      return bytesOf(tokenIds).map((bytes) => {
        const byteSpan: [number, number] = [start, start + bytes.length];
        start += bytes.length;
        return { text: lossyUtf8.decode(bytes), byteSpan };
      });
    },
  };
}

function byteOf(char: string): number {
  const byte = CHAR_TO_BYTE.get(char);
  if (byte === undefined) throw new Error(`"${char}" is not a byte-level character`);
  return byte;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
