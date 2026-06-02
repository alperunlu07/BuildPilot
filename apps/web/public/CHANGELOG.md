# Changelog

All notable user-facing changes to BuildPilot. The newest version is at the
top. The in-app "What's new" drawer reads this file and surfaces entries
newer than the version you last opened.

## [0.13.0] — 2026-06-01

### Native desktop app

- **BuildPilot is now a desktop app** — a system-tray application for
  Windows, macOS and Linux that runs the build server quietly in the
  background. Left-click the tray icon to open the dashboard, right-click
  for a context menu.
- **Background server with auto-start** — the app launches (or adopts) the
  server on login and waits until it's healthy. Auto-start is opt-in on
  first run and can be toggled from the tray menu; your choice persists in
  `~/.buildpilot`.
- **Native OS notifications** — subscribe to live build events and get
  desktop toasts for build success / failure, awaiting-approval prompts,
  matrix results and newly-detected commits. Click a toast to jump straight
  to the relevant page.
- **Per-project tray shortcuts** — open a project in the panel or browser,
  reveal its folder on disk, or run `git pull` / `git fetch` without leaving
  the tray menu. Quick links to Builds, Queue and Settings too.
- **macOS menu-bar mode** — runs as a proper menu-bar app with a template
  tray icon and a hidden Dock entry, matching native macOS conventions.
- **Turnkey, self-contained packaging** — installers bundle their own Node
  runtime, so target machines need nothing pre-installed. The dashboard SPA
  is served from the server's own origin in production, so the whole app
  loads from a single port. "Open in browser" opens it in your default
  browser instead of the app window.
- **Single-instance & close-to-tray** — a second launch focuses the
  existing window instead of starting a duplicate; closing the window keeps
  the server running in the tray.
- **Configurable release manifest** — the S3 upload step now writes a
  `clientVersion` into the release manifest so desktop auto-update can
  target specific client builds.

## [0.12.0] — 2026-05-22

### A brand-new look (UI v2)

- **Full visual redesign** — every page rebuilt on a new design-token
  system with consistent surfaces, spacing and typography. Projects,
  Builds, Pipeline editor, Step Catalog, Home and Settings all share one
  cohesive language.
- **New Compass brand mark** — refreshed launcher icon and sidebar logo.
- **Accent-colour picker** — choose the highlight colour the whole app
  themes around.
- **Pipeline editor refresh** — redesigned step nodes, a refreshed palette,
  a three-tab property panel (Pipeline / Environment / Annotations) and
  general editor polish.
- **Builds list, three ways** — switch between grid, table and compact
  views; Projects gain inline sparklines and sortable columns.

### Responsive & mobile overhaul

- **Works on every screen** — a top-to-bottom responsive pass across the app
  shell, navigation, dialogs, drawers, toasts, pages and the pipeline
  editor.
- **Mobile sidebar drawer** — below the `md` breakpoint the sidebar becomes
  a slide-in drawer with a backdrop; tap targets grow to a comfortable size
  on touch devices.
- **Hardened against small screens** — body-scroll locking, an Escape-key
  stack so stacked dialogs close one at a time, and small-screen smoke tests
  to keep it from regressing.

### Settings redesign

- **New Settings layout** — a switcher-style navigation across 11 organized
  sections, plus an About panel.
- **AI Integrations** — configure per-tool executable paths and model
  overrides for AI-assisted steps from one place.

### Projects

- **Export & import project bundles** — package a full project (pipelines,
  configuration and history) into a portable bundle and import it elsewhere.

### Security

- **Hardening pass** — validated the AI-integrations path to block a
  remote-code-execution pivot, added a model argument-injection guard, and
  fixed Windows path handling in the same area.

## [0.11.0] — 2026-05-19

### Accounts & access control

- **Authentication and multi-user support** — sign-in, user management,
  per-user preferences, an audit log of sensitive actions, and personal API
  tokens for scripting against the server.

### Secrets & file vault

- **Secrets vault** — store named secrets and reference them from any step
  via `${{ secrets.NAME }}`, with a "where-used" view so you can see every
  step that consumes a secret.
- **Encrypted file vault** — store files referenced via `${{ files.NAME }}`.
- **Bulk import / export** — move secrets between environments as an
  encrypted bundle.

### Version-control integration

- **Check-runs back to your forge** — post build status as check-runs to
  GitHub / GitLab / Gitea using per-project VCS credentials.
- **GitHub OAuth** — connect credentials through a proper OAuth flow with
  dashboard pages to manage them.
- **PR summary card** — see the associated pull request right on the build
  detail page.
- **PR-comment triggers** — kick off builds with slash-command comments on a
  pull request.

### Build matrices

- **Matrix builds** — define declarative axes and preview the live
  cross-product before running. Parent builds show an N×M grid summary, you
  can re-run just the failed cells, and notifications roll up per-matrix
  instead of spamming one-per-cell.

### Manual approvals

- **`manualApproval` step** — pause a pipeline until a human approves, with
  a dedicated approval card in the build view.
- **Approvals inbox** — one page listing every pending decision.
- **Multi-approver gates** — require several reviewers, track progress, and
  record a role-aware audit trail.

### Execution lanes & queue

- **Execution lanes** — model your build capacity as named lanes; assign
  pipelines to a lane and give them a priority.
- **Lane-aware scheduler** — priority-ordered queueing, per-pipeline
  coalescing of pending builds, and recovery of in-flight builds after a
  restart.
- **Execution Queue panel** — a live `GET /api/queue`-backed view of what's
  running and pending, grouped by lane.

### Build fleet (remote hosts)

- **Hosts page** — the host manager is now a full `/hosts` page with
  capability badges and online / in-flight columns.
- **Load at a glance** — an inline 24-hour load sparkline per host plus an
  expanded load chart.
- **Capability-targeted steps** — multi-select capability tags on
  host-aware steps so work lands on a machine that can run it.

### Chat integrations

- **Slack slash commands** — drive builds from Slack with `/build`, `/list`
  and `/help`.
- **Discord slash commands** — the same, via the Discord Interactions API.
- **Per-step notify policy** — a `notifyOn` setting on all six notify step
  types, plus a "Send test" button on each one to verify a channel.

### Observability

- **Test report viewer** — parse and browse xcresult / JUnit reports with a
  coverage panel.
- **Flaky-test detection** — a page that surfaces tests which pass sometimes
  and fail others across recent builds.
- **Build-duration trends** — per-pipeline duration trend page.

### Triggers

- **Visual cron builder** — presets, a form mode and live validation for
  schedule triggers.
- **Tag-pattern preview** — see which tags your pattern would match, live.
- **Path-filter preview** — see the per-commit changed files your path
  filter would match.

### Accessibility (Cluster 10.F)

- Status badges paired with icons and `aria-label`s, focus rings and ARIA
  labels on icon-only buttons, keyboard navigation through pipeline step
  nodes (Tab / Enter), a `prefers-reduced-motion` pass across animations,
  and a colour-contrast sweep.

### Mobile & installable app (Cluster 10.G)

- Responsive sidebar drawer below the `md` breakpoint, a mobile-friendly
  build detail page, 32px tap targets on touch devices, and a minimal PWA
  manifest + service worker so the app shell is installable.

### Developer & quality infrastructure

- **Storybook 8** for the web component library with stories for 14 key
  components.
- **Automated tests** — Vitest + React Testing Library unit tests plus
  Playwright happy-path, visual-regression and responsive smoke suites.
- **Config validation** — Zod schema validation for `config.json` with
  actionable error messages.
- **`pnpm seed`** populates the database with demo projects, pipelines and
  build history for first-run exploration.

## [0.10.0] — 2026-05-18

### UI / UX polish (Cluster 10.E)

- **In-app changelog drawer** — surfaces newly-shipped features after each
  release.
- **Sidebar resize + collapse** — drag the right edge to resize, click the
  chevron to collapse to a 56px icon rail. State persists across reloads.
- **Empty-state CTAs** — Projects, Pipelines, Builds and Hosts pages show
  actionable empty states. The pipelines panel also offers a one-click
  "Load sample pipeline" (`checkout → pull → shell`) for first-run users.
- **Pipeline editor draft auto-save** — every edit is mirrored to
  `localStorage` once a second. If you reload mid-edit, a banner offers to
  restore or discard the in-flight draft.
- **Optimistic UI for run / cancel** — Run flips to "Queued…" immediately;
  Cancel greys the build out without waiting for the server. Errors roll
  back with a toast.
- **Toast-with-undo for destructive actions** — pipeline + project delete
  happen instantly with a 5-second UNDO toast; the real `DELETE` call
  doesn't fire until the timer elapses.
- **Per-build "Copy link" button** — shareable deep link to a build that
  auto-opens on the right view.
- **Typed-confirmation dialog** — irreversible actions (project removal,
  bulk prune) require you to type `delete` / `prune` before the destructive
  button enables.
- **Consistent date/time formatting** — every timestamp surfaces as "3 min
  ago" with the absolute date on hover.

## [0.9.0] — 2026-05

### Cluster 10.A · Navigation & information architecture

- Command palette (`Cmd/Ctrl+K`) over projects, pipelines, builds, actions.
- Global keyboard shortcuts (`g p`, `g b`, `g s`, `n`, `/`, `?`).
- Breadcrumb header and per-view URL routing (browser back/forward works).
- Favorite / pin projects + pipelines, recent-items list, density toggle,
  light/dark/system theme, `en` + `tr` i18n scaffolding.

### Cluster 10.B · Pipeline editor power features

- Minimap, undo / redo, multi-select bulk edit, auto-layout, inline
  validation badges, palette node hover preview, edge condition icons,
  right-click context menu, find / replace, copy / paste across pipelines,
  per-node disable flag.

### Cluster 10.C · Build & log experience

- Failure summary card with auto-fix suggestion summary.
- Regex log search, named filter presets, timestamp-range slider.
- "Copy as terminal command" per shell log line.
- Live tail with auto-scroll lock + "Jump to latest".
- Step duration comparison vs last green build.
- Collapsible log section groups (`::group::name` / `--- name`).
- Inline ANSI color rendering, build diff view.

### Cluster 10.D · Home dashboard

- Metrics-led landing page with running builds, last-24h success rate,
  recent failures, slowest pipelines, disk usage.
- Per-pipeline metrics panel + slowest-step leaderboard.
- Disk usage page with prune-older-than action.
- Active builds widget sticky across views.
