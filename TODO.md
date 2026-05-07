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

## ✅ Phase 2.5 — iOS pipeline production-readiness

Goal: take the Phase 2 foundations from "demo-able" to "actually usable in
a real iOS release pipeline". Closes the broken `archive → ipa → upload`
hand-off, expands to macOS distribution, and adds the missing developer
quality-of-life pieces.

### Cluster A · iOS pipeline gap closures
- [x] `xcodebuild` step gets `exportArchive` action + `exportOptionsPlist` field
- [x] `xcodebuild` step accepts `hostId` (run on a saved Mac host without wrapping in remoteSsh)
- [ ] `testflightUpload` `whatToTest` field — moved to Phase 5 Cluster 5.B (groups with the rest of the ASC API work that needs ES256 JWT signing)

### Cluster C · Host management quality of life
- [x] HostsDialog "Test connection" button (`POST /api/hosts/:id/ping`)
- [x] Per-host capability snapshot (`xcodebuild -version`, `sw_vers`, `uname -m`) shown as badges
- [ ] SSH `known_hosts` integration — moved to Phase 4 Cluster 4.D (needs a TOFU vs prompt vs `~/.ssh/known_hosts` design call)

### Cluster B · macOS distribution
- [x] `notarize` step — `xcrun notarytool submit … --wait`
- [x] `stapleNotarization` step — `xcrun stapler staple <bundle>`

### Cluster F · Apple Developer Portal automation
- [x] `fastlaneMatch` step — fetches certs/profiles via `fastlane match`

### Cluster D · iOS dependency steps
- [x] `cocoapodsInstall` step (`pod install` / `pod update`, `--repo-update`, `bundle exec`)
- [x] `swiftPackageResolve` step (`xcodebuild -resolvePackageDependencies`)

### Cluster E · Test + observability
- [x] `dsymUpload` step (Crashlytics / Sentry / Bugsnag select + per-backend invocation)
- [x] `xcresultParse` step — runs `xcrun xcresulttool get test-results summary --format json` and emits a "X/Y tests passed" log entry; fails the step on any test failure unless toggled off

### Test infrastructure
- [x] Bootstrap vitest in the workspace + tests for existing `_ssh` / `_exec` helpers
- [x] Each Phase 2.5 commit ships unit tests for the new step's argv assembly / pure logic

## 🟡 Phase 2.6 — Production-grade platform foundation

Goal: take BuildPilot from "demo for one developer" to "adoptable by a 5+ person iOS team". The 10 features that show up in every other iOS CI/CD platform (Bitrise / Codemagic / Xcode Cloud / GitHub Actions / GitLab / CircleCI) but not BuildPilot. See the cross-platform research write-up for the evidence trail.

### Cluster 2.6.A · Security foundation
- [ ] **Encrypted secrets + file vault** — org / project / pipeline-scope KV with at-rest encryption + reference-by-ID (`${{ secrets.APPLE_ID }}` style); file binaries (`.p12`, `.mobileprovision`, `.p8`, `GoogleService-Info.plist`) uploaded once and referenced by id from any step
- [ ] **Multi-user auth + RBAC + audit log** — at minimum: local users with bcrypt passwords, owner / maintainer / member / viewer roles, append-only audit log of who triggered what

### Cluster 2.6.B · External integration
- [ ] **Webhook-driven triggers** — receive GitHub / GitLab / Gitea push + PR webhooks; replace the poller for repos that can push (poller stays as fallback)
- [ ] **PR / status check integration** — post check-run state back to the VCS so branch protection can require BuildPilot green; comment-driven re-run

### Cluster 2.6.C · Pipeline orchestration
- [ ] **Build matrix expansion** — declare a `matrix` block on a pipeline (`xcode: [15, 16] × scheme: [Free, Pro] × destination: [...]`) → N parallel runs without copy-paste
- [ ] **Manual approval / block step + form inputs** — a step type that pauses the run and waits for a human decision via the dashboard with custom input fields (release notes, version, …); supersedes Telegram-only approvals

### Cluster 2.6.D · iOS pipeline acceleration
- [ ] **Auto-provisioning via App Store Connect API** — single ASC API key replaces the `fastlaneMatch + keychainUnlock + provisioningProfileInstall` triple: BuildPilot creates / renews profiles, registers App IDs and devices automatically (Bitrise / Codemagic / Xcode Cloud all do this)
- [ ] **Auto build-number from ASC** — `latestTestflightBuildNumber` step + integration with `incrementBuildNumber` so every TestFlight upload gets a strictly monotonic CFBundleVersion (kills `ITMS-90189` failures)
- [ ] **Test retry modes on `xcodebuild` test action** — retry-on-failure / until-failure / max-repetitions (Xcode 13+); the #1 fix for flaky-UI-test pipeline reds
- [ ] **Remote Xcode build cache** — XCRemoteCache (Spotify) or the Apple compilation cache (Xcode 26+) integrated as a typed step + a server-side cache namespace; routinely cuts xcodebuild time 40–60%

## 🟢 Phase 3 — Notifications & integrations

- [x] Native browser Notification API on commits (suppressed when tab focused) — `1d04201`
- [x] Slack incoming webhook step — `1d04201`
- [x] Discord webhook step — `1d04201`
- [x] Telegram bot — `telegramNotify` step + interactive build approvals — `6c0567d`
- [ ] **PWA + iOS / Web Push** — service worker + `web-push`; closed-tab notifications + push-to-mobile
- [ ] **Email digest** — daily summary of build outcomes per pipeline
- [ ] **`emailNotify` step** — first-class transactional email step with templates + variables (separate from the per-pipeline daily digest above)
- [ ] **`teamsNotify` step** — Microsoft Teams incoming webhook (mirror Slack/Discord/Telegram surface)

## ⏸ Phase 4 — Workflow control & hardening

Advanced pipeline orchestration features that fall outside the Phase 2.6 top-10. Auth + secrets + webhook triggers moved to Phase 2.6 — what remains is the long tail of trigger / retention / scheduling / RBAC-extension items.

### Cluster 4.A · Triggers & scheduling (beyond Phase 2.6)
- [ ] **Tag-pattern triggers** — `v*.*.*` push starts a release pipeline against the tagged commit (Bitrise / Xcode Cloud / Travis pattern)
- [ ] **Cron-scheduled builds** — pipelines that fire on a cron expression, not just commit-driven; per-pipeline schedule list
- [ ] **API-trigger endpoint with parameters** — `POST /api/triggers/:token` that starts a build with arbitrary input variables (parameterised manual / external-system entry point)
- [ ] **Path-filtered triggers** — `if_changed` on globs so a pipeline skips when no relevant files changed (Buildkite / GH `paths` / GitLab `rules:changes`)
- [ ] **Cancel-previous-build on new push** — rolling-build mode; auto-abort superseded runs on the same branch (Bitrise / Codemagic)
- [ ] **PR-merge-state builds** — build the simulated post-merge tree, not just the PR head (Bitrise mode — catches "merges cleanly but breaks main")
- [ ] **PR comment-driven actions** — `/run-ios` style comments retrigger a pipeline (GH Actions `issue_comment`)

### Cluster 4.B · Workflow controls
- [ ] **Step-level soft fail / `continue-on-error`** — mark a step as non-blocking so the pipeline keeps going (GH `continue-on-error`, Buildkite `soft_fail`, GitLab `allow_failure`)
- [ ] **Build retries with backoff** — auto-retry transient step failures with exponential backoff; per-step retry policy
- [ ] **Step / build watchdog** — kill steps that produce no log output for N minutes (Bitrise pattern); detects hung xcodebuild / SSH sessions
- [ ] **Build priority + queue management** — priority ordering for releases; jump-the-queue flag
- [ ] **Required reviewers + wait timer on environments** — N approvers, optional time delay before deploy (extends the manual-approval step from Phase 2.6)
- [ ] **In-flight build SSH / live-tail** — connect into a still-running Mac host to debug a stuck step (Bitrise / Codemagic feature)

### Cluster 4.C · Pipeline composition (auth/secrets are in 2.6)
- [ ] **Pipeline group templates** — save a *group* of nodes as a reusable block (single-node templates already shipped)
- [ ] **Pipeline versioning** — snapshot on save, diff between versions, rollback
- [ ] **Step inputs / outputs** — `${{ checkout.sha }}` style interpolation, env var injection between steps
- [ ] **Pipeline-of-pipelines** — one pipeline triggers another with vars + optional fan-in / wait (GitLab parent-child + multi-project, Buildkite trigger step, GH `workflow_call`)
- [ ] **Reusable workflow / sub-pipeline call** — parameterised pipeline-fragment imports (composable building block beyond the group template)

### Cluster 4.D · Hosting & retention
- [ ] **Build retention** — opt-in delete of logs/artifacts older than N days
- [ ] **Search across logs** — full-text grep over historical logs (SQLite FTS5)
- [ ] **Per-project sparklines** — last-30-build status strip on the project detail page
- [ ] **Multi-agent fleet** — >2 remote builders with dispatch + capability tags (extends saved-hosts capability snapshot from Phase 2.5 Cluster C)
- [ ] **OIDC federation** — short-lived AWS / GCP / Vault tokens issued by BuildPilot in lieu of stored long-lived secrets
- [ ] **Static egress IP / VPN-during-build** — predictable IPs for firewall rules; VPN connection helper for private network access
- [ ] **SSH `known_hosts` integration** — TOFU-style host key persistence so non-`skipStrictHostKey` hosts don't error on first connect (deferred from Phase 2.5 Cluster C — needs a TOFU vs prompt vs ~/.ssh/known_hosts design call)

## 🟢 Phase 5 — fastlane action library

Wrap the canonical fastlane actions we don't yet cover. Each is a thin step that shells out, sharing the saved-host + execMaybeRemote plumbing already in place.

### Cluster 5.A · Build & test
- [ ] **`buildAppGym` step** — `gym` / `build_app`: archive + export + xcpretty consolidated in one step (replaces the typical `xcodebuild archive → xcodebuild exportArchive` chain)
- [ ] **Extend `xcodebuild` test action with xcpretty** — `scan`-style formatted output + Slack-summary toggle

### Cluster 5.B · App Store Connect API (still pending — needs ES256 JWT signer)
- [ ] **`testflightUpload` `whatToTest` field** (deferred from 2.5 Cluster A) — post-upload App Store Connect PATCH to set "What to Test" notes; needs ES256 JWT signing of the .p8
- [ ] **`testflightManage` step** — `pilot`-style: tester invite/remove, group assignment, changelog set
- [ ] **`appStoreUpload` step** — `deliver`-style: metadata + screenshots + binary + submit-for-review via iTMSTransporter + Spaceship
- [ ] **`appStorePrecheck` step** — App Store metadata pre-validation lint (swear words, broken URLs, copyright, future-feature mentions)
- [ ] **`appStoreCreate` step** — `produce`-style: bootstrap a new app on ASC + Dev Portal
- [ ] **`appStoreConnectApi` generic step** — sub-action enum (build poll, beta tester CRUD, version create, IAP CRUD, phased rollout, customer reviews fetch)
- [ ] **`testflightPublicLink` step** — generate / fetch public TestFlight beta link via ASC API

### Cluster 5.C · Code signing & devices
- [ ] **`pushCertificate` step** — `pem`-style: generate / refresh APNs production / dev / website push certs (.pem / .cer / .p12) within the 30-day expiry window
- [ ] **Extend `provisioningProfileInstall` for create / renew / repair** — `sigh`-style; today we only install
- [ ] **`certManage` step** — `cert`-style: signing cert CRUD (mostly a backstop when not using match)
- [x] **`resign` step** — re-codesign an existing IPA with a different identity / profile (enterprise repackaging) — `63d4454` + `be72be3` security fix
- [ ] **`registerDevices` step** — add device UDIDs to the dev portal so ad-hoc / dev profiles include them

### Cluster 5.D · Versioning & release notes
- [x] **`incrementBuildNumber` step** — `agvtool` / `PlistBuddy` wrapper — `b7f9aaf`
- [x] **`getBuildNumber` step** — read-only twin emitting the value as a structured `success` log line — `b7f9aaf`
- [x] **`changelogFromGitCommits` step** — git-log → release-note text with `--max-count` cap — `9180cad`
- [x] **`updateInfoPlist` step** — Set / Add / Delete via PlistBuddy — `9180cad`
- [x] **`xcodeSelect` step** — `xcode-select -s` — `c83eca7`
- [x] **`ensureGitStatusClean` step** — `git status --porcelain | head -n 100` pre-flight gate — `c83eca7`

### Cluster 5.E · Linting & coverage
- [x] **`swiftlint` step** — `swiftlint lint` / `--fix` / `analyze` with junit / xcode reporters — `158ac52`
- [x] **`swiftFormat` step** — `swift-format lint` / `format -i` — `158ac52`
- [x] **`xcodebuildAnalyze` step** — Apple Clang static analyzer with shellQuote'd configuration — `bddc95a` + `be72be3` security fix
- [x] **`slatherCoverage` step** — `.xcresult` → Cobertura / HTML / Sonar / JSON coverage reports — `ac0c747`
- [x] **`xcovGate` step** — coverage threshold gate (fail if below %) — `ac0c747`
- [x] **`peripheryScan` step** — dead-code detection — `bddc95a`

### Cluster 5.F · Screenshots
- [x] **`snapshot` step** — `fastlane snapshot` localized screenshots across N simulators — `e3b213e`
- [x] **`frameit` step** — frame raw screenshots with downloaded device chrome — `e3b213e`

### Phase 5 supporting work
- [x] **`_args.ts` shared helpers** — `splitAdditionalArgs`, `splitMultilinePaths`, `pushWorkspaceOrProject` — `9b6fe3f` (extracted via simplify skill)
- [x] **`_plist.ts` shared helpers** — `buildPlistBuddyCommand`, `CFBUNDLE_VERSION_KEY` — `5f77cc9` (extracted via simplify skill)
- [x] **Security fix** — `xcodebuildAnalyze` configuration command injection (HIGH) — `be72be3`

## ⏸ Phase 6 — Apple specialty CLIs

iOS-specific tooling beyond fastlane that nearly every release pipeline ends up shelling out to.

### Cluster 6.A · Simulator management (`xcrun simctl`)
- [ ] **`simctlPrepare` step** — boot / shutdown / erase / create simulators; deterministic test sims
- [ ] **`simctlInstallLaunch` step** — `simctl install` + `launch` + `terminate`
- [ ] **`simctlScreenshot` / `simctlRecordVideo` step** — UI capture for artifact upload
- [ ] **`simctlPushNotification` step** — `simctl push` payload injection for testing remote-notification flows
- [ ] **`simctlStatusBarOverride` step** — clean status bar (9:41 time, full battery) for App Store screenshots
- [ ] **`simctlPrivacyGrant` step** — preseed photos / camera / location permissions before tests

### Cluster 6.B · Code signing helpers (advanced)
- [ ] **`securityKeychainImport` step** with `set-key-partition-list` — fixes the #1 cause of CI codesign UI prompts (extends the existing `keychainUnlock`)
- [ ] **`codesignArbitrary` step** — re-sign individual extensions / dynamic libs with custom entitlements
- [ ] **`dsymVerify` step** — `dwarfdump --uuid` UUID match check between binary and dSYM; gate before upload

### Cluster 6.C · Privacy & compliance
- [ ] **`privacyManifestValidate` step** — required-reason API lint over `PrivacyInfo.xcprivacy`; mandatory App Store gate since 1 May 2024
- [ ] **`privacyManifestAggregate` step** — merge dependency-side privacy manifests into the app's manifest

### Cluster 6.D · Performance & size
- [ ] **`appThinningReportParse` step** — parse `App Thinning Size Report.txt` and gate on size delta vs previous build
- [ ] **`linkMapAnalyze` step** — per-module byte attribution from the linker map (Caliper / EmergeTools-style)
- [ ] **`bitcodeStrip` step** — `xcrun bitcode_strip`

### Cluster 6.E · Distribution
- [ ] **`otaManifestGenerate` step** — write the `itms-services://` install plist for ad-hoc / enterprise OTA; chains into existing `s3Upload` / `sftpUpload`
- [ ] **`firebaseAppDistribution` step** — beta tester groups + release notes (fills the App-Center-replacement slot)
- [ ] **`distributionGroups`** — internal beta workflow with click-to-register UDID flow + auto profile rebuild (App Center pattern)
- [ ] **`phasedRollout` step** — gradual % rollout configured at App Store submission (Codemagic feature)
- [ ] **`branchTargetedTestFlight` step** — auto-route a build to the tester group matching its branch name (Xcode Cloud feature)

### Cluster 6.F · StoreKit
- [ ] **`storekitConfigure` step** — set `.storekit` configuration for IAP testing in `xcodebuild test`

## ⏸ Phase 7 — Cloud device labs & crash reporter extensions

Real-device testing and richer dSYM upload coverage.

### Cluster 7.A · Cloud device labs
- [ ] **`cloudDeviceTest` step** — single step with `provider` enum routing to:
  - Firebase Test Lab iOS (`gcloud firebase test ios run`)
  - AWS Device Farm (`aws devicefarm create-upload` + `schedule-run`)
  - Sauce Labs Real Device Cloud (`POST /v1/storage/upload`)
  - BrowserStack App Live / App Automate (`POST /app-automate/upload`)

### Cluster 7.B · Crash reporter extensions
- [ ] **Extend `dsymUpload` with `provider=datadog`** — `@datadog/datadog-ci dsyms upload`
- [ ] **Extend `dsymUpload` with `provider=instabug`** — `Instabug_dsym_upload.sh`
- [ ] **Extend `dsymUpload` with `provider=embrace`** — `embrace_symbol_upload.darwin`
- [ ] **Extend `dsymUpload` with `provider=newrelic`** — `newrelic-ios-symbol-upload`

### Cluster 7.C · Cross-platform mobile extras
- [ ] **`codePush` step** — OTA RN bundle deployment (App Center alumni; open-sourced)

## ⏸ Phase 8 — Caching infrastructure

Beyond the Phase 2.6 "remote Xcode build cache" foundation: layered caching across the iOS toolchain, the single biggest dev-experience win remaining once 2.6 lands.

- [ ] **Generic `cache` step** — content-hash key + restore-keys with prefix fallback (mirrors GH Actions `actions/cache` semantics); the primitive every other cache item builds on
- [ ] **Per-language cache adapters** — DerivedData, SPM (`~/Library/Developer/Xcode/DerivedData/.../SourcePackages`), CocoaPods (`Pods/`), Carthage (`Carthage/Build`), Ruby gems (`vendor/bundle`)
- [ ] **`tuistCache` step** — compile modules ahead-of-time, swap as `.xcframework`s
- [ ] **`carthageRomeCache` step** — prebuilt-framework cache backed by S3 / GCS
- [ ] **Apple compilation cache (Xcode 26+) integration** — `COMPILATION_CACHE_*` settings + LaunchAgent helper

## ⏸ Phase 9 — Observability & test reporting

Turning the structured data BuildPilot already collects into actionable signal.

### Cluster 9.A · Test reporting
- [ ] **xcresult HTML report renderer** — pretty per-test view of `.xcresult` linked from the build detail page
- [ ] **JUnit / xcresult UI rendering** — per-test pass/fail in the dashboard with deep-link to source line on failure
- [ ] **Test sharding** — fan a single `xcodebuild test` invocation across multiple simulators / hosts
- [ ] **Flaky-test detection dashboard** — track which tests pass/fail intermittently across N runs; quarantine flag

### Cluster 9.B · Build analytics
- [ ] **Build duration trends** — per-pipeline P50 / P95 over time; slowest-build leaderboard
- [ ] **Success rate trends** — green / red / cancelled rates per pipeline
- [ ] **Code coverage report rendering** — per-PR coverage % widget, trend graph
- [ ] **Git PR-cycle / merge-frequency analytics** — DORA-ish metrics next to CI metrics (Bitrise Git Insights)

### Cluster 9.C · Live build UX
- [ ] **Inline build annotations on PRs** — surface compiler / SwiftLint / xcresult errors as inline file:line PR comments
- [ ] **Group / section folding in logs** — collapsible log groups (`::group::` / `--- ` markers from existing CIs supported)
- [ ] **User-crash feedback loop** — pull TestFlight crashes back into the build dashboard via ASC API

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
| 2.5. iOS production-readiness      |  11  |    2    | 🟢  85% (testflight whatToTest moved to Phase 5; ssh known_hosts moved to Phase 4) |
| 2.6. Production-grade platform     |   0  |   10    | 🟡   0% (top-10 critical from cross-platform research) |
| 3. Notifications & integrations    |   4  |    4    | 🟢  50% |
| 4. Workflow control & hardening    |   0  |   25    | ⏸    0% |
| 5. fastlane action library         |  18  |   13    | 🟢  58% (Cluster 5.D / 5.E / 5.F + resign done; ASC-API cluster 5.B still pending JWT signer) |
| 6. Apple specialty CLIs            |   0  |   20    | ⏸    0% |
| 7. Cloud device labs + crash ext.  |   0  |    6    | ⏸    0% |
| 8. Caching infrastructure          |   0  |    5    | ⏸    0% |
| 9. Observability & test reporting  |   0  |   11    | ⏸    0% |
| **Overall**                        | **74** | **96**  | **🟢 44%** |

**Next up (recommended order):**
1. **Phase 2.6 Cluster A — Security foundation** (encrypted secrets vault + file storage + multi-user auth) is the single biggest blocker; nothing in 2.6.B-D can ship credibly until this lands. Phase 5's plaintext-credential warnings on resign / fastlane / etc. all get resolved by this.
2. **Phase 2.6 Cluster B — Webhook triggers + PR status checks** so iOS team adoption stops being blocked on "we have to use polling and there's no PR check".
3. **Phase 5 Cluster 5.B (ASC API)** — the JWT-signer + spaceship plumbing this requires also unlocks Phase 2.6 Cluster D auto-provisioning and the deferred testflight `whatToTest` field.
4. **Phase 2.6 Cluster C — Build matrix + manual approval** to round out the platform story.
5. **Phase 8 — Caching** unlocks the largest single CI-time win once 2.6's remote-cache foundation is in place.
6. **Phase 5 Cluster 5.A — `buildAppGym`** — consolidated archive+export+xcpretty step (replaces the typical xcodebuild archive → xcodebuild exportArchive chain).
