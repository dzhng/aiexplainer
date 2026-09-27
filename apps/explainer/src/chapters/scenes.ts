/**
 * The scene builders a chapter can name, and the anchors each one exposes. A chapter's
 * follow targets, labels and beat focus must use its scene's anchors; the builder
 * (`scene/builders/<id>.ts`, slice 10 onward) places a part at every anchor listed here.
 */
export const SCENE_ANCHORS = {
  /** Chapter 0: the counter board, its count bars, and the word rail. */
  autocomplete: ["board", "bars", "rail"],
  /** Chapter 11: the bus, its riders, the weight crates on its roof, and the stop where extras wait. */
  batching: ["bus", "riders", "crates", "stop"],
} as const satisfies Record<string, readonly string[]>;

/**
 * The kit primitives each scene builds from (`@repo/renderer` `KIT`). The validator rejects a
 * primitive outside the kit; a test holds each builder to its list.
 */
export const SCENE_KIT: Record<keyof typeof SCENE_ANCHORS, readonly string[]> = {
  autocomplete: ["mesh", "bars", "block"],
  batching: ["mesh", "block"],
};

export type SceneBuilderId = keyof typeof SCENE_ANCHORS;
export type AnchorId = (typeof SCENE_ANCHORS)[SceneBuilderId][number];

export function isSceneAnchor(scene: SceneBuilderId, anchor: string): boolean {
  return (SCENE_ANCHORS[scene] as readonly string[]).includes(anchor);
}
