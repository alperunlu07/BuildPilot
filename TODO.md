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

## ✅ Phase 1.6 — Engine + UX polish (cee40ac)

Goal: harden the runtime + UX after Phase 5 + Phase 2.5 step explosion. Engine
correctness fixes, palette / log scaling, and dev-server reliability.

- [x] Failure-aggregator nodes — joins where every incoming edge is `failure` now fire under OR semantics (single shared `notify-on-fail` node behind a chain A→B→C used to never run because skipped parents blocked the AND join) — `cee40ac`
- [x] Palette grouping — 11 collapsible categories (Git, Build, Notifications, Upload, Remote, iOS Build/Signing/Versioning/Quality/Screenshots, Android) with search box; load-time guard throws if a step type is missing from any group — `cee40ac`
- [x] Log virtualization — react-window FixedSizeList in LogTable; stdout default-hidden behind a shared LevelToggleBar (BuildLogPanel, BuildDetailPage, StepPropertyPanel) — `cee40ac`
- [x] Vite dev server pinned to `127.0.0.1` — Vite 6 was binding `::1` only and breaking `http://localhost:49832` on Windows — `cee40ac`
- [x] `BUILDPILOT_BUILD=1` env var injected into unityBatch — lets project-side post-build hooks (e.g. `agent.bat` that runs a legacy uploader via `cmd /k`) short-circuit when running under BuildPilot — `cee40ac`

## ✅ Phase 1.5 — Dashboard overhaul

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
- [x] **Encrypted secrets at rest** — field-level AES-256-GCM with master key at `~/.buildpilot/master.key` (POSIX 0600). Sensitive fields in pipeline node data, `hosts.json`, `node_templates` and the telegram bot token in `config.json` wrapped as `enc:1:<base64>`. Startup migration rewrites any plaintext value idempotently — `cee40ac`
- [ ] **File vault** — file binaries (`.p12`, `.mobileprovision`, `.p8`, `GoogleService-Info.plist`) uploaded once and referenced by id from any step
- [ ] **Reference-by-ID interpolation** — `${{ secrets.APPLE_ID }}` style interpolation across step data + `${{ files.signing_p12 }}` for vault file references
- [ ] **Multi-user auth + RBAC + audit log** — at minimum: local users with bcrypt passwords, owner / maintainer / member / viewer roles, append-only audit log of who triggered what

### Cluster 2.6.B · External integration
- [x] **Webhook-driven triggers** — receive GitHub / GitLab / Gitea push + PR webhooks (HMAC-SHA256 / X-Gitlab-Token verification, per-pipeline secret via `BUILDPILOT_WEBHOOK_SECRET_<id>` env var until secret-vault columns land); poller stays as fallback for repos that can't push — `00b2137`
- [ ] **PR / status check integration** — post check-run state back to the VCS so branch protection can require BuildPilot green; comment-driven re-run (webhook receiver in `00b2137` covers the inbound half; outbound check-run POST is still pending)

### Cluster 2.6.C · Pipeline orchestration
- [ ] **Build matrix expansion** — declare a `matrix` block on a pipeline (`xcode: [15, 16] × scheme: [Free, Pro] × destination: [...]`) → N parallel runs without copy-paste
- [ ] **Manual approval / block step + form inputs** — a step type that pauses the run and waits for a human decision via the dashboard with custom input fields (release notes, version, …); supersedes Telegram-only approvals

### Cluster 2.6.D · iOS pipeline acceleration
- [ ] **Auto-provisioning via App Store Connect API** — single ASC API key replaces the `fastlaneMatch + keychainUnlock + provisioningProfileInstall` triple: BuildPilot creates / renews profiles, registers App IDs and devices automatically (Bitrise / Codemagic / Xcode Cloud all do this)
- [ ] **Auto build-number from ASC** — `latestTestflightBuildNumber` step + integration with `incrementBuildNumber` so every TestFlight upload gets a strictly monotonic CFBundleVersion (kills `ITMS-90189` failures)
- [ ] **Test retry modes on `xcodebuild` test action** — retry-on-failure / until-failure / max-repetitions (Xcode 13+); the #1 fix for flaky-UI-test pipeline reds
- [ ] **Remote Xcode build cache** — XCRemoteCache (Spotify) or the Apple compilation cache (Xcode 26+) integrated as a typed step + a server-side cache namespace; routinely cuts xcodebuild time 40–60%

## ✅ Phase 2.7 — Android pipeline foundations (cee40ac)

Goal: parity with iOS for the most common Android release path — Gradle build → ADB install → smoke test → Play Console upload (Play upload deferred to a future phase).

- [x] `gradleBuild` step — runs `./gradlew assemble<Variant>` (apk) / `bundle<Variant>` (aab) / custom task; auto-discovers artifact in `app/build/outputs` and registers it as a build artifact — `cee40ac`
- [x] `adbConnect` step — `adb connect <ip:port>` for Wi-Fi-debugging-paired devices — `cee40ac`
- [x] `adbInstall` step — `adb install -r <apk>` with serial / replace / allowDowngrade / allowTest toggles — `cee40ac`
- [x] `adbShellLaunch` step — `adb shell am start -n <pkg>/<activity>` with `-W` wait toggle — `cee40ac`
- [x] `adbLogcat` step — bounded-duration logcat capture written to a file + registered as a build artifact — `cee40ac`

### Phase 2.7 future work (deferred to a later Android phase)
- [ ] **`bundletool` step** — convert `.aab` → installable APKs (replaces the limitation that `adbInstall` can't take an .aab directly)
- [ ] **`playConsoleUpload` step** — Google Play Developer API: upload .aab/.apk to internal/alpha/beta/production track via service-account JWT
- [ ] **`adbPair` step** — Android 11+ wireless pairing flow (`adb pair <host:port>` with the 6-digit code)
- [ ] **`androidSign` step** — apksigner/jarsigner wrap for signing standalone APKs
- [ ] **`firebaseAppDistributionAndroid`** — Android variant of Phase 6.E firebaseAppDistribution

## 🟢 Phase 3 — Notifications & integrations

- [x] Native browser Notification API on commits (suppressed when tab focused) — `1d04201`
- [x] Slack incoming webhook step — `1d04201`
- [x] Discord webhook step — `1d04201`
- [x] Telegram bot — `telegramNotify` step + interactive build approvals — `6c0567d`
- [x] Telegram bot text commands — `/help`, `/list`, `/build [name]` gated to `defaultChatId` (unauthorized chats silently ignored, inbound text logged so users can discover their chat id) — `cee40ac`
- [ ] **PWA + iOS / Web Push** — service worker + `web-push`; closed-tab notifications + push-to-mobile
- [ ] **Email digest** — daily summary of build outcomes per pipeline (waits on cron infra from Phase 4)
- [x] **`emailNotify` step** — SMTP via nodemailer (dynamic-import optional dep); `from`/`to`/`cc`/`bcc`, `bodyText`/`bodyHtml`, STARTTLS-vs-TLS auto-detect — `d27523c`
- [x] **`teamsNotify` step** — Teams incoming webhook with simple / messageCard / raw Adaptive-Card formats — `d27523c`

## ⏸ Phase 4 — Workflow control & hardening

Advanced pipeline orchestration features that fall outside the Phase 2.6 top-10. Auth + secrets + webhook triggers moved to Phase 2.6 — what remains is the long tail of trigger / retention / scheduling / RBAC-extension items.

### Cluster 4.A · Triggers & scheduling (beyond Phase 2.6)
- [ ] **Tag-pattern triggers** — `v*.*.*` push starts a release pipeline against the tagged commit (Bitrise / Xcode Cloud / Travis pattern)
- [ ] **Cron-scheduled builds** — pipelines that fire on a cron expression, not just commit-driven; per-pipeline schedule list
- [x] **API-trigger endpoint with parameters** — `POST /api/triggers/:pipelineId` accepts `{triggerSha?, triggerBranch?, variables?}`; per-pipeline token via env var until secret-vault columns land — `00b2137`
- [ ] **Path-filtered triggers** — `if_changed` on globs so a pipeline skips when no relevant files changed (Buildkite / GH `paths` / GitLab `rules:changes`)
- [ ] **Cancel-previous-build on new push** — rolling-build mode; auto-abort superseded runs on the same branch (Bitrise / Codemagic)
- [ ] **PR-merge-state builds** — build the simulated post-merge tree, not just the PR head (Bitrise mode — catches "merges cleanly but breaks main")
- [ ] **PR comment-driven actions** — `/run-ios` style comments retrigger a pipeline (GH Actions `issue_comment`)

### Cluster 4.B · Workflow controls
- [x] **Step-level soft fail / `continue-on-error`** — `continueOnError` flag on any step's data; the failure is logged at failure-level but downstream success-edges still fire and the build doesn't go red. Surfaced in the StepPropertyPanel "Step controls" section — `00b2137`
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
- [x] **`buildAppGym` step** — `fastlane gym` archive + export + xcpretty in one shot (replaces the typical `xcodebuild archive → xcodebuild exportArchive` chain) — `d27523c`
- [ ] **Extend `xcodebuild` test action with xcpretty** — `scan`-style formatted output + Slack-summary toggle (postponed; bundles with the test-retry-modes work in Phase 2.6.D)

### Cluster 5.B · App Store Connect API (ES256 JWT signer landed in `d27523c`)
- [x] **`_asc.ts` shared helpers** — ES256 JWT signer (Node `createPrivateKey` + `dsaEncoding:'ieee-p1363'` for raw r||s output) + `ascRequest()` + `ascErrorMessage()`. Tested with a generated P-256 key + signature roundtrip — `d27523c`
- [x] **`testflightSetWhatToTest` step** (split out from testflightUpload — needs build-processing wait) — PATCH/POST betaBuildLocalization with whatsNew text; resolves buildId by `appBundleId + version + buildNumber` lookup or accepts it directly — `d27523c`
- [x] **`testflightManage` step** — invite / remove / list testers + add/remove from BetaGroups via ASC API — `d27523c`
- [x] **`appStoreUpload` step** — `fastlane deliver` wrapper (metadata + ipa + screenshots + submit-for-review) — `d27523c`
- [x] **`appStorePrecheck` step** — `fastlane precheck` metadata lint — `d27523c`
- [x] **`appStoreCreate` step** — POST /v1/apps (+ POST /v1/bundleIds when `registerBundleId=true`) — `d27523c`
- [x] **`appStoreConnectApi` generic step** — raw method/path/queryJson/bodyJson catch-all for the ASC long tail — `d27523c`
- [x] **`testflightPublicLink` step** — find/create public-enabled BetaGroup + attach build + read `publicLink` — `d27523c`

### Cluster 5.C · Code signing & devices
- [x] **`pushCertificate` step** — `fastlane pem` APNs prod/dev cert renewal + .p12 export with `activeDaysLimit` for cron-friendly auto-renewal — `d27523c`
- [x] **`sigh` step** — `fastlane sigh` profile download / renew / repair / manage (complements `provisioningProfileInstall` which only drops a pre-existing .mobileprovision into place) — `d27523c`
- [x] **`certManage` step** — `fastlane cert` signing cert CRUD (mostly a backstop when not using match) — `d27523c`
- [x] **`resign` step** — re-codesign an existing IPA with a different identity / profile (enterprise repackaging) — `63d4454` + `be72be3` security fix
- [x] **`registerDevices` step** — POST /v1/devices for ad-hoc / dev profile UDIDs; multiline parser supports `Name=UDID` form + comments — `d27523c`

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

## ✅ Phase 6 — Apple specialty CLIs (`5931477`)

iOS-specific tooling beyond fastlane that nearly every release pipeline ends up shelling out to.

### Cluster 6.A · Simulator management (`xcrun simctl`)
- [x] **`simctlPrepare` step** — boot / shutdown / erase / create / shutdownAll / eraseAll simulators — `5931477`
- [x] **`simctlInstallLaunch` step** — install + launch (+ terminate / uninstall / installAndLaunch chain) — `5931477`
- [x] **`simctlScreenshot` / `simctlRecordVideo` step** — `xcrun simctl io … screenshot|recordVideo` — `5931477`
- [x] **`simctlPushNotification` step** — APNs payload via inline JSON (dropped to temp .apns + cleaned up) or payload path — `5931477`
- [x] **`simctlStatusBarOverride` step** — pin time=9:41 + battery=100% + signal/operator for App Store screenshots — `5931477`
- [x] **`simctlPrivacyGrant` step** — grant / revoke / reset photos / camera / location etc. — `5931477`

### Cluster 6.B · Code signing helpers (advanced)
- [x] **`securityKeychainImport` step** with `set-key-partition-list` — fixes the codesign UI prompt that breaks CI codesign — `5931477`
- [x] **`codesignArbitrary` step** — codesign with custom identity + entitlements + `--force` / `--preserve-metadata` / `--timestamp` etc. — `5931477`
- [x] **`dsymVerify` step** — `dwarfdump --uuid` binary vs dSYM mismatch gate (parses output; throws when binary UUIDs aren't all in dSYM) — `5931477`

### Cluster 6.C · Privacy & compliance
- [x] **`privacyManifestValidate` step** — `plutil -lint` PrivacyInfo.xcprivacy + cross-check declared categories against required-reason API symbol references — `5931477`
- [x] **`privacyManifestAggregate` step** — find PrivacyInfo.xcprivacy files in deps + plist-merge into one app-level manifest — `5931477`

### Cluster 6.D · Performance & size
- [x] **`appThinningReportParse` step** — parse "App Thinning Size Report.txt" + diff vs baseline; gate on max app-growth-% — `5931477`
- [x] **`linkMapAnalyze` step** — per-module byte attribution from Mach-O link map (Caliper / EmergeTools-style top-N) — `5931477`
- [x] **`bitcodeStrip` step** — `xcrun bitcode_strip -r/-l/-m` — `5931477`

### Cluster 6.E · Distribution
- [x] **`otaManifestGenerate` step** — write itms-services:// install plist for ad-hoc / enterprise OTA + log install link — `5931477`
- [x] **`firebaseAppDistribution` step** — `firebase appdistribution:distribute` (iOS .ipa or Android .apk/.aab) — `5931477`
- [x] **`distributionGroups` step** — reconcile TestFlight BetaGroups against a desired tester roster spec (App Center pattern) with dry-run + remove-strangers — `5931477`
- [x] **`phasedRollout` step** — start / pause / resume / complete App Store phased release via ASC API — `5931477`
- [x] **`branchTargetedTestFlight` step** — auto-route a build to BetaGroup matching its branch name (Xcode Cloud feature); supports literal + glob + /regex/ patterns — `5931477`

### Cluster 6.F · StoreKit
- [x] **`storekitConfigure` step** — validate .storekit config exists; logs the STOREKIT_CONFIGURATION env var hint for downstream xcodebuild test — `5931477`

## ⏸ Phase 6.5 — Steam (Steamworks SDK) PC distribution

Goal: ship Windows / Linux / macOS PC builds to Steam — `steamcmd` install →
app_build VDF → upload → branch promotion → Workshop. Pairs with Unity's
`StandaloneWindows64` / `StandaloneLinux64` / `StandaloneOSX` targets in
`unityBatch` and the Steamworks Partner pipeline most game studios already use.

### Cluster 6.5.A · Build & upload
- [x] **`steamcmdSetup` step** — bootstrap `steamcmd` cross-platform (PowerShell on Windows, curl|tar on Linux/macOS); optional Steam Guard sentry/ssfn cache sideloading via base64 fields — `5931477`
- [x] **`steamUpload` step** — `steamcmd +run_app_build` with inline VDF (auto-generated from form fields: appId + contentRoot + multiline depots) OR a user-provided VDF path; cleans up generated temp VDF on exit — `5931477`
- [x] **`steamBuildVdfGenerate`** — folded into `steamUpload`; the multiline `depots` field on `steamUpload` triggers VDF generation via the `_steam.ts` helpers when no `vdfPath` is supplied — `5931477`

### Cluster 6.5.B · Branch promotion & workshop
- [x] **`steamSetLive` step** — Steamworks Web API `ISteamApps/SetAppBuildLive` promotion; URL-encoded form-POST with `key=<publisher>` — `5931477`
- [x] **`steamWorkshopUpload` step** — `steamcmd +workshop_build_item` with generated workshop VDF (publishedfileid="0" creates new) — `5931477`

### Phase 6.5 supporting work
- [x] `_steam.ts` shared helpers — typed AppBuild VDF generator (handles backslash + quote escaping), Workshop VDF generator, Steamworks Web API SetAppBuildLive client, steamcmd argv builder — `5931477`
- [x] Add `steam` group to STEP_CATEGORIES in `step-registry` — `5931477`
- [x] Add `steamPassword`, `steamWebApiKey`, `steamGuardCode` to `SENSITIVE_FIELDS` in `secrets.ts` so credentials are encrypted at rest — `d27523c`

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
| 1.6. Engine + UX polish            |   5  |    0    | ✅ 100% |
| 2. Cross-OS / iOS                  |   6  |    0    | ✅ 100% |
| 2.5. iOS production-readiness      |  11  |    2    | 🟢  85% (testflight whatToTest moved + done in Phase 5; ssh known_hosts moved to Phase 4) |
| 2.6. Production-grade platform     |   2  |   11    | 🟡  15% (encrypted-secrets-at-rest + webhook-driven triggers done; file vault + RBAC + matrix + manual approval + ASC auto-prov + remote Xcode cache pending) |
| 2.7. Android pipeline foundations  |   5  |    5    | 🟢  50% (gradleBuild + adb cluster done; bundletool / Play Console / pair / sign deferred) |
| 3. Notifications & integrations    |   7  |    2    | 🟢  78% (PWA push + email digest deferred — both depend on cron infra) |
| 4. Workflow control & hardening    |   2  |   23    | 🟡   8% (continueOnError + API trigger endpoint done; cron / tag / path-filter / matrix / versioning / retention pending) |
| 5. fastlane action library         |  30  |    1    | 🟢  97% (only `xcodebuild test` xcpretty-toggle remains — bundles with the test-retry-modes work in Phase 2.6.D) |
| 6. Apple specialty CLIs            |  20  |    0    | ✅ 100% |
| 6.5. Steam (PC distribution)       |   7  |    1    | 🟢  88% (steamBuildVdfGenerate folded into steamUpload; only the dedicated standalone version remains optional) |
| 7. Cloud device labs + crash ext.  |   0  |    6    | ⏸    0% |
| 8. Caching infrastructure          |   0  |    5    | ⏸    0% |
| 9. Observability & test reporting  |   0  |   11    | ⏸    0% |
| **Overall**                        | **130** | **67**  | **🟢 66%** |

**Next up (recommended order):**
1. **Phase 2.6 Cluster A — File vault + multi-user auth + RBAC + audit log** — the secret-encryption-at-rest piece landed in `cee40ac`, but the file-vault (`.p12` / `.mobileprovision` / `.p8` / `GoogleService-Info.plist` upload + reference-by-id) and the multi-user/RBAC layer are still the biggest blockers for adopting BuildPilot in a 5+ person team. The `BUILDPILOT_WEBHOOK_SECRET_<id>` env-var stop-gap can be replaced once secret-vault columns land.
2. **Phase 2.6 Cluster D — ASC API auto-provisioning** — the ES256 JWT signer landed in `d27523c`. Wire it into a `provisionAuto` step that creates / renews profiles + registers App IDs + adds devices automatically. Also unblocks an "auto build-number from ASC" step that hits the latest TestFlight build number and feeds `incrementBuildNumber`.
3. **Phase 2.6 Cluster C — Build matrix + manual approval / block step** — the two top platform-feature gaps that remain. Manual approval needs in-flight build state (waiting-for-human) plus a dashboard UI to grant approval.
4. **Phase 4 Cluster B — Build retries with backoff + step watchdog + build priority** — engine-level reliability features. Tag-pattern / cron / path-filtered triggers are smaller items in Cluster A that share the same poller-refactor.
5. **Phase 8 — Caching** — once the remote-Xcode-cache foundation in 2.6.D lands, the layered caching adapters (DerivedData, SPM, CocoaPods, Carthage, Ruby gems) land cheaply.
6. **Phase 9 — Observability** — xcresult HTML report renderer + flaky-test detection + duration trends turn the structured data BuildPilot already collects into actionable signal.
