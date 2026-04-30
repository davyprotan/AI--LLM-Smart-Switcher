import type { CSSProperties, ReactElement } from "react";

interface IconProps {
  name: string;
  className?: string;
}

const style: CSSProperties = {
  width: 18,
  height: 18,
  display: "block",
};

export function Icon({ name, className }: IconProps) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const glyphs: Record<string, ReactElement> = {
    dashboard: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <rect x="2" y="2" width="6" height="6" rx="1.5" {...common} />
        <rect x="12" y="2" width="6" height="6" rx="1.5" {...common} />
        <rect x="2" y="12" width="6" height="6" rx="1.5" {...common} />
        <rect x="12" y="12" width="6" height="6" rx="1.5" {...common} />
      </svg>
    ),
    hardware: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <rect x="5" y="5" width="10" height="10" rx="2" {...common} />
        <path d="M7 1v3M13 1v3M7 16v3M13 16v3M1 7h3M16 7h3M1 13h3M16 13h3" {...common} />
      </svg>
    ),
    models: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <circle cx="10" cy="10" r="3.5" {...common} />
        <path d="M10 1v3M10 16v3M1 10h3M16 10h3M4 4l2 2M14 14l2 2M4 16l2-2M14 6l2-2" {...common} />
      </svg>
    ),
    switcher: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <path d="M4 6h11" {...common} />
        <path d="M12 3l3 3-3 3" {...common} />
        <path d="M16 14H5" {...common} />
        <path d="M8 11l-3 3 3 3" {...common} />
      </svg>
    ),
    snapshots: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <circle cx="10" cy="10" r="7" {...common} />
        <path d="M10 6v4l3 2" {...common} />
      </svg>
    ),
    settings: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <circle cx="10" cy="10" r="2.5" {...common} />
        <path d="M10 1.5v3M10 15.5v3M1.5 10h3M15.5 10h3M4 4l2 2M14 14l2 2M4 16l2-2M14 6l2-2" {...common} />
      </svg>
    ),
    benchmark: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <path d="M4 15l4-5 3 2 5-7" {...common} />
        <path d="M4 4v12h12" {...common} />
      </svg>
    ),
    warning: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <path d="M10 3l7 13H3L10 3z" {...common} />
        <path d="M10 8v3" {...common} />
        <circle cx="10" cy="13.5" r="0.8" fill="currentColor" />
      </svg>
    ),
    activity: (
      <svg viewBox="0 0 20 20" style={style} className={className}>
        <path d="M2 10h3l2-4 3 8 2-4h6" {...common} />
      </svg>
    ),
  };

  return glyphs[name] ?? glyphs.dashboard;
}
