/**
 * Where a chapter's link-preview card lives (`public/media/`, written by
 * `bun run --cwd apps/explainer cards`): the 1200×630 image a shared `/c/N/` link shows (D34).
 */
import type { ChapterSlug } from "../chapters/ladder.ts";

export const MEDIA_DIR = "media";
export const CARD_SIZE = { width: 1200, height: 630 };

export function cardFor(slug: ChapterSlug): string {
  return `/${MEDIA_DIR}/${slug}-card.jpg`;
}
