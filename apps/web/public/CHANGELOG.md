# Changelog

All notable user-facing changes to BuildPilot. The newest version is at the
top. The in-app "What's new" drawer reads this file and surfaces entries
newer than the version you last opened.

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
