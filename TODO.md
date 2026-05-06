# BuildPilot TODO

Living document of what's done and what's pending. Tasks move between
sections as they ship — keep a one-line description and link the commit
sha when the task lands so we have an audit trail without spelunking
git log.

---

## ✅ Phase 1 — MVP (single-host Unity / Windows)

Goal: a self-contained CI/CD daemon with a visual pipeline editor,
running locally on Windows for Unity dedicated-server builds.

- [x] Monorepo skeleton with pnpm workspaces — `3840827`
- [x] Server: Fastify + SQLite (`better-sqlite3`) + `simple-git` — `e8ae365`
- [x] Web: React 18 + Vite + Tailwind + React Flow + Zustand — `a693cbe`
- [x] `pnpm dev` launches server + web in parallel + opens browser — `b46dd22`
- [x] Project detail page with git graph + side-by-side pipelines — `413808f`
- [x] Multi-branch git graph + poller scheduling fix on pipeline create — `838462d`
- [x] Step types: `checkout`, `pull`, `shell`, `unityBatch`
- [x] Pipeline editor (drag from palette, click node to edit, save, run)
- [x] Build engine with topological execution + per-build SQLite log column
- [x] SSE event stream (`newCommit`, `buildStarted`, `buildLog`, `buildFinished`)

## ✅ Phase 1.5 — Dashboard overhaul (this session)

Goal: pro-grade run visibility, control, and AI-assisted recovery.

- [x] Bump dev ports to IANA dynamic range (49831/49832) + auto-migrate old config — `1d04201`
- [x] Fetch button alongside Pull (project detail + new-commit toast) — `1d04201`
- [x] Branch fields are project-aware comboboxes (no free-text typing) — `1d04201`
- [x] Native OS notifications on new commits — `1d04201`
- [x] Builds & Logs page + per-build detail page — `1d04201`
- [x] Logcat-style structured log entries + LogTable component — `1d04201`
- [x] Mini Gantt strip with status bars + clickable filters — `1d04201`
- [x] Build cancel (kill child processes + per-project FIFO queue) — `1d04201`
- [x] Restart-from-step: `POST /api/builds { fromNodeId? }` — `1d04201`
- [x] Notify steps: `httpRequest`, `slackNotify`, `discordNotify` — `1d04201`
- [x] StepPropertyPanel: Properties / Logs tabs + "Run from here" — `1d04201`
- [x] Step glow + per-step duration labels — `1d04201`
- [x] `aiPrompt` step (claude / codex / aider / gemini / custom CLI) — `424f30b`
- [x] AI auto-fix retry loop on step failure — `20dc1cf`
- [x] Conditional edge traversal (success / failure / always) — `85cb778`
- [x] Pipeline clone (deep copy with re-id) — `62354bc`
- [x] Parallel branch execution (DAG, MAX_CONCURRENCY=4) — `dc40854`
- [x] Build artifacts (collect step + download endpoint) — `ebecc66`
- [x] `gitMerge` step (compose with AI for conflict resolution) — `477ecea`
- [x] Pipeline delete UI (header trash + project-detail row trash) — `8981806`
- [x] Project + pipeline hover-delete in ProjectsPage cards and Sidebar — `6f93ac7`
- [x] User-defined node templates (save preset → palette entry, drag onto canvas) — `982d431`
- [x] Native `s3Upload` step (AWS SDK v3 multipart + presigned URL + manifest) — `38ee065`
- [x] Native `sftpUpload` step (ssh2 with key OR password auth, progress reporting) — `38ee065`
- [x] `remoteSsh` now supports password auth (ssh2 instead of ssh CLI) — `38ee065`

## ✅ Phase 2 — Cross-OS / iOS foundations

Goal: drive Mac builds from a Windows host so the same pipeline ships
both Linux dedicated-server and iOS / TestFlight artifacts.

- [x] `remoteSsh` step (BatchMode, identity file, optional skip-strict-host-key) — `bfda82e`
- [x] `xcodebuild` step (workspace/project, scheme, action, destination, archive) — `bfda82e`
- [x] README iOS pipeline pattern — `bfda82e`
- [x] `testflightUpload` step — `xcrun altool --upload-app` wrapper (apiKey OR appleId auth)
- [x] Mac agent QoL — `~/.buildpilot/hosts.json` + REST CRUD + Sidebar "SSH Hosts" dialog + host dropdown in remoteSsh / sftpUpload / Mac steps
- [x] `keychainUnlock` step — wraps `security set-keychain-settings` + `unlock-keychain`
- [x] `provisioningProfileInstall` step — drops a `.mobileprovision` into `~/Library/MobileDevice/Provisioning Profiles` (locally OR remote with SFTP-then-mv)

## 🟡 Phase 2.5 — iOS pipeline production-readiness

Goal: take the Phase 2 foundations from "demo-able" to "actually usable in
a real iOS release pipeline". Closes the broken `archive → ipa → upload`
hand-off, expands to macOS distribution, and adds the missing developer
quality-of-life pieces.

### Cluster A · iOS pipeline gap closures
- [x] `xcodebuild` step gets `exportArchive` action + `exportOptionsPlist` field
- [x] `xcodebuild` step accepts `hostId` (run on a saved Mac host without wrapping in remoteSsh)
- [ ] `testflightUpload` gets a `whatToTest` field (post-upload App Store Connect PATCH) — deferred to future cluster (needs JWT/ASC API integration)

### Cluster C · Host management quality of life
- [x] HostsDialog "Test connection" button (`POST /api/hosts/:id/ping`)
- [x] Per-host capability snapshot (`xcodebuild -version`, `sw_vers`, `uname -m`) shown as badges
- [ ] SSH `known_hosts` integration — re-evaluated as Phase 4 hardening (ssh2 is permissive by default; needs a real design discussion before changing)

### Cluster B · macOS distribution
- [x] `notarize` step — `xcrun notarytool submit … --wait`
- [x] `stapleNotarization` step — `xcrun stapler staple <bundle>`

### Cluster F · Apple Developer Portal automation
- [x] `fastlaneMatch` step — fetches certs/profiles via `fastlane match`

### Cluster D · iOS dependency steps
- [x] `cocoapodsInstall` step (`pod install` / `pod update`, `--repo-update`, `bundle exec`)
- [x] `swiftPackageResolve` step (`xcodebuild -resolvePackageDependencies`)

### Cluster E · Test + observability
- [ ] `dsymUpload` step (Crashlytics / Sentry / Bugsnag select + per-backend invocation)
- [ ] `xcodebuild test` post-process — parse `.xcresult` and emit "X/Y tests passed" log entry

### Test infrastructure
- [ ] Bootstrap vitest in the workspace + tests for existing `_ssh` / `_exec` helpers
- [ ] Each Phase 2.5 commit ships unit tests for the new step's argv assembly / pure logic

## ✅ Phase 3 — Notifications & integrations

- [x] Native browser Notification API on commits (suppressed when tab focused) — `1d04201`
- [x] Slack incoming webhook step — `1d04201`
- [x] Discord webhook step — `1d04201`
- [x] Telegram bot — `telegramNotify` step + interactive build approvals — `6c0567d`
- [ ] **PWA + iOS / Web Push** — service worker + `web-push`; closed-tab notifications + push-to-mobile
- [ ] **Email digest** — daily summary of build outcomes per pipeline

## ⏸ Phase 4 — Hardening

Not started. Pulled out as discrete deliverables for future sessions.

- [ ] **Auth** for LAN exposure — Basic auth or token; required when binding `host: 0.0.0.0`
- [ ] **Pipeline templates** — save a *group* of nodes as a reusable block (single-node templates already shipped, see Phase 1.5)
- [ ] **Pipeline versioning** — snapshot on save, diff between versions, rollback
- [ ] **Step inputs / outputs** — `${{checkout.sha}}` style interpolation, env var injection between steps
- [ ] **Webhook-driven polling** — receive GitHub/Gitea push webhooks instead of poll
- [ ] **Build retention** — opt-in delete of logs/artifacts older than N days
- [ ] **Cron-scheduled builds** — pipelines that fire on a cron, not just commit-driven
- [ ] **Search across logs** — full-text grep over historical logs (SQLite FTS5)
- [ ] **Per-project sparklines** — last-30-build status strip on the project detail page
- [ ] **Multi-agent fleet** — >2 remote builders with dispatch + capability tags

## 🪲 Known issues

- React Flow logs a "new nodeTypes object" warning on every render — cosmetic, no functional impact (the const is module-level; the warning is a false positive from StrictMode).
- Legacy builds (predating `build_log_entries`) show their flat `build.log` text as synthesized stdout entries — works but lacks per-step grouping. Will fade as old builds age out.

---

## 📈 Progress

| Phase                              | Done | Pending | Status |
| ---------------------------------- | ---: | ------: | ------ |
| 1. MVP                             |  10  |    0    | ✅ 100% |
| 1.5. Dashboard overhaul            |  25  |    0    | ✅ 100% |
| 2. Cross-OS / iOS                  |   6  |    0    | ✅ 100% |
| 3. Notifications & integrations    |   4  |    2    | 🟢  67% |
| 4. Hardening                       |   0  |   10    | ⏸    0% |
| **Overall**                        | **45** | **12** | **🟢 79%** |

**Next up (recommended order):**
1. **Auth** — gate LAN exposure before anything multi-user happens
2. **PWA + Web Push** — true closed-tab notifications, the last gap in the notification story
3. **Pipeline templates + versioning** — productivity multipliers once a few real pipelines exist
4. **Step inputs / outputs** — `${{checkout.sha}}` interpolation; touches every existing step
