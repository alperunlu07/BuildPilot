// BuildPilot brand mark — Compass glyph from the v2 design (docs/designs/
// icons.jsx). Uses currentColor everywhere so callers can drive the colour
// via Tailwind text-* / className. The needle's south half is muted via
// opacity so the north tip reads as "pointing".

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 22, className }: LogoProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <path d="M12 4 L14 11 L12 13 L10 11 Z" fill="currentColor" opacity="0.95" />
      <path d="M12 20 L10 13 L12 11 L14 13 Z" fill="currentColor" opacity="0.35" />
      <line x1="12" y1="2" x2="12" y2="3.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="12" y1="20.4" x2="12" y2="22" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2" y1="12" x2="3.6" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20.4" y1="12" x2="22" y2="12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
