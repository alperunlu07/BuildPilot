// BuildPilot brand mark — refreshed Compass glyph (Frame 14). Uses currentColor
// everywhere so callers can drive the colour via Tailwind text-* / className.
// The needle's south half is muted via opacity so the north tip reads as
// "pointing". Same shape as the app/launcher icon, kept in sync.

interface LogoProps {
  size?: number;
  className?: string;
}

export function Logo({ size = 22, className }: LogoProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 150 150"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path opacity="0.95" d="M87 67L84.3037 69.1338C82.355 66.0497 78.9179 64 75 64C71.0819 64 67.6439 66.0495 65.6953 69.1338L63 67L75 24L87 67Z" fill="currentColor" />
      <path opacity="0.4" d="M87 83.1338L84.3037 81C82.355 84.0841 78.9179 86.1338 75 86.1338C71.0819 86.1338 67.6439 84.0843 65.6953 81L63 83.1338L75 126.134L87 83.1338Z" fill="currentColor" />
      <circle cx="75" cy="75" r="9" fill="currentColor" />
      <path d="M139 75C139 110.346 110.346 139 75 139C39.6538 139 11 110.346 11 75C11 39.6538 39.6538 11 75 11C110.346 11 139 39.6538 139 75ZM14.52 75C14.52 108.402 41.5978 135.48 75 135.48C108.402 135.48 135.48 108.402 135.48 75C135.48 41.5978 108.402 14.52 75 14.52C41.5978 14.52 14.52 41.5978 14.52 75Z" fill="currentColor" />
      <path d="M73 13C73 11.8954 73.8954 11 75 11C76.1046 11 77 11.8954 77 13V23H73V13Z" fill="currentColor" />
      <path d="M73 127H77V137C77 138.105 76.1046 139 75 139C73.8954 139 73 138.105 73 137V127Z" fill="currentColor" />
      <path d="M127 77V73H137C138.105 73 139 73.8954 139 75C139 76.1046 138.105 77 137 77H127Z" fill="currentColor" />
      <path d="M13 77C11.8954 77 11 76.1046 11 75C11 73.8954 11.8954 73 13 73H23V77H13Z" fill="currentColor" />
    </svg>
  );
}
