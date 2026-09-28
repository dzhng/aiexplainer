/**
 * Scene text: small words drawn at points in the scene (the word on each count bar, the word
 * on the rail card). They are data, not labels: no pill or leader, centred above their point,
 * and they hide exactly like labels (behind the eye, off-screen, occluded); a tag that would
 * overlap an earlier one (builders list the most important first) hides too. Positioned through
 * refs every frame; text only changes the DOM when it changes. Same layer as the labels.
 */
import type { LabelPlacement, SceneAnchor, ScreenRect } from "@repo/renderer";
import { forwardRef, useImperativeHandle, useRef } from "react";

/** What a scene builder hands the overlay: anchors and their text, both updated in place. */
export interface SceneTags {
  anchors: SceneAnchor[];
  /** Parallel to `anchors`; an empty string hides that tag. */
  text: string[];
  /**
   * Parallel to `anchors`: the one word that matters most (the card's), printed larger and
   * centred on its point in dark ink, as if written on the part. Others sit above their point.
   */
  emphasis: boolean[];
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
              const onPart = tags.emphasis[i];
              // Back to the tag's own style, not "": clearing an inline property drops the
              // value React set from `styles.tag` too (the halo and ink were being lost).
              node.style.fontSize = onPart ? "var(--text-lg)" : "1rem";
              node.style.color = onPart ? "var(--bg-deep)" : styles.tag.color;
              node.style.textShadow = onPart ? "none" : styles.tag.textShadow;
              shown.current[i] = text;
              sizes.current[i] = { width: node.offsetWidth, height: node.offsetHeight };
            }
            const lift = tags.emphasis[i] ? 0.5 : 1.45;
            const size = sizes.current[i]!;
            const rect = (rects.current[i] ??= { x: 0, y: 0, width: 0, height: 0 });
            rect.x = p!.x - size.width / 2;
            rect.y = p!.y - size.height * lift;
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
            node.style.transform = `translate(${p!.x}px, ${p!.y}px) translate(-50%, -${lift * 100}%)`;
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
