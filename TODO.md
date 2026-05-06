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

## ✅ Phase 2 — Cross-OS / iOS foundations

Goal: drive Mac builds from a Windows host so the same pipeline ships
both Linux dedicated-server and iOS / TestFlight artifacts.

- [x] `remoteSsh` step (BatchMode, identity file, optional skip-strict-host-key) — `bfda82e`
- [x] `xcodebuild` step (workspace/project, scheme, action, destination, archive) — `bfda82e`
- [x] README iOS pipeline pattern — `bfda82e`
- [ ] **TestFlight upload step** — `xcrun altool` wrapper or App Store Connect API client
- [ ] **Mac agent quality-of-life** — host config in `~/.buildpilot/hosts.json`, host dropdown in `remoteSsh`
- [ ] **Code signing helpers** — keychain unlock step, provisioning profile install step

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
- [ ] **Pipeline templates** — save a node group as a reusable block, drop into other pipelines
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
| 1.5. Dashboard overhaul            |  19  |    0    | ✅ 100% |
| 2. Cross-OS / iOS                  |   3  |    3    | 🟡  50% |
| 3. Notifications & integrations    |   4  |    2    | 🟢  67% |
| 4. Hardening                       |   0  |   10    | ⏸    0% |
| **Overall**                        | **36** | **15** | **🟢 71%** |

**Next up (recommended order):**
1. **TestFlight upload step** — closes Phase 2 for the iOS path
2. **Auth** — gate LAN exposure before anything multi-user happens
3. **PWA + Web Push** — true closed-tab notifications, the last gap in the notification story
4. **Pipeline templates + versioning** — productivity multipliers once a few real pipelines exist
