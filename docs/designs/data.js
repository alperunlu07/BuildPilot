// data.js — BuildPilot mock data (projects, pipelines, builds, log lines)

window.BPData = (function () {
  const projects = [
    {
      id: "p1",
      name: "echoes-of-aether",
      displayName: "Echoes of Aether",
      path: "~/dev/games/echoes-of-aether",
      defaultBranch: "main",
      watchedBranches: ["main", "release/1.4"],
      pollerActive: true,
      lastBuild: { id: "b401", sha: "4f7a2b9", status: "running", duration: 184, when: "now" },
      builds30: [
        "success","success","success","failed","success","success","success","cancelled","success","success",
        "success","failed","success","success","success","success","running","success","success","success",
        "failed","success","success","success","success","success","success","success","success","running"
      ],
      totalBuilds: 142,
      successRate: 92,
      avgDuration: "4m 38s",
      pipelines: [
        { id: "pl1", name: "iOS · TestFlight", branch: "main", status: "running", interval: 60, steps: 12, lastSha: "4f7a2b9", strip: ["success","success","success","failed","success","success","success","running"] },
        { id: "pl2", name: "Steam · Win64", branch: "release/1.4", status: "success", interval: 300, steps: 9, lastSha: "9c1d3e0", strip: ["success","success","success","success","failed","success","success","success"] },
        { id: "pl3", name: "Linux dedicated server", branch: "main", status: "success", interval: 120, steps: 7, lastSha: "4f7a2b9", strip: ["success","success","success","success","success","success","success","success"] },
        { id: "pl4", name: "Android · Play Beta", branch: "main", status: "failed", interval: 600, steps: 11, lastSha: "2a8e44f", strip: ["success","failed","failed","success","success","failed","success","failed"] },
      ],
    },
    {
      id: "p2",
      name: "lattice-shipping",
      displayName: "Lattice Shipping",
      path: "~/dev/saas/lattice-shipping",
      defaultBranch: "main",
      watchedBranches: ["main", "next"],
      pollerActive: true,
      lastBuild: { id: "b399", sha: "e2f0c1a", status: "success", duration: 92, when: "12m ago" },
      builds30: [
        "success","success","success","success","success","success","success","success","success","success",
        "success","success","success","success","failed","success","success","success","success","success",
        "success","success","success","success","success","success","success","success","success","success"
      ],
      totalBuilds: 88,
      successRate: 97,
      avgDuration: "1m 32s",
      pipelines: [
        { id: "pl5", name: "Deploy preview", branch: "next", status: "success", interval: 60, steps: 6, lastSha: "e2f0c1a", strip: ["success","success","success","success","success","success","success","success"] },
        { id: "pl6", name: "Production", branch: "main", status: "success", interval: 120, steps: 8, lastSha: "a01b842", strip: ["success","success","success","success","success","success","success","success"] },
      ],
    },
    {
      id: "p3",
      name: "obsidian-engine",
      displayName: "Obsidian Engine",
      path: "~/dev/engine/obsidian-engine",
      defaultBranch: "trunk",
      watchedBranches: ["trunk"],
      pollerActive: true,
      lastBuild: { id: "b388", sha: "b8c4d2e", status: "success", duration: 612, when: "1h ago" },
      builds30: [
        "success","success","failed","success","success","success","success","success","success","success",
        "success","success","success","cancelled","success","success","success","success","success","success",
        "success","success","success","success","success","success","success","failed","success","success"
      ],
      totalBuilds: 56,
      successRate: 89,
      avgDuration: "10m 12s",
      pipelines: [
        { id: "pl7", name: "Cross-platform build matrix", branch: "trunk", status: "success", interval: 1800, steps: 14, lastSha: "b8c4d2e", strip: ["success","success","success","success","success","success","success","success"] },
      ],
    },
    {
      id: "p4",
      name: "kestrel-cli",
      displayName: "kestrel-cli",
      path: "~/dev/tools/kestrel-cli",
      defaultBranch: "main",
      watchedBranches: ["main"],
      pollerActive: false,
      lastBuild: { id: "b370", sha: "112ace0", status: "failed", duration: 71, when: "3d ago" },
      builds30: [
        "success","success","success","success","success","success","success","failed","failed","success",
        "success","success","success","success","success","success","success","success","success","success",
        "success","success","success","success","success","success","success","success","failed","failed"
      ],
      totalBuilds: 34,
      successRate: 82,
      avgDuration: "0m 58s",
      pipelines: [
        { id: "pl8", name: "Release · npm", branch: "main", status: "failed", interval: 0, steps: 5, lastSha: "112ace0", strip: ["success","success","success","success","success","failed","failed","failed"] },
      ],
    },
  ];

  // Pipeline editor — node graph (iOS · TestFlight pipeline)
  const pipelineNodes = [
    { id: "n1",  type: "gitCheckout", label: "Checkout", category: "git", icon: "GitBranch", x: 80,   y: 100, w: 168, status: "success", duration: "1.2s" },
    { id: "n2",  type: "gitPull",     label: "Pull origin/main", category: "git", icon: "GitMerge", x: 296,  y: 100, w: 168, status: "success", duration: "0.4s" },
    { id: "n3",  type: "unityBatch",  label: "Unity batch build", category: "unity", icon: "Box", x: 512, y: 60,  w: 184, status: "success", duration: "3m 12s" },
    { id: "n4",  type: "shell",       label: "Run unit tests",    category: "build", icon: "Terminal", x: 512, y: 160, w: 184, status: "success", duration: "47s" },
    { id: "n5",  type: "iosArchive",  label: "xcodebuild · archive", category: "ios-build", icon: "Apple", x: 744, y: 100, w: 192, status: "running", duration: "1m 04s" },
    { id: "n6",  type: "iosSign",     label: "Codesign + provision", category: "ios-sign", icon: "Lock",  x: 984, y: 100, w: 184, status: "pending", duration: "—" },
    { id: "n7",  type: "iosExport",   label: "Export .ipa",       category: "ios-dist", icon: "Package",  x: 1216, y: 60, w: 168, status: "pending", duration: "—" },
    { id: "n8",  type: "iosUpload",   label: "Upload TestFlight", category: "ios-dist", icon: "Upload",   x: 1216, y: 160, w: 184, status: "pending", duration: "—" },
    { id: "n9",  type: "telegram",    label: "Notify #builds",    category: "notify",   icon: "Send",     x: 1448, y: 110, w: 168, status: "pending", duration: "—" },
    { id: "n10", type: "shellFail",   label: "On failure · open issue", category: "notify", icon: "AlertCircle", x: 744, y: 240, w: 200, status: "skipped", duration: "—" },
  ];

  const pipelineEdges = [
    { from: "n1", to: "n2", cond: "success" },
    { from: "n2", to: "n3", cond: "success" },
    { from: "n2", to: "n4", cond: "success" },
    { from: "n3", to: "n5", cond: "success" },
    { from: "n4", to: "n5", cond: "success" },
    { from: "n5", to: "n6", cond: "success" },
    { from: "n6", to: "n7", cond: "success" },
    { from: "n6", to: "n8", cond: "success" },
    { from: "n7", to: "n9", cond: "success" },
    { from: "n8", to: "n9", cond: "success" },
    { from: "n5", to: "n10", cond: "failure" },
    { from: "n4", to: "n10", cond: "failure" },
  ];

  // Step palette categories
  const stepCategories = [
    { id: "git", label: "Git", color: "var(--cat-git)", icon: "GitBranch", steps: [
      { type: "gitCheckout", label: "Checkout", desc: "Check out a branch or sha" },
      { type: "gitPull", label: "Pull", desc: "Fast-forward pull from remote" },
      { type: "gitFetch", label: "Fetch", desc: "Update remote refs only" },
      { type: "gitTag", label: "Tag", desc: "Create or push a git tag" },
      { type: "gitCommit", label: "Commit", desc: "Stage and commit changes" },
      { type: "gitPush", label: "Push", desc: "Push to remote" },
    ]},
    { id: "build", label: "Build", color: "var(--cat-build)", icon: "Terminal", steps: [
      { type: "shell", label: "Shell command", desc: "Run an arbitrary shell command" },
      { type: "npmInstall", label: "npm install", desc: "Install npm deps" },
      { type: "npmRun", label: "npm run script", desc: "Run an npm script" },
      { type: "pnpmInstall", label: "pnpm install", desc: "Install with pnpm" },
      { type: "make", label: "make", desc: "Run a Makefile target" },
      { type: "docker", label: "Docker build", desc: "Build a Docker image" },
      { type: "cargo", label: "cargo build", desc: "Build a Rust crate" },
    ]},
    { id: "unity", label: "Unity", color: "var(--cat-unity)", icon: "Box", steps: [
      { type: "unityBatch", label: "Batch build", desc: "Headless Unity build" },
      { type: "unityTest", label: "Unity tests", desc: "Run Edit/Play mode tests" },
      { type: "unityLicense", label: "Activate license", desc: "Activate a Unity license" },
      { type: "unityReturn", label: "Return license", desc: "Return Unity license" },
    ]},
    { id: "ios-build", label: "iOS · Build", color: "var(--cat-ios-build)", icon: "Apple", steps: [
      { type: "iosArchive", label: "xcodebuild archive", desc: "Archive an Xcode scheme" },
      { type: "iosTestPlan", label: "Run test plan", desc: "Execute an Xcode test plan" },
      { type: "iosSimctl", label: "simctl test", desc: "Run UI tests on a simulator" },
    ]},
    { id: "ios-sign", label: "iOS · Sign", color: "var(--cat-ios-sign)", icon: "Lock", steps: [
      { type: "iosSign", label: "Codesign + provision", desc: "Sign an .xcarchive" },
      { type: "iosImportCerts", label: "Import certificates", desc: "Import .p12 into keychain" },
      { type: "iosImportProfile", label: "Import profile", desc: "Install a .mobileprovision" },
    ]},
    { id: "ios-dist", label: "iOS · Distribute", color: "var(--cat-ios-dist)", icon: "Upload", steps: [
      { type: "iosExport", label: "Export .ipa", desc: "Export an .ipa from archive" },
      { type: "iosUpload", label: "Upload TestFlight", desc: "Upload to App Store Connect" },
      { type: "iosASCSubmit", label: "ASC submit", desc: "Submit for review via ASC API" },
    ]},
    { id: "android", label: "Android", color: "var(--cat-android)", icon: "Smartphone", steps: [
      { type: "gradleBuild", label: "gradle build", desc: "Run a gradle task" },
      { type: "androidSign", label: "Sign .apk / .aab", desc: "Sign Android artifact" },
      { type: "playUpload", label: "Play Store upload", desc: "Upload to a Play track" },
    ]},
    { id: "steam", label: "Steam", color: "var(--cat-steam)", icon: "Gamepad", steps: [
      { type: "steamcmdLogin", label: "steamcmd login", desc: "Authenticate steamcmd" },
      { type: "steamcmdUpload", label: "steamcmd upload", desc: "Upload a depot build" },
    ]},
    { id: "notify", label: "Notifications", color: "var(--cat-notify)", icon: "Send", steps: [
      { type: "telegram", label: "Telegram", desc: "Send a Telegram message" },
      { type: "telegramApproval", label: "Telegram approval", desc: "Pause for manual approval" },
      { type: "slack", label: "Slack", desc: "Post to a Slack webhook" },
      { type: "discord", label: "Discord", desc: "Post to a Discord webhook" },
      { type: "webhook", label: "HTTP webhook", desc: "POST JSON to an endpoint" },
    ]},
    { id: "artifact", label: "Artifacts & Upload", color: "var(--cat-artifact)", icon: "Package", steps: [
      { type: "artifactCollect", label: "Collect artifact", desc: "Stage a file as a build artifact" },
      { type: "s3Upload", label: "S3 upload", desc: "Upload to an S3 bucket" },
      { type: "r2Upload", label: "R2 upload", desc: "Upload to Cloudflare R2" },
      { type: "rclone", label: "rclone", desc: "Generic rclone copy" },
    ]},
    { id: "remote", label: "Remote / SSH", color: "var(--cat-remote)", icon: "Server", steps: [
      { type: "sshRun", label: "SSH run", desc: "Run a command on a host" },
      { type: "sshUpload", label: "SSH upload", desc: "scp/rsync upload" },
      { type: "sshDownload", label: "SSH download", desc: "scp/rsync download" },
    ]},
  ];

  // Build detail — step Gantt for build #b401
  const buildGantt = [
    { id: "g1", node: "n1",  label: "Checkout",                  status: "success", start: 0,    end: 1200,   host: null },
    { id: "g2", node: "n2",  label: "Pull origin/main",          status: "success", start: 1240, end: 1640,   host: null },
    { id: "g3", node: "n3",  label: "Unity batch build",         status: "success", start: 1680, end: 192680, host: null },
    { id: "g4", node: "n4",  label: "Run unit tests",            status: "success", start: 1680, end: 48680,  host: null },
    { id: "g5", node: "n5",  label: "xcodebuild · archive",      status: "running", start: 192720, end: null,  host: "mac-mini-01", retry: 0 },
    { id: "g6", node: "n6",  label: "Codesign + provision",      status: "pending", start: null, end: null,   host: "mac-mini-01" },
    { id: "g7", node: "n7",  label: "Export .ipa",               status: "pending", start: null, end: null,   host: "mac-mini-01" },
    { id: "g8", node: "n8",  label: "Upload TestFlight",         status: "pending", start: null, end: null,   host: "mac-mini-01" },
    { id: "g9", node: "n9",  label: "Notify #builds",            status: "pending", start: null, end: null,   host: null },
  ];

  // Build log entries — large enough to feel real
  function generateLogs() {
    const out = [];
    const t0 = Date.now() - 184000; // 3m04s ago
    let t = t0;
    const push = (level, node, stepType, msg) => {
      out.push({ ts: t, level, node, stepType, msg });
      t += 60 + Math.random() * 200;
    };
    push("system", "n1", "gitCheckout", "▸ step.gitCheckout started · branch=main");
    push("info",   "n1", "gitCheckout", "Resolved branch main @ 4f7a2b9");
    push("stdout", "n1", "gitCheckout", "Switched to branch 'main'");
    push("stdout", "n1", "gitCheckout", "Your branch is up to date with 'origin/main'.");
    push("success","n1", "gitCheckout", "✓ step.gitCheckout completed in 1.2s");
    push("system", "n2", "gitPull",     "▸ step.gitPull started · remote=origin");
    push("stdout", "n2", "gitPull",     "Already up to date.");
    push("success","n2", "gitPull",     "✓ step.gitPull completed in 0.4s");
    push("system", "n4", "shell",       "▸ step.shell started · cmd=\"pnpm test:unit\"");
    push("stdout", "n4", "shell",       "$ pnpm test:unit");
    push("stdout", "n4", "shell",       "Lockfile is up to date, resolution step is skipped");
    push("stdout", "n4", "shell",       "  ✓ src/economy/inventory.test.ts (24)");
    push("stdout", "n4", "shell",       "  ✓ src/scenes/loader.test.ts (12)");
    push("stdout", "n4", "shell",       "  ✓ src/net/quic.test.ts (8)");
    push("stdout", "n4", "shell",       "  ✓ src/ai/director.test.ts (33)");
    push("stdout", "n4", "shell",       "  Test Files  18 passed (18)");
    push("stdout", "n4", "shell",       "       Tests  211 passed (211)");
    push("stdout", "n4", "shell",       "    Duration  46.94s");
    push("success","n4", "shell",       "✓ step.shell completed in 47s");
    push("system", "n3", "unityBatch",  "▸ step.unityBatch started · target=iOS");
    push("info",   "n3", "unityBatch",  "Activating Unity license · seat 2/5");
    push("stdout", "n3", "unityBatch",  "Initialize engine version: 2023.3.14f1 (b2c3d4e5f6a7)");
    push("stdout", "n3", "unityBatch",  "[Licensing::Module] Channel opened: LicenseClient-tomh");
    push("stdout", "n3", "unityBatch",  "Refreshing native plugins compatible for Editor in 14.78 ms, found 8 plugins.");
    push("stdout", "n3", "unityBatch",  "Asset import: Assets/Materials/Volumetric/SkyDome.mat");
    push("stdout", "n3", "unityBatch",  "Asset import: Assets/Materials/Volumetric/Nebula.mat");
    push("stdout", "n3", "unityBatch",  "Asset import: Assets/Materials/Volumetric/AtmosScatter.mat");
    push("stdout", "n3", "unityBatch",  "Compiling shader \"Universal Render Pipeline/Lit\" pass \"ForwardLit\" (vp)");
    push("stdout", "n3", "unityBatch",  "Compiling shader \"Custom/Volumetric/AtmosScatter\" pass \"ForwardLit\" (vp)");
    push("stdout", "n3", "unityBatch",  "BurstCompiler: enabled = true · safety = false");
    push("stdout", "n3", "unityBatch",  "il2cpp.exe didn't catch exception: Empty entry list");
    push("info",   "n3", "unityBatch",  "Build target switched: iOS");
    push("stdout", "n3", "unityBatch",  "Building Player for iOS · Architecture=ARM64");
    push("stdout", "n3", "unityBatch",  "Compressing assets in textures ETC2_RGBA8");
    push("stdout", "n3", "unityBatch",  "Build size: 142.4 MB · Assets: 88.2 MB · Scripts: 12.4 MB");
    push("success","n3", "unityBatch",  "✓ step.unityBatch completed in 3m 11s · output=./build/iOS");
    push("system", "n5", "iosArchive",  "▸ step.iosArchive started · scheme=EchoesAether host=mac-mini-01");
    push("info",   "n5", "iosArchive",  "Connecting to mac-mini-01.local · ssh user=tomh");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01] xcodebuild -workspace EchoesAether.xcworkspace -scheme EchoesAether -configuration Release -archivePath build/EchoesAether.xcarchive archive");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01] Build settings from command line:");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01]     ARCHS = arm64");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01]     CODE_SIGN_STYLE = Manual");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01]     DEVELOPMENT_TEAM = K3RN3LXYZ");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01] Compile target: EchoesAetherEngine.framework (Release)");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01]     CompileSwift normal arm64 (in target EchoesAether)");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01]     Compiling Scenes/MainMenuViewController.swift");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01]     Compiling Networking/QUICTransport.swift");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01]     Compiling Audio/SpatialMixer.swift");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01] Ld build/Intermediates.noindex/ArchiveIntermediates/EchoesAether/IntermediateBuildFilesPath/EchoesAether.build/Release-iphoneos/EchoesAether.build/Objects-normal/arm64/EchoesAether normal arm64");
    push("stderr", "n5", "iosArchive",  "[mac-mini-01] warning: Building for 'iphoneos', but linking in dylib (libRT.dylib) built for 'iOS-simulator'");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01] CreateUniversalBinary build/...");
    push("stdout", "n5", "iosArchive",  "[mac-mini-01] Streaming compiler output…");
    return out;
  }
  const buildLog = generateLogs();

  // Validation issues (toggled by tweak)
  const validation = [
    { level: "error",   node: "n6",  msg: "Missing required field · 'provisioningProfile'" },
    { level: "error",   node: "n8",  msg: "Missing required field · 'ascApiKeyPath'" },
    { level: "warning", node: "n10", msg: "Orphaned branch · 'shellFail' has no path to a terminal node" },
  ];

  return { projects, pipelineNodes, pipelineEdges, stepCategories, buildGantt, buildLog, validation };
})();
