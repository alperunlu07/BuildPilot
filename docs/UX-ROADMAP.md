# BuildPilot — UI / UX & Platform Enhancement Roadmap

Companion document to [`TODO.md`](../TODO.md). The main TODO tracks the
**pipeline engine + step library + integrations** roadmap. This file tracks
the **dashboard UI/UX + cross-cutting platform polish** roadmap — the parts
that don't introduce new step types but make the existing surface area more
usable, accessible, observable, and pleasant to live in every day.

Same conventions as the main TODO: keep items short, link the commit sha
when something ships, move done items into the ✅ column. Cluster names
(10.A, 10.B, …) extend the existing Phase numbering — Phase 10 is UI/UX,
Phase 11 is platform expansion that mostly cross-references existing
clusters in `TODO.md`.

---

## 🟡 Phase 10 — UI/UX overhaul

Goal: take the dashboard from "functional power-user tool" to "tool you
reach for first thing in the morning". Lots of small wins; navigation,
keyboard ergonomics, pipeline-editor power features, and a metrics-led
landing experience.

### Cluster 10.A · Navigation & information architecture

- [x] **Command palette** — `Cmd/Ctrl + K` opens a fuzzy-search palette
  over projects, pipelines, builds + global actions (Add project, Open
  settings, Run pipeline X, Open hosts, Toggle theme, …) — `6a7b811`
- [x] **Global keyboard shortcuts** — `g p` (projects), `g b` (builds),
  `g s` (settings), `n` (new pipeline in current project context), `/`
  (focus search in current view), `Esc` (close dialog / panel),
  `Enter` (confirm primary action). Help overlay on `?` — `6a7b811`
- [x] **Breadcrumb header** — `Projects › MyGame › iOS Release › Build #142`
  with each segment clickable; replaces the "go back via sidebar" loop — `ac355eb`
- [x] **Per-view URL routing** — switch from Zustand-only `view` state to
  `react-router` (or wouter) so the address bar reflects the current view
  and the browser back/forward buttons work — `2806e56`
- [ ] **Multi-tab / split view** — keep the pipeline editor and live build
  log open side-by-side in a resizable split (current `BuildLogPanel`
  is fixed bottom)
- [x] **Favorite / pin projects + pipelines** — sticky list at the top of
  the sidebar, persisted in `localStorage` — `dd3ff29`
- [x] **Recent items menu** — last 5 builds / pipelines accessed, in
  sidebar footer or palette — `dd3ff29`
- [x] **Density toggle** — `comfortable` (current) vs `compact` setting,
  applied to LogTable, Sidebar, ProjectsPage cards — `9c5f223`
- [x] **Light theme + system-default theme toggle** — currently only dark;
  Tailwind already supports `dark:` variant flip — `9c5f223`
- [x] **i18n scaffolding** — `react-intl` or `i18next`; ship `en` +
  `tr` to start; language picker in settings — `9c5f223`

### Cluster 10.B · Pipeline editor power features

- [x] **Minimap** — React Flow ships one for free; toggle in the editor
  toolbar — `2d3e92f`
- [x] **Undo / redo stack** — keyboard `Cmd/Ctrl + Z` / `Cmd/Ctrl + Shift + Z`;
  snapshots after every node add / move / edit / delete — `fb69f68`
- [x] **Multi-select + bulk edit** — `Shift + click` or drag-rectangle to
  select N nodes; "Bulk edit" side panel applies common fields (host,
  `continueOnError`, retry policy) to all — `2c54d18`
- [x] **Auto-layout** — `dagre` or `elk` layout button to tidy up a
  hand-drawn graph; respects manual positions otherwise — `67f48a7`
- [x] **Inline validation badges** — red dot on nodes with missing
  required fields; click → jumps to the offending field in the property
  panel — `0d0075c`
- [x] **Palette node preview on hover** — quick-glance card showing the
  step's required + optional fields before you drag it onto the canvas — `f7b38ab`
- [x] **Edge condition icons + tooltip** — render `success` (✓ green),
  `failure` (✗ red), `always` (∞ slate) as colored icons on edges
  instead of plain edge lines + edit dialog — `765c628`
- [x] **Right-click context menu** on a node — Run from here / Clone /
  Delete / Copy / Disable temporarily — `74c5b14`
- [x] **Find / replace within a pipeline** — `Cmd/Ctrl + F` in the editor
  searches node ids, types, and field values — `20901d8`
- [x] **Copy / paste nodes across pipelines** — clipboard-backed, re-ids
  on paste — `748e461`
- [x] **Disable / skip flag on a node** — visually grays the step out and
  the engine treats it as a no-op success (faster than deleting and
  re-adding when debugging) — `e57c7b0` (UI only; engine-side support is follow-up)
- [ ] **Group / lane visualization** — colored swimlane backgrounds for
  the iOS / Android / Notify portion of long pipelines (deferred — stretch)

### Cluster 10.C · Build & log experience

- [x] **Failure summary card** — banner at the top of `BuildDetailPage`
  showing failed step name + last 5 lines of failure logs + AI auto-fix
  suggestion summary if it ran — `872e658`
- [x] **Log search regex toggle** — current LogTable filter is substring;
  add a regex toggle and remember last query per build — `884e333`
- [x] **Timestamp-range filter** — slider over the build duration to scope
  log view to a window (handy for hour-long Unity builds) — `af12a84`
- [x] **Saved log filters** — named filter presets ("errors only",
  "Xcode warnings", "build commands") shared across builds — `94ca61f`
- [x] **"Copy as terminal command"** — every step that shells out should
  expose a "Copy command" button on its log entry to paste into a
  local terminal verbatim — `b974181`
- [x] **Live tail auto-scroll lock** — when the user scrolls up, stop
  auto-scrolling; floating "Jump to latest" button on the right — `ee4ba44`
- [x] **Step duration comparison** — on a finished build, show each step's
  duration alongside the previous successful build's duration with
  delta colored (+12% red, -8% green) — `00ca0ca`
- [x] **Log section grouping** — collapsible groups via existing CI
  conventions (`::group::name` / `--- name`), auto-detected in stdout — `a7ddef7`
- [x] **Inline ANSI color support** in LogTable — many shell tools emit
  color; LogTable currently strips — `4ac2c44`
- [x] **Build diff view** — pick two builds; show step-by-step duration
  diff + artifact size diff + first diverging log line — `4955ddf`

### Cluster 10.D · Metrics-led home dashboard

- [x] **Home dashboard** — replace the default `projects` landing with a
  metrics overview: running builds, last-24h success rate, recent
  failures, slowest pipelines, disk usage. Projects list moves to a
  tab / route — `d4f49d0`
- [x] **Per-pipeline metrics panel** — duration P50/P95 sparkline + step
  duration breakdown over last 30 builds (data already in DB) — `da7f723`
- [x] **Slowest-step leaderboard** per pipeline — top 5 longest-running
  steps with average duration — `da7f723`
- [x] **Disk usage page** — bytes consumed by `~/.buildpilot/artifacts/`
  broken down by pipeline, with a "prune older than N days" action
  that reuses existing `pruneOldBuilds` — `44a047a`
- [x] **Active builds widget** — sticky element (sidebar or header)
  showing in-flight builds with progress + cancel button, regardless
  of the current view — `ca49d02`

### Cluster 10.E · Small UX polish

- [x] **Empty-state CTAs** — Projects, Pipelines, Builds and Hosts pages
  show actionable empty states with a primary CTA + a "load sample
  pipeline" option for first-run users — `542b9b2`
- [x] **Toast-with-undo** for destructive actions — pipeline / project
  delete shows a 5s undo toast instead of relying solely on the confirm
  dialog — `88c88ad`
- [x] **Pipeline editor draft auto-save** — debounced save to
  `localStorage` so a tab close / accidental refresh doesn't lose work — `6d64489`
- [x] **Optimistic UI** for run / cancel — the button flips state
  immediately and rolls back on server error — `4170c8f`
- [x] **In-app changelog drawer** — surfaces newly-shipped features after
  each release (reads a server-shipped `CHANGELOG.md`) — `c24c8dd`
- [x] **Per-build copy-link button** — shareable deep link to a build /
  step that auto-opens the right view — `e0a15f7`
- [x] **Improved confirm dialog** — current dialog has Title + Body +
  Confirm; add a typed-confirmation input (`type "delete" to confirm`)
  for irreversible actions like project removal — `7354ed4`
- [x] **Sidebar resize + collapse** — current 18rem fixed; allow drag-to-
  resize or click-to-collapse to icon rail — `39979ae`
- [x] **Better date / time formatting** — relative ("3 min ago") with
  absolute on hover, consistent across all views (currently mixed) — `7ff514e`

### Cluster 10.F · Accessibility

- [ ] **Status indicators carry icon + color** — colorblind-safe; success
  ✓ green, failure ✗ red, running ⟳ amber, cancelled ⊘ slate
- [ ] **Focus rings on all interactive elements** — currently many
  buttons rely on hover state only
- [ ] **ARIA labels on icon-only buttons** — Trash2, Plus, Settings, etc.
  are unlabelled to a screen reader
- [ ] **Keyboard navigation in React Flow** — `Tab` to focus next node,
  `Enter` to open its properties
- [ ] **Reduced-motion mode** — respect `prefers-reduced-motion` for
  step-glow / pulse animations
- [ ] **Color contrast audit** — slate-400 on slate-950 fails WCAG AA in
  a few places; sweep with `@axe-core/react`

### Cluster 10.G · Mobile / small-screen experience

- [ ] **Responsive sidebar** — collapses into a drawer below `md:` (768px)
- [ ] **Mobile-optimized build detail page** — log table currently
  unusable below 640px (fixed column widths)
- [ ] **PWA install** — manifest + service worker (also needed for Web
  Push; tracked in `TODO.md` Phase 3)
- [ ] **Tap-friendly hit targets** — current Trash2 hover-delete buttons
  are 14px square; bump to 32px on touch devices

---

## 🟡 Phase 11 — Platform expansion (cross-cutting)

Items that span step library, UI, and engine. Most of these are already
listed somewhere in `TODO.md` — captured here together for prioritization
and so we can ship the *user-visible* slice of each (UI + setting page +
docs) in coordinated batches.

### Cluster 11.A · Auth, identity, audit

Cross-refs: `TODO.md` Phase 2.6.A.

- [ ] **Login screen + session cookie** — depends on RBAC work in 2.6.A;
  ships behind the same `auth.enabled` flag
- [ ] **User profile dropdown** in sidebar header — avatar, name, role,
  "sign out"
- [ ] **Audit log viewer page** — searchable table of `who / when / what`
  events with filters by user, action, resource
- [ ] **Per-user notification preferences** — desktop / push / telegram
  routing decided per-user, not server-wide
- [ ] **API token management UI** — create / revoke long-lived tokens
  scoped to a role for CI scripts

### Cluster 11.B · Secrets & file vault UI

Cross-refs: `TODO.md` Phase 2.6.A (file vault, secret references).

- [ ] **Secrets page** — list/create/rotate named secrets;
  `${{ secrets.NAME }}` autocomplete in step property fields
- [ ] **File vault page** — upload `.p12` / `.mobileprovision` / `.p8` /
  `GoogleService-Info.plist` once; reference by id in steps
- [ ] **"Where is this secret used?"** — back-reference panel listing
  every step / pipeline referencing a given secret
- [ ] **Bulk secret import / export** — encrypted JSON bundle for moving
  between machines or backing up alongside `master.key`

### Cluster 11.C · Build matrix UX

Cross-refs: `TODO.md` Phase 2.6.C.

- [ ] **Matrix editor panel** — declarative `matrix: { xcode: [15,16], scheme: [Free,Pro] }`
  side panel in the pipeline editor with preview of generated runs
- [ ] **Matrix run summary view** — collapsed N×M grid; each cell links
  to its build; "rerun failed cells only" action
- [ ] **Matrix-aware notifications** — single summary message per matrix
  instead of N×M individual notifies

### Cluster 11.D · Manual approval steps

Cross-refs: `TODO.md` Phase 2.6.C, 4.B.

- [ ] **Approval step type** — pauses the build; renders an in-app card
  on `BuildDetailPage` with custom input fields (release notes, version,
  destination group)
- [ ] **Approvals inbox** — a top-level view listing every pipeline
  currently waiting on the current user
- [ ] **Required-reviewer policy** — `N approvers, M of them with role X`
  + optional wait timer

### Cluster 11.E · PR / VCS feedback

Cross-refs: `TODO.md` Phase 2.6.B, 4.A.

- [ ] **Outbound check-run state POST** — green/red status on the PR so
  branch protection can require BuildPilot
- [ ] **PR comment-driven triggers** — `/run-ios`, `/run all` style; UI
  to configure allowed slash commands
- [ ] **PR summary card on BuildDetailPage** — head/base branch, PR
  title, linked issues fetched from the configured VCS provider
- [ ] **GitHub / GitLab OAuth app** for the above outbound side

### Cluster 11.F · Observability deep dive

Cross-refs: `TODO.md` Phase 9.

- [ ] **xcresult HTML viewer** linked from build detail
- [ ] **JUnit / xcresult per-test pass/fail tree** in dashboard
- [ ] **Coverage report rendering** + PR delta widget
- [ ] **Flaky test detection page** — `pass/fail` history per test across
  last N runs with quarantine flag
- [ ] **Build duration trend page** — per-pipeline P50/P95 sparkline +
  regression alert when P95 spikes 2× baseline

### Cluster 11.G · Schedules & triggers UX

Cross-refs: `TODO.md` Phase 4.A.

- [ ] **Visual cron builder** — convert `0 */4 * * *` etc. to friendly
  toggle form (every N hours, on day X, at time T) and back
- [ ] **Tag pattern preview** — paste `v*.*.*`, see which existing tags
  in the project would match
- [ ] **Path-filter preview** — paste glob, see which paths in the last
  N commits would have triggered

### Cluster 11.H · Multi-agent / fleet

Cross-refs: `TODO.md` Phase 4.D.

- [ ] **Hosts page redesign** — current `HostsDialog` is a modal; promote
  to a full page with capability badges, status (online/offline/last
  seen), inflight build count
- [ ] **Host load chart** — concurrent build count per host over time
- [ ] **Tag-based step routing UI** — `requires: [mac, xcode15]` on a
  step; dispatcher picks an eligible host

### Cluster 11.I · Notification channel expansion

Cross-refs: `TODO.md` Phase 3.

- [ ] **Slack slash commands** — `/build pipeline-name` parity with the
  existing Telegram bot
- [ ] **Discord slash commands** ditto
- [ ] **Per-step `notifyOn` policy** — `always | failure | recovered`;
  reduces "build green again" notification noise
- [ ] **Test the channel** button on each notify step — sends a sample
  payload from the property panel without running the whole pipeline

---

## 🟡 Phase 12 — Developer ergonomics

Quality-of-life for the people building BuildPilot itself.

- [ ] **Storybook** for the component library — Sidebar, StepNode,
  LogTable, Toast, all dialogs
- [ ] **Visual regression tests** — Playwright + Chromatic or Percy
- [ ] **Component-level unit tests** — currently only the server has
  vitest coverage
- [ ] **E2E happy-path test** — start server, add project, create
  pipeline, run a `shell` step, assert green status via SSE
- [ ] **Settings JSON schema + validation** — `~/.buildpilot/config.json`
  surfaces JSON-schema errors at startup instead of crashing
- [ ] **Dev seed script** — `pnpm seed` populates a fresh DB with three
  demo projects + pipelines for screenshotting and onboarding
- [ ] **Public component design tokens** — colors, spacings, type scale
  centralized in `tailwind.config.js` extension so dark/light + theme
  variants stay coherent

---

## 📋 Quick-win batch (recommended first slice)

The highest impact-per-effort items, grouped so we can ship them as one
"UX 1.0" milestone:

1. **Command palette + global keyboard shortcuts** (10.A)
2. **URL routing + breadcrumb header** (10.A)
3. **Pipeline editor minimap + undo/redo + auto-layout** (10.B)
4. **Failure summary card on BuildDetailPage** (10.C)
5. **Home dashboard with metrics** (10.D)
6. **Toast-with-undo + improved confirm dialog** (10.E)
7. **Status icons + focus rings + ARIA labels** (10.F)

Each is a few hundred lines of React, no backend changes. Together
they reshape every interaction in the app.

---

## 📈 Tracking

Move items to the top of their cluster with `[x]` and a commit sha when
they ship. Add new ideas under the most relevant cluster — split into a
new cluster only when at least three items are queued under the same
theme.

| Phase                              | Done | Pending | Status |
| ---------------------------------- | ---: | ------: | ------ |
| 10. UI/UX overhaul                 |   0  |   70    | ⏸ 0%   |
| 11. Platform expansion             |   0  |   30    | ⏸ 0%   |
| 12. Developer ergonomics           |   0  |    7    | ⏸ 0%   |
