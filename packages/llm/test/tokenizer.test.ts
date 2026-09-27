import { describe, expect, test } from "bun:test";
import { TokenizerEvidence, loadTokenizer, seededRng, sha256Hex, type Rng } from "../src/index.ts";

const tokenizerDir = new URL("../../../apps/explainer/public/models/tokenizer/", import.meta.url);
const parityUrl = new URL("../../../training/fixtures/tokenizer.parity.json", import.meta.url);

const tokenizerFile = await Bun.file(new URL("tokenizer.json", tokenizerDir)).arrayBuffer();
const tokenizer = loadTokenizer(JSON.parse(new TextDecoder().decode(tokenizerFile)));

// Code point pools that stress the pre-tokenizer and byte-level merging.
const POOLS: [number, number][] = [
  [0x20, 0x7e], // ASCII
  [0x20, 0x20], // spaces
  [0x09, 0x0d], // tabs and newlines
  [0xa0, 0xff], // Latin-1, including no-break space
  [0x300, 0x36f], // combining marks
  [0x400, 0x4ff], // Cyrillic
  [0x2000, 0x206f], // general punctuation, including odd spaces
  [0x4e00, 0x4fff], // CJK
  [0x1f300, 0x1faff], // emoji (astral)
  [0x1d400, 0x1d7ff], // mathematical letters (astral)
  [0xfeff, 0xfeff], // byte order mark
  [0x00, 0x1f], // control characters
];

function randomString(rng: Rng): string {
  const length = Math.floor(rng() * 40);
  let text = "";
  for (let i = 0; i < length; i++) {
    const [lo, hi] = POOLS[Math.floor(rng() * POOLS.length)]!;
    text += String.fromCodePoint(lo + Math.floor(rng() * (hi - lo + 1)));
  }
  return text;
}

describe("tokenizer", () => {
  test("encode equals the Python reference on the parity fixtures", async () => {
    const cases: { text: string; ids: number[] }[] = await Bun.file(parityUrl).json();
    expect(cases.length).toBe(500);
    for (const { text, ids } of cases) {
      expect({ text, ids: Array.from(tokenizer.encode(text)) }).toEqual({ text, ids });
    }
  });

  test("decode(encode(s)) === s on random strings", () => {
    const rng = seededRng(14);
    for (let i = 0; i < 2000; i++) {
      const text = randomString(rng);
      expect(tokenizer.decode(tokenizer.encode(text))).toBe(text);
    }
  });

  test("pieces tile the decoded bytes, and split a character's bytes when BPE does", () => {
    const text = "The cat sat on the mat. 🐶";
    const ids = tokenizer.encode(text);
    const pieces = tokenizer.pieces(ids);
    expect(pieces.length).toBe(ids.length);
    let end = 0;
    for (const { byteSpan } of pieces) {
      expect(byteSpan[0]).toBe(end);
      end = byteSpan[1];
    }
    expect(end).toBe(new TextEncoder().encode(text).length);
    expect(pieces.slice(0, 3).map((piece) => piece.text)).toEqual(["The", " cat", " sat"]);
  });

  test("special tokens are plain text to encode, and decode to their literal text", () => {
    const { bos, eos } = tokenizer.special;
    expect(Array.from(tokenizer.encode("<eos>"))).not.toContain(eos);
    expect(tokenizer.decode([bos, ...tokenizer.encode("Hi"), eos])).toBe("<bos>Hi<eos>");
  });

  test("the probe evidence names the committed tokenizer file", async () => {
    const evidence = TokenizerEvidence.parse(
      await Bun.file(new URL("evidence.json", tokenizerDir)).json(),
    );
    expect(evidence.tokenizerSha256).toBe(await sha256Hex(tokenizerFile));
  });

  test("rejects a vocabulary missing a byte", () => {
    expect(() =>
      loadTokenizer({ vocab: ["<bos>", "<eos>", "a"], merges: [], special: { bos: 0, eos: 1 } }),
    ).toThrow("missing from the vocabulary");
  });
});
