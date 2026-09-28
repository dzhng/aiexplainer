/**
 * The scene builders a chapter can name, and the anchors each one exposes. A chapter's
 * follow targets, labels and beat focus must use its scene's anchors; the builder
 * (`scene/builders/<id>.ts`, slice 10 onward) places a part at every anchor listed here.
 */
export const SCENE_ANCHORS = {
  /** Chapter 0: the counter board, its count bars, and the word rail. */
  autocomplete: ["board", "bars", "rail"],
  /** Chapter 1: the bricks on show, the ids on them, the box of shapes, and the text's row. */
  tokenizer: ["bricks", "ids", "box", "text"],
  /** Chapter 2: the map, a word's pin, the arrows, the origin, and your text's pin. */
  embeddings: ["map", "pins", "arrows", "origin", "text"],
  /** Chapter 6: the question panel, the token arrow, the readout bars, the no-river teaser. */
  mlp: ["panel", "arrow", "readout", "teaser"],
  /** Chapter 7: the stations, the river under them, their volume knobs, the best guess. */
  residual: ["stations", "river", "knob", "readout"],
  /** Chapter 8: block 1's readers, its word rail, its frame, and the line of blocks. */
  stack: ["readers", "words", "block", "line"],
  /** Chapter 11: the bus, its riders, the weight crates on its roof, and the stop where extras wait. */
  batching: ["bus", "riders", "crates", "stop"],
  /** Chapter 12: the weight strip, the magnifier, the two crates and the two machines. */
  quantization: ["strip", "lens", "crates", "machines"],
} as const satisfies Record<string, readonly string[]>;

/**
 * The kit primitives each scene builds from (`@repo/renderer` `KIT`). The validator rejects a
 * primitive outside the kit; a test holds each builder to its list.
 */
export const SCENE_KIT: Record<keyof typeof SCENE_ANCHORS, readonly string[]> = {
  autocomplete: ["mesh", "bars", "block", "contactShadow"],
  tokenizer: ["block", "brick", "contactShadow"],
  embeddings: ["block", "pins", "brick", "contactShadow"],
  mlp: ["questionPanel", "tube", "block", "bars", "contactShadow"],
  residual: ["block", "tube", "river", "volumeKnob", "contactShadow"],
  stack: ["block", "tube", "contactShadow"],
  batching: ["mesh", "block", "contactShadow"],
  quantization: ["block", "contactShadow"],
};

export type SceneBuilderId = keyof typeof SCENE_ANCHORS;
export type AnchorId = (typeof SCENE_ANCHORS)[SceneBuilderId][number];

export function isSceneAnchor(scene: SceneBuilderId, anchor: string): boolean {
  return (SCENE_ANCHORS[scene] as readonly string[]).includes(anchor);
}
