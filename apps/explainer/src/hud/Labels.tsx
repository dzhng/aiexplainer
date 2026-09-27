/**
 * Pinned labels: a dot on the part, a short leader and a pill with the label text. The
 * renderer's `placeLabels` decides where and whether each shows; this layer only moves DOM
 * nodes through refs every frame (no React render per frame). It sits above the canvas and
 * below the HUD panels (z-index 1 in slice 04's stage order).
 */
import {
  DEFAULT_LABEL_BOX,
  type LabelPlacement,
  type LabelSide,
  type ScreenRect,
} from "@repo/renderer";
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from "react";
import type { LabelDef } from "../chapters/types.ts";
import css from "./labels.module.css";

export type LabelReading = "analogy" | "precise";

export interface LabelsHandle {
  /** Moves and shows/hides every label to match `placements`. */
  update(placements: readonly LabelPlacement[]): void;
  /** Screen rects of the visible labels (dot, leader and pill), for crops. */
  rects(): Record<string, ScreenRect>;
  /** Each pill's laid-out width, so overlap tests use the real text width. */
  pillWidths(): Record<string, number>;
}

const box = DEFAULT_LABEL_BOX;
const leaderLength = Math.hypot(box.dx, box.dy + box.height / 2);
const leaderAngle = Math.atan2(box.dy + box.height / 2, box.dx);

/** Pill offset and leader angle for each side; the pill's far edge is set by `left`/`right`. */
const SIDE_STYLE: Record<LabelSide, { pill: Partial<CSSStyleDeclaration>; leader: string }> = {
  "up-right": {
    pill: { left: `${box.dx}px`, right: "", top: `${box.dy}px` },
    leader: `rotate(${leaderAngle}rad)`,
  },
  "up-left": {
    pill: { left: "", right: `${box.dx}px`, top: `${box.dy}px` },
    leader: `rotate(${Math.PI - leaderAngle}rad)`,
  },
  "down-right": {
    pill: { left: `${box.dx}px`, right: "", top: `${-box.dy - box.height}px` },
    leader: `rotate(${-leaderAngle}rad)`,
  },
  "down-left": {
    pill: { left: "", right: `${box.dx}px`, top: `${-box.dy - box.height}px` },
    leader: `rotate(${Math.PI + leaderAngle}rad)`,
  },
};

/** The renderer's label box as layout: where the pill sits and how long the leader runs. */
const geometry = {
  leader: { width: leaderLength, transform: `rotate(${leaderAngle}rad)` },
  pill: { left: box.dx, top: box.dy, height: box.height, maxWidth: box.width },
} satisfies Record<string, React.CSSProperties>;

export const Labels = forwardRef<
  LabelsHandle,
  { labels: readonly LabelDef[]; reading: LabelReading }
>(function Labels({ labels, reading }, ref) {
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const sides = useRef(new Map<string, LabelSide>());
  const widths = useRef<Record<string, number>>({});

  // Pill widths change only with the text (and once the font loads): measure then, not per frame.
  useLayoutEffect(() => {
    const measure = () => {
      const out: Record<string, number> = {};
      for (const [id, node] of nodes.current)
        out[id] = node.querySelector<HTMLElement>("[data-pill]")!.offsetWidth;
      widths.current = out;
    };
    measure();
    void document.fonts.ready.then(measure);
  }, [labels, reading]);

  useImperativeHandle(
    ref,
    () => ({
      update(placements) {
        for (const p of placements) {
          const node = nodes.current.get(p.id);
          if (!node) continue;
          node.style.visibility = p.visible ? "visible" : "hidden";
          if (!p.visible) continue;
          node.style.transform = `translate(${p.x}px, ${p.y}px)`;
          if (sides.current.get(p.id) !== p.side) {
            const side = SIDE_STYLE[p.side];
            Object.assign((node.querySelector("[data-pill]") as HTMLElement).style, side.pill);
            (node.querySelector("[data-leader]") as HTMLElement).style.transform = side.leader;
            sides.current.set(p.id, p.side);
          }
        }
      },
      pillWidths() {
        return widths.current;
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
    <div className={css.layer} data-labels="">
      {labels.map((label) => (
        <div
          key={label.anchor}
          data-label={label.anchor}
          className={css.label}
          style={{ visibility: "hidden" }}
          ref={(node) => {
            if (node) nodes.current.set(label.anchor, node);
            else nodes.current.delete(label.anchor);
          }}
        >
          <div className={css.leader} style={geometry.leader} data-leader="" />
          <div className={css.dot} data-dot="" />
          <div className={css.pill} style={geometry.pill} data-pill="">
            {reading === "analogy" ? label.analogy : label.precise}
          </div>
        </div>
      ))}
    </div>
  );
});
