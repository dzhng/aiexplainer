/**
 * Pinned labels: a dot on the part, a short leader and a pill with the label text. The
 * renderer's `placeLabels` decides where and whether each shows; this layer only moves DOM
 * nodes through refs every frame (no React render per frame). It sits above the canvas and
 * below the HUD panels (z-index 1 in slice 04's stage order).
 */
import { DEFAULT_LABEL_BOX, type LabelPlacement, type ScreenRect } from "@repo/renderer";
import { forwardRef, useImperativeHandle, useRef } from "react";
import type { LabelDef } from "../chapters/types.ts";

export type LabelReading = "analogy" | "precise";

export interface LabelsHandle {
  /** Moves and shows/hides every label to match `placements`. */
  update(placements: readonly LabelPlacement[]): void;
  /** Screen rects of the visible labels (dot, leader and pill), for crops. */
  rects(): Record<string, ScreenRect>;
  /** Each pill's laid-out width, so overlap tests use the real text width. */
  pillWidths(): Record<string, number>;
}

const DOT = 8;
const box = DEFAULT_LABEL_BOX;
const leaderLength = Math.hypot(box.dx, box.dy + box.height / 2);
const leaderAngle = Math.atan2(box.dy + box.height / 2, box.dx);

const styles = {
  layer: { position: "fixed", inset: 0, pointerEvents: "none", zIndex: 1 },
  label: { position: "absolute", left: 0, top: 0, willChange: "transform" },
  dot: {
    position: "absolute",
    left: -DOT / 2,
    top: -DOT / 2,
    width: DOT,
    height: DOT,
    borderRadius: "50%",
    background: "var(--ink)",
    boxShadow: "0 0 0 2px var(--hud-panel)",
  },
  leader: {
    position: "absolute",
    left: 0,
    top: 0,
    width: leaderLength,
    height: 1,
    background: "var(--ink)",
    opacity: 0.55,
    transformOrigin: "0 0",
    transform: `rotate(${leaderAngle}rad)`,
  },
  pill: {
    position: "absolute",
    left: box.dx,
    top: box.dy,
    height: box.height,
    maxWidth: box.width,
    boxSizing: "border-box",
    padding: "0 10px",
    display: "flex",
    alignItems: "center",
    borderRadius: box.height / 2,
    background: "var(--hud-panel)",
    border: "1px solid var(--hud-line)",
    color: "var(--ink)",
    font: "500 var(--text-sm)/1 var(--font-ui)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    backdropFilter: "blur(6px)",
  },
} satisfies Record<string, React.CSSProperties>;

export const Labels = forwardRef<
  LabelsHandle,
  { labels: readonly LabelDef[]; reading: LabelReading }
>(function Labels({ labels, reading }, ref) {
  const nodes = useRef(new Map<string, HTMLDivElement>());

  useImperativeHandle(
    ref,
    () => ({
      update(placements) {
        for (const p of placements) {
          const node = nodes.current.get(p.id);
          if (!node) continue;
          node.style.visibility = p.visible ? "visible" : "hidden";
          if (p.visible) node.style.transform = `translate(${p.x}px, ${p.y}px)`;
        }
      },
      pillWidths() {
        const out: Record<string, number> = {};
        for (const [id, node] of nodes.current)
          out[id] = node.querySelector<HTMLElement>("[data-pill]")!.offsetWidth;
        return out;
      },
      rects() {
        const out: Record<string, ScreenRect> = {};
        for (const [id, node] of nodes.current) {
          if (node.style.visibility === "hidden") continue;
          const parts = [...node.children].map((child) => child.getBoundingClientRect());
          const x0 = Math.min(...parts.map((r) => r.left));
          const y0 = Math.min(...parts.map((r) => r.top));
          const x1 = Math.max(...parts.map((r) => r.right));
          const y1 = Math.max(...parts.map((r) => r.bottom));
          out[`label:${id}`] = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
        }
        return out;
      },
    }),
    [],
  );

  return (
    <div style={styles.layer} data-labels="">
      {labels.map((label) => (
        <div
          key={label.anchor}
          data-label={label.anchor}
          style={{ ...styles.label, visibility: "hidden" }}
          ref={(node) => {
            if (node) nodes.current.set(label.anchor, node);
            else nodes.current.delete(label.anchor);
          }}
        >
          <div style={styles.leader} />
          <div style={styles.dot} data-dot="" />
          <div style={styles.pill} data-pill="">
            {reading === "analogy" ? label.analogy : label.precise}
          </div>
        </div>
      ))}
    </div>
  );
});
