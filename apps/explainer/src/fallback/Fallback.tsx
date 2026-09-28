/**
 * The fallback page (D20, D29): phones, small windows and browsers without WebGPU get a video
 * of the real app instead of the 3D machine, plus a way to open it on a desktop.
 */
import { useState } from "react";
import { displayNumber } from "../chapters/ladder.ts";
import type { ChapterDef } from "../chapters/types.ts";
import { BrandMark, ShareIcon, XIcon } from "../hud/icons.tsx";
import hud from "../hud/hud.module.css";
import { BRAND_NAME, SERIES_TITLE, X_PROFILE } from "../look/brand.ts";
import { mediaFor } from "../runtime/media.ts";
import type { Support } from "../runtime/support.ts";
import { sharePathFor } from "../state/app-state.ts";
import { copyOrShow } from "./copy.ts";
import css from "./fallback.module.css";

/** Why this visitor sees a video, and what the link is for. */
const WHY: Record<Exclude<Support, "webgpu">, string> = {
  "small-screen": "Best on a desktop browser: send yourself the link.",
  "no-webgpu": "The 3D machine needs WebGPU: try desktop Chrome or Edge.",
};

export function Fallback({ def, reason }: { def: ChapterDef; reason: Exclude<Support, "webgpu"> }) {
  const [copied, setCopied] = useState(false);
  const media = mediaFor(def.slug);
  const copy = () => {
    const url = `${location.origin}${sharePathFor(def.slug)}`;
    // No clipboard (an insecure context) or a refused one: the link is shown to copy by hand.
    const clipboard = navigator.clipboard as Clipboard | undefined;
    void copyOrShow(url, clipboard, (text) => window.prompt("Copy this link", text)).then(
      (copied) => {
        if (!copied) return;
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
    );
  };
  return (
    <main className={css.page} data-fallback={reason}>
      <header className={css.header} data-crop="fallback:header">
        <div className={hud.brand}>
          <BrandMark />
          {BRAND_NAME}
        </div>
        <p className={hud.series}>{SERIES_TITLE}</p>
        <h1 className={`${hud.title} ${css.title}`}>
          <span className={hud.titleNum}>{displayNumber(def.slug)}</span>
          {def.title}
        </h1>
      </header>
      <video
        className={css.video}
        data-crop="fallback:video"
        src={media.video}
        poster={media.poster}
        autoPlay
        muted
        loop
        playsInline
        aria-label={`A recording of chapter ${displayNumber(def.slug)}: ${def.title}`}
      />
      <p className={css.why}>{def.why}</p>
      <div className={css.actions} data-crop="fallback:actions">
        <p className={css.best}>{WHY[reason]}</p>
        <button className={css.primary} onClick={copy}>
          <ShareIcon />
          {copied ? "Link copied" : "Copy link"}
        </button>
        <a className={css.secondary} href={X_PROFILE} target="_blank" rel="noreferrer">
          <XIcon />
          Follow on X
        </a>
      </div>
    </main>
  );
}
