# BuildPilot E2E + Visual Regression

Playwright drives both the **happy-path** smoke spec and the **visual
regression** baselines. Both share the same fixture
(`fixtures/server.ts`) which spawns an isolated server + Vite dev server
on dedicated ports.

## Running

```bash
# One-time browser install (chromium only — keeps the cache small)
pnpm playwright install chromium

# End-to-end smoke (add project → pipeline → build → success)
pnpm test:e2e

# Visual regression — diffs every snapshot under e2e/screenshots/ against
# the committed baseline.
pnpm test:visreg
```

## Updating baselines

Snapshots are produced on Linux. Subpixel antialiasing differs across OS
families (Linux vs macOS vs Windows), so regenerating on the wrong host
will produce a diff against CI even though the UI is unchanged. Always
regenerate inside a Linux container that matches the CI runner.

```bash
pnpm test:visreg -- --update-snapshots
```

Commit the resulting `e2e/screenshots/**/*.png` along with the source
change that motivated it.

## Threshold

`playwright.config.ts` allows 0.1% pixel-ratio drift to absorb font
hinting differences between Chrome versions. Anything beyond that is a
real regression and should be triaged before updating the baseline.

## Layout

```
e2e/
├── playwright.config.ts        ← shared config (snapshot dir, projects, …)
├── fixtures/
│   ├── server.ts               ← isolated server + Vite dev server
│   └── seed.ts                 ← creates a temp git repo + seed project
├── tests/
│   ├── happy-path.spec.ts      ← end-to-end smoke
│   └── visual-regression.spec.ts
└── screenshots/                ← committed baselines (per spec / per test)
```

## Project selectors

```bash
# Only run the smoke spec
pnpm test:e2e            # alias for --project=happy-path

# Only run visual regression
pnpm test:visreg         # alias for --project=visreg

# Both — chain via the root test script
pnpm test
```
