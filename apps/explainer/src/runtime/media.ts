/**
 * Where a chapter's recorded media lives (`public/media/`, written by `bun run media`): the
 * fallback video and its poster (D29), and the 1200×630 link-preview image (D34).
 */
import type { ChapterSlug } from "../chapters/ladder.ts";

export const MEDIA_DIR = "media";
/** The recorded video's frame size (≤ 1280×720, D29) and the link-preview card's (D34). */
export const VIDEO_SIZE = { width: 1280, height: 720 };
export const CARD_SIZE = { width: 1200, height: 630 };

export function mediaFor(slug: ChapterSlug): { video: string; poster: string; card: string } {
  return {
    video: `/${MEDIA_DIR}/${slug}.mp4`,
    poster: `/${MEDIA_DIR}/${slug}.jpg`,
    card: `/${MEDIA_DIR}/${slug}-card.jpg`,
  };
}
