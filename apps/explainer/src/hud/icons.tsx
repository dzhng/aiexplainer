/** The HUD's icons, drawn in `currentColor` on a 16-unit grid. */
import type { ReactNode } from "react";
import css from "./hud.module.css";

function Icon({ children, className = css.icon }: { children: ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      {children}
    </svg>
  );
}

export const PlayIcon = () => (
  <Icon>
    <path d="M4 2.5v11l9.5-5.5z" />
  </Icon>
);

export const PauseIcon = () => (
  <Icon>
    <rect x="3" y="2.5" width="3.5" height="11" rx="1" />
    <rect x="9.5" y="2.5" width="3.5" height="11" rx="1" />
  </Icon>
);

export const HelpIcon = () => (
  <Icon>
    <path d="M8 1.5a4 4 0 0 0-4 4h2.2a1.8 1.8 0 1 1 2.6 1.6C7.7 7.7 6.9 8.6 6.9 10v.8h2.2V10c0-.5.3-.8 1-1.2A4 4 0 0 0 8 1.5zM6.9 12.3h2.2v2.2H6.9z" />
  </Icon>
);

export const CloseIcon = () => (
  <Icon>
    <path d="M3.4 2 8 6.6 12.6 2 14 3.4 9.4 8l4.6 4.6-1.4 1.4L8 9.4 3.4 14 2 12.6 6.6 8 2 3.4z" />
  </Icon>
);

export const ShareIcon = () => (
  <Icon>
    <path d="M8 1 4.5 4.5l1.1 1.1 1.6-1.6V10h1.6V4l1.6 1.6 1.1-1.1zM2.5 7v6.5c0 .8.7 1.5 1.5 1.5h8c.8 0 1.5-.7 1.5-1.5V7h-1.6v6.4H4.1V7z" />
  </Icon>
);

/** The X (formerly Twitter) glyph. */
export const XIcon = () => (
  <Icon>
    <path d="M12.2 1.5h2.2L9.6 7l5.6 7.5h-4.4L7.4 10l-4 4.5H1.2l5.2-5.9L1 1.5h4.5l3.1 4.1zm-.8 11.7h1.2L4.7 2.7H3.4z" />
  </Icon>
);

export const ChevronIcon = () => (
  <Icon className={css.chevron}>
    <path d="M5 2.5 10.5 8 5 13.5 3.6 12.1 7.7 8 3.6 3.9z" />
  </Icon>
);

/** The dzhng mark: a word flowing into the next one. A placeholder until the brand art lands. */
export const BrandMark = () => (
  <svg className={css.brandMark} viewBox="0 0 16 16" aria-hidden="true">
    <rect x="1" y="4" width="6" height="8" rx="1.5" fill="var(--active)" />
    <rect x="9" y="4" width="6" height="8" rx="1.5" fill="var(--flow)" />
  </svg>
);
