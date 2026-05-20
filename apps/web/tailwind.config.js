/** @type {import('tailwindcss').Config} */
//
// BuildPilot design tokens. Two generations coexist while components
// migrate:
//
//   - bp.*  (legacy): hardcoded slate/sky/amber/emerald/rose hex values.
//                     Stays in place so existing utility classes keep
//                     painting until each component is touched.
//   - bg.* / text.* / border.* / accent.* / status.* (UI v2):
//                     resolve to CSS custom properties declared in
//                     src/styles/tokens.css, so swapping data-theme,
//                     data-density, or the runtime accent paints the
//                     whole UI without a rebuild.
//
// Once every component migrates to the v2 namespace we delete the bp.*
// aliases (Faz 12 polish PR).
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // UI v2 token namespaces — back tokens.css custom properties.
        // Utility examples:
        //   bg-bg-panel       → background-color: var(--bg-panel)
        //   text-text-primary → color: var(--text-primary)
        //   border-border     → border-color: var(--border-default)
        //   bg-accent-soft    → background-color: var(--accent-soft)
        //   text-status-failed → color: var(--st-failed)
        bg: {
          base: 'var(--bg-base)',
          canvas: 'var(--bg-canvas)',
          panel: 'var(--bg-panel)',
          elevated: 'var(--bg-elevated)',
          hover: 'var(--bg-hover)',
          overlay: 'var(--bg-overlay)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          DEFAULT: 'var(--border-default)',
          emphasis: 'var(--border-emphasis)',
          strong: 'var(--border-strong)',
        },
        text: {
          primary: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          faint: 'var(--text-faint)',
          disabled: 'var(--text-disabled)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          glow: 'var(--accent-glow)',
          hover: 'var(--accent-hover)',
        },
        status: {
          pending: 'var(--st-pending)',
          running: 'var(--st-running)',
          success: 'var(--st-success)',
          failed: 'var(--st-failed)',
          cancel: 'var(--st-cancel)',
          skipped: 'var(--st-skipped)',
        },
        // Legacy bp.* namespace — see header. Removed in Faz 12.
        bp: {
          brand: '#0ea5e9',
          surface: {
            0: '#020617',
            1: '#0f172a',
            2: '#1e293b',
            3: '#334155',
          },
          text: {
            primary: '#f1f5f9',
            secondary: '#cbd5e1',
            muted: '#94a3b8',
          },
          success: '#34d399',
          warning: '#fbbf24',
          error: '#f87171',
          info: '#38bdf8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Inter Variable', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'JetBrains Mono Variable', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        btn: '6px',
        card: '8px',
        pill: '999px',
      },
    },
  },
  plugins: [],
};
