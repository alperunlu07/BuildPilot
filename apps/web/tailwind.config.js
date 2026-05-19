/** @type {import('tailwindcss').Config} */
//
// BuildPilot design tokens live here under `theme.extend.colors.bp`.
// Components should prefer semantic tokens (`bg-bp-surface-0`,
// `text-bp-text-primary`) over raw palette utilities (`bg-slate-950`,
// `text-slate-100`) so a future light theme or palette tweak can flow
// through a single config change instead of a 70-component find-and-
// replace. The token catalog is documented in apps/web/DESIGN_TOKENS.md.
//
// We deliberately alias to the existing slate/sky/amber/emerald/rose
// shades the codebase already uses so this rollout is a pure additive
// — every existing utility class still works untouched. Components
// migrate to tokens as they're naturally touched.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bp: {
          // Primary brand / call-to-action accent. Used for primary
          // buttons, active states, links. Matches the existing sky-500
          // used by the focus ring helper.
          brand: '#0ea5e9', // tailwind sky-500
          // Surface layers — 0 is the deepest background (app shell),
          // 3 is the highest "card on top of dialog" surface.
          surface: {
            0: '#020617', // slate-950 — app background
            1: '#0f172a', // slate-900 — primary content card
            2: '#1e293b', // slate-800 — hover row, borders
            3: '#334155', // slate-700 — inputs, raised borders
          },
          // Text hierarchy — keep three steps so components don't reach
          // for ad-hoc slate-200 / 300 / 400 / 500 mid-greys.
          text: {
            primary:   '#f1f5f9', // slate-100 — body copy on dark surfaces
            secondary: '#cbd5e1', // slate-300 — secondary labels
            muted:     '#94a3b8', // slate-400 — timestamps, hints
          },
          // Status palette — matches the per-build status legend used
          // by BuildSparkline / FailureSummaryCard / status icons.
          success: '#34d399', // emerald-400
          warning: '#fbbf24', // amber-400
          error:   '#f87171', // rose-400
          info:    '#38bdf8', // sky-400
        },
      },
    },
  },
  plugins: [],
};
