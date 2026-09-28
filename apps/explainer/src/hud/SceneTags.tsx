/**
 * Scene text: small words drawn at points in the scene (the word on each count bar, the word
 * on the rail card). They are data, not labels: no pill or leader, placed by their `TagStyle`,
 * and they hide exactly like labels (behind the eye, off-screen, occluded); a tag that would
 * overlap an earlier one (builders list the most important first) hides too. Positioned through
 * refs every frame; text only changes the DOM when it changes. Same layer as the labels.
 */
import type { LabelPlacement, SceneAnchor, ScreenRect } from "@repo/renderer";
import { forwardRef, useImperativeHandle, useRef } from "react";

/**
 * How a tag sits on its point and reads:
 * - `above`: centred just above it, in ink (the word over a bar);
 * - `onPart`: the one word that matters most (a card's), larger and centred on the point in
 *   dark ink, as if written on the part;
 * - `before`: ending at the point, vertically centred, in muted ink (the earlier words that
 *   lead up to a card);
 * - `heading`: centred on the point, larger, in the glowing display face (a board's header).
 */
export type TagStyle = "above" | "onPart" | "before" | "heading";

/** What a scene builder hands the overlay: anchors and their text, both updated in place. */
export interface SceneTags {
  anchors: SceneAnchor[];
  /** Parallel to `anchors`; an empty string hides that tag. */
  text: string[];
  /** Parallel to `anchors`: how each tag sits and reads. */
  style: TagStyle[];
}

export interface SceneTagsHandle {
  update(placements: readonly LabelPlacement[], tags: SceneTags): void;
  /** The visible tags' screen rects, for labels to avoid; `out` is reused. */
  obstacles(out: ScreenRect[]): ScreenRect[];
}

const styles = {
  layer: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1 },
  tag: {
    position: "absolute",
    left: 0,
    top: 0,
    willChange: "transform",
    color: "var(--ink)",
    font: "600 1rem/1 var(--font-ui)",
    whiteSpace: "pre",
    textAlign: "center",
    lineHeight: 1.25,
    // A tight dark rim under the soft drop: the words read over bright pins and pipes too.
    textShadow: "0 0 2px var(--bg-deep), 0 0 3px var(--bg-deep), 0 1px 6px var(--bg-deep)",
  },
} satisfies Record<string, React.CSSProperties>;

/** Each style's type and ink, and where the tag's box sits on its point (fractions of its size). */
const LOOK: Record<
  TagStyle,
  { font: string; color: string; shadow: string; x: number; y: number }
> = {
  above: {
    font: styles.tag.font,
    color: styles.tag.color,
    shadow: styles.tag.textShadow,
    x: 0.5,
    y: 1.45,
  },
  onPart: {
    font: "600 var(--text-lg)/1 var(--font-ui)",
    color: "var(--bg-deep)",
    shadow: "none",
    x: 0.5,
    y: 0.5,
  },
  before: {
    font: styles.tag.font,
    color: "var(--hud-muted)",
    shadow: styles.tag.textShadow,
    x: 1,
    y: 0.5,
  },
  heading: {
    font: "700 var(--text-lg)/1 var(--font-display)",
    color: "var(--hud-accent)",
    shadow: "0 0 10px var(--hud-glow), 0 0 2px var(--bg-deep)",
    x: 0.5,
    y: 0.5,
  },
};

/** A 2 px gap counts as touching: tags need air between them to read. */
function overlaps(a: ScreenRect, b: ScreenRect): boolean {
  return (
    a.x < b.x + b.width + 2 &&
    b.x < a.x + a.width + 2 &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

export const SceneTagsLayer = forwardRef<SceneTagsHandle, { count: number }>(
  function SceneTagsLayer({ count }, ref) {
    const nodes = useRef<(HTMLDivElement | null)[]>([]);
    const shown = useRef<string[]>([]);
    /** Laid-out size per tag, measured only when its text changes. */
    const sizes = useRef<{ width: number; height: number }[]>([]);
    const rects = useRef<ScreenRect[]>([]);
    const visible = useRef<boolean[]>([]);

    useImperativeHandle(
      ref,
      () => ({
        update(placements, tags) {
          for (let i = 0; i < nodes.current.length; i++) {
            const node = nodes.current[i];
            if (!node) continue;
            const p = placements[i];
            const text = tags.text[i] ?? "";
            const show = !!p?.visible && text !== "";
            visible.current[i] = show;
            node.style.visibility = show ? "visible" : "hidden";
            if (!show) continue;
            if (shown.current[i] !== text) {
              node.textContent = text;
              // Always the style's own values, never "": clearing an inline property drops the
              // value React set from `styles.tag` too (the halo and ink were being lost).
              const look = LOOK[tags.style[i] ?? "above"];
              node.style.font = look.font;
              node.style.lineHeight = String(styles.tag.lineHeight);
              node.style.color = look.color;
              node.style.textShadow = look.shadow;
              shown.current[i] = text;
              sizes.current[i] = { width: node.offsetWidth, height: node.offsetHeight };
            }
            const look = LOOK[tags.style[i] ?? "above"];
            const size = sizes.current[i]!;
            const rect = (rects.current[i] ??= { x: 0, y: 0, width: 0, height: 0 });
            rect.x = p!.x - size.width * look.x;
            rect.y = p!.y - size.height * look.y;
            rect.width = size.width;
            rect.height = size.height;
            for (let j = 0; j < i && visible.current[i]; j++) {
              const other = rects.current[j];
              if (visible.current[j] && other && overlaps(rect, other)) visible.current[i] = false;
            }
            if (!visible.current[i]) {
              node.style.visibility = "hidden";
              continue;
            }
            // Whole pixels, like the labels: a composited layer keeps its first text raster.
            node.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`;
          }
        },
        obstacles(out) {
          out.length = 0;
          for (let i = 0; i < visible.current.length; i++)
            if (visible.current[i] && rects.current[i]) out.push(rects.current[i]!);
          return out;
        },
      }),
      [],
    );

    return (
      <div style={styles.layer} data-tags="">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{ ...styles.tag, visibility: "hidden" }}
            ref={(node) => {
              nodes.current[i] = node;
            }}
          />
        ))}
      </div>
    );
  },
);
