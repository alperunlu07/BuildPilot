import type { ChildProcess } from 'node:child_process';
import type {
  AiAutoFixConfig,
  Build,
  BuildLogLevel,
  Pipeline,
  Project,
  StepType,
} from '@buildpilot/shared-types';
import { updateBuildStatus } from '../store/builds';
import { appendBuildLogEntry } from '../store/buildLogs';
import { setPipelineLastBuiltSha } from '../store/pipelines';
import { eventBus } from '../events/bus';
import { cancelBuild, isCancelled, trackChild } from './coordinator';
import { runCheckout } from './steps/checkout';
import { runPull } from './steps/pull';
import { runShell } from './steps/shell';
import { runUnityBatch } from './steps/unityBatch';
import { runHttpRequest } from './steps/httpRequest';
import { runSlackNotify } from './steps/slackNotify';
import { runDiscordNotify } from './steps/discordNotify';
import { runTelegramNotify } from './steps/telegramNotify';
import { runAiPrompt } from './steps/aiPrompt';
import { runArtifact } from './steps/artifact';
import { runRemoteSsh } from './steps/remoteSsh';
import { runSftpUpload } from './steps/sftpUpload';
import { runXcodebuild } from './steps/xcodebuild';
import { runGitMerge } from './steps/gitMerge';
import { runS3Upload } from './steps/s3Upload';
import { runTestflightUpload } from './steps/testflightUpload';
import { runKeychainUnlock } from './steps/keychainUnlock';
import { runProvisioningProfileInstall } from './steps/provisioningProfileInstall';
import { runNotarize } from './steps/notarize';
import { runStapleNotarization } from './steps/stapleNotarization';
import { runFastlaneMatch } from './steps/fastlaneMatch';
import { runCocoapodsInstall } from './steps/cocoapodsInstall';
import { runSwiftPackageResolve } from './steps/swiftPackageResolve';
import { runDsymUpload } from './steps/dsymUpload';
import { runXcresultParse } from './steps/xcresultParse';
import { runXcodeSelect } from './steps/xcodeSelect';
import { runEnsureGitStatusClean } from './steps/ensureGitStatusClean';
import { runIncrementBuildNumber } from './steps/incrementBuildNumber';
import { runGetBuildNumber } from './steps/getBuildNumber';
import { runChangelogFromGitCommits } from './steps/changelogFromGitCommits';
import { runUpdateInfoPlist } from './steps/updateInfoPlist';
import { runSwiftlint } from './steps/swiftlint';
import { runSwiftFormat } from './steps/swiftFormat';
import { runXcodebuildAnalyze } from './steps/xcodebuildAnalyze';
import { runPeripheryScan } from './steps/peripheryScan';
import { runSlatherCoverage } from './steps/slatherCoverage';
import { runXcovGate } from './steps/xcovGate';
import { runResign } from './steps/resign';
import { runSnapshot } from './steps/snapshot';
import { runFrameit } from './steps/frameit';
import { runGradleBuild } from './steps/gradleBuild';
import { runAdbConnect } from './steps/adbConnect';
import { runAdbInstall } from './steps/adbInstall';
import { runAdbShellLaunch } from './steps/adbShellLaunch';
import { runAdbLogcat } from './steps/adbLogcat';
import { runAdbPair } from './steps/adbPair';
import { runBundletool } from './steps/bundletool';
import { runAndroidSign } from './steps/androidSign';
import { runPlayConsoleUpload } from './steps/playConsoleUpload';
import { runTeamsNotify } from './steps/teamsNotify';
import { runEmailNotify } from './steps/emailNotify';
import { runAppStoreConnectApi } from './steps/appStoreConnectApi';
import { runTestflightSetWhatToTest } from './steps/testflightSetWhatToTest';
import { runTestflightPublicLink } from './steps/testflightPublicLink';
import { runTestflightManage } from './steps/testflightManage';
import { runAppStorePrecheck } from './steps/appStorePrecheck';
import { runAppStoreCreate } from './steps/appStoreCreate';
import { runAppStoreUpload } from './steps/appStoreUpload';
import { runBuildAppGym } from './steps/buildAppGym';
import { runPushCertificate } from './steps/pushCertificate';
import { runCertManage } from './steps/certManage';
import { runRegisterDevices } from './steps/registerDevices';
import { runSigh } from './steps/sigh';
import { runSimctlPrepare } from './steps/simctlPrepare';
import { runSimctlInstallLaunch } from './steps/simctlInstallLaunch';
import { runSimctlScreenshot } from './steps/simctlScreenshot';
import { runSimctlPushNotification } from './steps/simctlPushNotification';
import { runSimctlStatusBarOverride } from './steps/simctlStatusBarOverride';
import { runSimctlPrivacyGrant } from './steps/simctlPrivacyGrant';
import { runSecurityKeychainImport } from './steps/securityKeychainImport';
import { runCodesignArbitrary } from './steps/codesignArbitrary';
import { runDsymVerify } from './steps/dsymVerify';
import { runPrivacyManifestValidate } from './steps/privacyManifestValidate';
import { runPrivacyManifestAggregate } from './steps/privacyManifestAggregate';
import { runAppThinningReportParse } from './steps/appThinningReportParse';
import { runLinkMapAnalyze } from './steps/linkMapAnalyze';
import { runBitcodeStrip } from './steps/bitcodeStrip';
import { runOtaManifestGenerate } from './steps/otaManifestGenerate';
import { runFirebaseAppDistribution } from './steps/firebaseAppDistribution';
import { runDistributionGroups } from './steps/distributionGroups';
import { runPhasedRollout } from './steps/phasedRollout';
import { runBranchTargetedTestFlight } from './steps/branchTargetedTestFlight';
import { runStorekitConfigure } from './steps/storekitConfigure';
import { runSteamcmdSetup } from './steps/steamcmdSetup';
import { runSteamUpload } from './steps/steamUpload';
import { runSteamSetLive } from './steps/steamSetLive';
import { runSteamWorkshopUpload } from './steps/steamWorkshopUpload';
import { runIosDeviceLog } from './steps/iosDeviceLog';

export interface StepContext {
  project: Project;
  build: Build;
  // Emit a single structured log line associated with the current step.
  log(message: string, level?: BuildLogLevel): void;
  // Wire a child_process so its stdout/stderr stream into the log table
  // one line at a time. Buffering trailing partial lines until newline or
  // process close, so multi-MB Unity stdout doesn't flood as a single row.
  attachProcess(child: ChildProcess): void;
}

type StepRunner = (ctx: StepContext, data: Record<string, unknown>) => Promise<void>;

const RUNNERS: Record<StepType, StepRunner> = {
  checkout: runCheckout,
  pull: runPull,
  shell: runShell,
  unityBatch: runUnityBatch,
  httpRequest: runHttpRequest,
  slackNotify: runSlackNotify,
  discordNotify: runDiscordNotify,
  telegramNotify: runTelegramNotify,
  aiPrompt: runAiPrompt,
  artifact: runArtifact,
  remoteSsh: runRemoteSsh,
  sftpUpload: runSftpUpload,
  xcodebuild: runXcodebuild,
  gitMerge: runGitMerge,
  s3Upload: runS3Upload,
  testflightUpload: runTestflightUpload,
  keychainUnlock: runKeychainUnlock,
  provisioningProfileInstall: runProvisioningProfileInstall,
  notarize: runNotarize,
  stapleNotarization: runStapleNotarization,
  fastlaneMatch: runFastlaneMatch,
  cocoapodsInstall: runCocoapodsInstall,
  swiftPackageResolve: runSwiftPackageResolve,
  dsymUpload: runDsymUpload,
  xcresultParse: runXcresultParse,
  xcodeSelect: runXcodeSelect,
  ensureGitStatusClean: runEnsureGitStatusClean,
  incrementBuildNumber: runIncrementBuildNumber,
  getBuildNumber: runGetBuildNumber,
  changelogFromGitCommits: runChangelogFromGitCommits,
  updateInfoPlist: runUpdateInfoPlist,
  swiftlint: runSwiftlint,
  swiftFormat: runSwiftFormat,
  xcodebuildAnalyze: runXcodebuildAnalyze,
  peripheryScan: runPeripheryScan,
  slatherCoverage: runSlatherCoverage,
  xcovGate: runXcovGate,
  resign: runResign,
  snapshot: runSnapshot,
  frameit: runFrameit,
  gradleBuild: runGradleBuild,
  adbConnect: runAdbConnect,
  adbInstall: runAdbInstall,
  adbShellLaunch: runAdbShellLaunch,
  adbLogcat: runAdbLogcat,
  adbPair: runAdbPair,
  bundletool: runBundletool,
  androidSign: runAndroidSign,
  playConsoleUpload: runPlayConsoleUpload,
  teamsNotify: runTeamsNotify,
  emailNotify: runEmailNotify,
  appStoreConnectApi: runAppStoreConnectApi,
  testflightSetWhatToTest: runTestflightSetWhatToTest,
  testflightPublicLink: runTestflightPublicLink,
  testflightManage: runTestflightManage,
  appStorePrecheck: runAppStorePrecheck,
  appStoreCreate: runAppStoreCreate,
  appStoreUpload: runAppStoreUpload,
  buildAppGym: runBuildAppGym,
  pushCertificate: runPushCertificate,
  certManage: runCertManage,
  registerDevices: runRegisterDevices,
  sigh: runSigh,
  simctlPrepare: runSimctlPrepare,
  simctlInstallLaunch: runSimctlInstallLaunch,
  simctlScreenshot: runSimctlScreenshot,
  simctlPushNotification: runSimctlPushNotification,
  simctlStatusBarOverride: runSimctlStatusBarOverride,
  simctlPrivacyGrant: runSimctlPrivacyGrant,
  securityKeychainImport: runSecurityKeychainImport,
  codesignArbitrary: runCodesignArbitrary,
  dsymVerify: runDsymVerify,
  privacyManifestValidate: runPrivacyManifestValidate,
  privacyManifestAggregate: runPrivacyManifestAggregate,
  appThinningReportParse: runAppThinningReportParse,
  linkMapAnalyze: runLinkMapAnalyze,
  bitcodeStrip: runBitcodeStrip,
  otaManifestGenerate: runOtaManifestGenerate,
  firebaseAppDistribution: runFirebaseAppDistribution,
  distributionGroups: runDistributionGroups,
  phasedRollout: runPhasedRollout,
  branchTargetedTestFlight: runBranchTargetedTestFlight,
  storekitConfigure: runStorekitConfigure,
  steamcmdSetup: runSteamcmdSetup,
  steamUpload: runSteamUpload,
  steamSetLive: runSteamSetLive,
  steamWorkshopUpload: runSteamWorkshopUpload,
  iosDeviceLog: runIosDeviceLog,
};

interface DagNode {
  id: string;
  type: StepType;
  data: Record<string, unknown>;
}

// Hard cap on parallel steps within a single pipeline run. Independent DAG
// branches schedule concurrently up to this limit; convergence points still
// wait for all parents.
const MAX_CONCURRENCY = 4;

interface StepResult {
  ok: boolean;
  cancelled: boolean;
  attempts: number;
  error: unknown;
}

async function executeStep(
  build: Build,
  project: Project,
  node: DagNode,
  persist: (level: BuildLogLevel, message: string, nodeId: string | null, stepType: StepType | null) => void,
): Promise<StepResult> {
  const runner = RUNNERS[node.type];
  const aiFix = readAiAutoFix(node.data);
  const retryPolicy = aiFix?.enabled ? null : readRetryPolicy(node.data);
  const watchdog = readWatchdog(node.data);
  const maxAttempts = aiFix?.enabled
    ? Math.max(1, aiFix.maxRetries ?? 3) + 1
    : retryPolicy?.enabled
      ? Math.max(0, retryPolicy.maxRetries) + 1
      : 1;
  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      if (aiFix?.enabled) {
        persist(
          'system',
          `↻ retry ${attempt - 1}/${maxAttempts - 1} after AI fix`,
          node.id,
          node.type,
        );
      } else if (retryPolicy?.enabled) {
        // Linear-doubling backoff up to backoffMaxMs.
        const delay = Math.min(
          retryPolicy.backoffMs * 2 ** (attempt - 2),
          retryPolicy.backoffMaxMs,
        );
        persist(
          'system',
          `↻ retry ${attempt - 1}/${maxAttempts - 1} after ${delay}ms backoff`,
          node.id,
          node.type,
        );
        await sleep(delay);
        if (isCancelled(build.id)) {
          return { ok: false, cancelled: true, attempts: attempt - 1, error: lastErr };
        }
      }
    }
    // Per-attempt ctx — the watchdog tracker observes only this attempt's
    // log entries, so retries get a fresh idle clock.
    const watchdogState = watchdog?.enabled
      ? createWatchdogState(build.id, watchdog.idleSec, () =>
          persist(
            'failure',
            `✖ watchdog: no log output for ${watchdog.idleSec}s — terminating step`,
            node.id,
            node.type,
          ),
        )
      : null;
    const ctx = makeStepContext(build, project, node, persist, watchdogState);
    try {
      await runner(ctx, node.data);
      watchdogState?.cancel();
      if (isCancelled(build.id)) {
        return { ok: false, cancelled: true, attempts: attempt, error: lastErr };
      }
      return { ok: true, cancelled: false, attempts: attempt, error: null };
    } catch (err) {
      watchdogState?.cancel();
      lastErr = err;
      if (isCancelled(build.id)) {
        return { ok: false, cancelled: true, attempts: attempt, error: lastErr };
      }
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < maxAttempts && aiFix?.enabled) {
        persist(
          'failure',
          `✖ step failed (attempt ${attempt}): ${msg} — invoking AI fix`,
          node.id,
          node.type,
        );
        try {
          await runAiPrompt(ctx, {
            tool: aiFix.tool ?? 'claude',
            prompt: renderAiFixPrompt(aiFix.prompt, {
              step: node.type,
              error: msg,
              nodeId: node.id,
            }),
            allowFailure: 'true' as unknown as boolean,
          });
        } catch (aiErr) {
          const aiMsg = aiErr instanceof Error ? aiErr.message : String(aiErr);
          persist('failure', `AI fix invocation failed: ${aiMsg}`, node.id, node.type);
        }
      } else if (attempt < maxAttempts && retryPolicy?.enabled) {
        persist(
          'failure',
          `✖ step failed (attempt ${attempt}): ${msg} — retrying`,
          node.id,
          node.type,
        );
      }
    }
  }
  return { ok: false, cancelled: false, attempts: maxAttempts, error: lastErr };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function readRetryPolicy(
  data: Record<string, unknown>,
): { enabled: boolean; maxRetries: number; backoffMs: number; backoffMaxMs: number } | null {
  const raw = data.retryPolicy as unknown;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const enabled = r.enabled === true || r.enabled === 'true';
  if (!enabled) return null;
  const maxRetries = typeof r.maxRetries === 'number'
    ? Math.max(0, Math.min(r.maxRetries, 10))
    : 3;
  const backoffMs = typeof r.backoffMs === 'number' ? Math.max(0, r.backoffMs) : 1000;
  const backoffMaxMs = typeof r.backoffMaxMs === 'number' ? Math.max(backoffMs, r.backoffMaxMs) : 30_000;
  return { enabled, maxRetries, backoffMs, backoffMaxMs };
}

export function readWatchdog(
  data: Record<string, unknown>,
): { enabled: boolean; idleSec: number } | null {
  const raw = data.watchdog as unknown;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const enabled = r.enabled === true || r.enabled === 'true';
  if (!enabled) return null;
  const idleSec = typeof r.idleSec === 'number' && r.idleSec > 0 ? r.idleSec : 600;
  return { enabled, idleSec };
}

interface WatchdogState {
  poke(): void;
  cancel(): void;
}

function createWatchdogState(
  buildId: string,
  idleSec: number,
  onFire: () => void,
): WatchdogState {
  let timer: NodeJS.Timeout | null = null;
  let cancelled = false;
  const reset = () => {
    if (cancelled) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (cancelled) return;
      onFire();
      // Trip the build-level cancellation so all child processes terminate.
      // Reusing the existing cancel pipe means SIGTERM → SIGKILL with the
      // same grace period as a UI-driven cancel; the engine's outer loop
      // will then return cancelled=true for this attempt.
      try {
        cancelBuild(buildId);
      } catch {
        /* nothing in-flight */
      }
    }, idleSec * 1000);
  };
  reset();
  return {
    poke: reset,
    cancel() {
      cancelled = true;
      if (timer) clearTimeout(timer);
    },
  };
}

function readAiAutoFix(data: Record<string, unknown>): AiAutoFixConfig | null {
  const raw = data.aiAutoFix as unknown;
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const enabled = r.enabled === true || r.enabled === 'true';
  if (!enabled) return null;
  const prompt =
    typeof r.prompt === 'string' && r.prompt.trim().length > 0
      ? (r.prompt as string)
      : DEFAULT_AI_FIX_PROMPT;
  return {
    enabled: true,
    tool: (typeof r.tool === 'string' ? r.tool : 'claude') as AiAutoFixConfig['tool'],
    prompt,
    maxRetries: typeof r.maxRetries === 'number' ? r.maxRetries : 3,
  };
}

const DEFAULT_AI_FIX_PROMPT = [
  'The pipeline step "{{step}}" (node {{nodeId}}) just failed with this error:',
  '',
  '{{error}}',
  '',
  'Read the relevant files in the working tree to understand the failure, then',
  'make the smallest set of changes that would let the step succeed on retry.',
  'Do not run the build yourself — exit when done and the pipeline will retry',
  'the step automatically.',
].join('\n');

function renderAiFixPrompt(
  template: string,
  vars: { step: string; error: string; nodeId: string },
): string {
  return template
    .replace(/\{\{\s*step\s*\}\}/g, vars.step)
    .replace(/\{\{\s*error\s*\}\}/g, vars.error)
    .replace(/\{\{\s*nodeId\s*\}\}/g, vars.nodeId);
}

function descendantsOf(pipeline: Pipeline, nodeId: string): Set<string> {
  const set = new Set<string>([nodeId]);
  const queue: string[] = [nodeId];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const e of pipeline.edges) {
      if (e.source === cur && !set.has(e.target)) {
        set.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return set;
}

function topologicalOrder(pipeline: Pipeline): DagNode[] {
  const nodeMap = new Map<string, DagNode>();
  for (const n of pipeline.nodes) {
    nodeMap.set(n.id, { id: n.id, type: n.type, data: n.data });
  }
  const incoming = new Map<string, number>();
  const outgoing = new Map<string, string[]>();
  for (const n of pipeline.nodes) {
    incoming.set(n.id, 0);
    outgoing.set(n.id, []);
  }
  for (const e of pipeline.edges) {
    if (!nodeMap.has(e.source) || !nodeMap.has(e.target)) continue;
    outgoing.get(e.source)!.push(e.target);
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
  }
  const queue: string[] = [];
  for (const [id, deg] of incoming) if (deg === 0) queue.push(id);
  const order: DagNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodeMap.get(id);
    if (!node) continue;
    order.push(node);
    for (const child of outgoing.get(id) ?? []) {
      const next = (incoming.get(child) ?? 0) - 1;
      incoming.set(child, next);
      if (next === 0) queue.push(child);
    }
  }
  return order;
}

export async function runPipeline(args: {
  pipeline: Pipeline;
  project: Project;
  build: Build;
  fromNodeId?: string;
}): Promise<void> {
  const { pipeline, project, build, fromNodeId } = args;

  const persist = (
    level: BuildLogLevel,
    message: string,
    nodeId: string | null,
    stepType: StepType | null,
  ) => {
    const entry = appendBuildLogEntry({
      buildId: build.id,
      ts: Date.now(),
      level,
      nodeId,
      stepType,
      message,
    });
    eventBus.publish({ type: 'buildLogEntry', buildId: build.id, entry });
  };

  // The build may have been cancelled while still queued — short-circuit.
  if (isCancelled(build.id)) {
    persist('system', 'Pipeline cancelled before start.', null, null);
    finalize(build, 'cancelled', pipeline);
    return;
  }

  updateBuildStatus(build.id, 'running');
  build.status = 'running';
  eventBus.publish({ type: 'buildStarted', build });

  persist('system', `Pipeline "${pipeline.name}" started`, null, null);
  if (build.triggerSha || build.triggerBranch) {
    persist(
      'info',
      `trigger: branch=${build.triggerBranch || '(detached)'} sha=${build.triggerSha || '(none)'}`,
      null,
      null,
    );
  }

  // DAG traversal: for each node we track the outcome (success / failed /
  // skipped) once it's been visited. A node becomes a candidate when all its
  // incoming edges whose source is allowed have a known outcome. Each
  // incoming edge gates execution by its condition (default 'success').
  type Outcome = 'success' | 'failed' | 'skipped';
  const allowed = fromNodeId
    ? descendantsOf(pipeline, fromNodeId)
    : new Set<string>(pipeline.nodes.map((n) => n.id));
  if (fromNodeId) {
    persist(
      'info',
      `Restart-from: ${fromNodeId} (${allowed.size} of ${pipeline.nodes.length} steps)`,
      null,
      null,
    );
  }
  const allNodes = new Map<string, DagNode>(
    pipeline.nodes
      .filter((n) => allowed.has(n.id))
      .map((n) => [n.id, { id: n.id, type: n.type, data: n.data }]),
  );
  if (allNodes.size === 0) persist('info', 'Pipeline has no nodes.', null, null);

  // Pre-compute incoming edges per node (only edges from allowed sources).
  const incomingByNode = new Map<string, typeof pipeline.edges>();
  for (const e of pipeline.edges) {
    if (!allNodes.has(e.target) || !allNodes.has(e.source)) continue;
    const arr = incomingByNode.get(e.target) ?? [];
    arr.push(e);
    incomingByNode.set(e.target, arr);
  }

  const outcomes = new Map<string, Outcome>();
  // Steps currently in-flight. Independent branches of the DAG can execute
  // concurrently up to MAX_CONCURRENCY at a time.
  const inflight = new Map<string, Promise<{ nodeId: string; result: StepResult }>>();
  let cancelled = false;
  let anyFailed = false;

  function evaluateCandidate(
    node: DagNode,
  ): 'ready' | 'skip' | 'wait' {
    if (outcomes.has(node.id) || inflight.has(node.id)) return 'wait';
    const incoming = incomingByNode.get(node.id) ?? [];
    if (!incoming.every((e) => outcomes.has(e.source))) return 'wait';

    // Failure aggregator: when every incoming edge is a 'failure' edge, treat
    // the join as OR — fire if ANY upstream actually failed. Without this,
    // a single failure aggregator behind a chain (A→B→C, each with a failure
    // edge to N) would never run: when A fails, B/C are skipped, and the
    // edges from skipped parents would block N under strict AND semantics.
    const allFailureEdges =
      incoming.length > 0 && incoming.every((e) => (e.condition ?? 'success') === 'failure');
    if (allFailureEdges) {
      const anyFailed = incoming.some((e) => outcomes.get(e.source) === 'failed');
      return anyFailed ? 'ready' : 'skip';
    }

    const allMatch = incoming.every((e) => {
      const parent = outcomes.get(e.source);
      if (parent === 'skipped') return false;
      const cond = e.condition ?? 'success';
      if (cond === 'always') return true;
      if (cond === 'success') return parent === 'success';
      if (cond === 'failure') return parent === 'failed';
      return false;
    });
    return allMatch ? 'ready' : 'skip';
  }

  function spawn(node: DagNode) {
    eventBus.publish({
      type: 'buildStepStarted',
      buildId: build.id,
      pipelineId: pipeline.id,
      nodeId: node.id,
      stepType: node.type,
    });
    persist('system', `▶ step started`, node.id, node.type);
    const p = executeStep(build, project, node, persist).then((result) => ({
      nodeId: node.id,
      result,
    }));
    inflight.set(node.id, p);
  }

  scheduling: while (true) {
    if (cancelled) break;

    // 1. Drain skip decisions (pure sync, may unlock more skips downstream).
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const node of allNodes.values()) {
        if (evaluateCandidate(node) === 'skip') {
          persist('system', '⊘ step skipped (condition not met)', node.id, node.type);
          eventBus.publish({
            type: 'buildStepFinished',
            buildId: build.id,
            pipelineId: pipeline.id,
            nodeId: node.id,
            stepType: node.type,
            status: 'skipped',
          });
          outcomes.set(node.id, 'skipped');
          progressed = true;
        }
      }
    }

    // 2. Schedule ready candidates up to the concurrency cap.
    for (const node of allNodes.values()) {
      if (inflight.size >= MAX_CONCURRENCY) break;
      if (isCancelled(build.id)) {
        cancelled = true;
        break scheduling;
      }
      if (evaluateCandidate(node) === 'ready') spawn(node);
    }

    // 3. Done?
    if (inflight.size === 0) break; // no candidates left; either everything done or stuck (cycle)

    // 4. Wait for any one in-flight step to finish.
    const settled = await Promise.race(inflight.values());
    inflight.delete(settled.nodeId);
    const { nodeId, result } = settled;
    const node = allNodes.get(nodeId)!;

    if (result.cancelled) {
      cancelled = true;
      eventBus.publish({
        type: 'buildStepFinished',
        buildId: build.id,
        pipelineId: pipeline.id,
        nodeId,
        stepType: node.type,
        status: 'failed',
      });
      const cancelMsg = result.error instanceof Error ? result.error.message : String(result.error ?? 'cancelled');
      persist('system', `✖ step cancelled (${cancelMsg})`, nodeId, node.type);
      break;
    }
    if (result.ok) {
      persist('success', '✔ step ok', nodeId, node.type);
      eventBus.publish({
        type: 'buildStepFinished',
        buildId: build.id,
        pipelineId: pipeline.id,
        nodeId,
        stepType: node.type,
        status: 'success',
      });
      outcomes.set(nodeId, 'success');
    } else {
      const msg = result.error instanceof Error ? result.error.message : String(result.error ?? 'unknown');
      // Step-level "continue on error" / soft-fail: the user marked this node
      // as non-blocking (GH `continue-on-error`, Buildkite `soft_fail`,
      // GitLab `allow_failure`). Record the failure in the log but treat the
      // outcome as success so downstream success-edges still fire and the
      // overall build doesn't go red.
      const continueOnError = (node.data as { continueOnError?: unknown })?.continueOnError === 'true';
      if (continueOnError) {
        persist(
          'failure',
          `⚠ step failed after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'} (continueOnError): ${msg}`,
          nodeId,
          node.type,
        );
        // Fire as 'success' so the dashboard's per-step indicator stays green,
        // but the log-level 'failure' line above is preserved for ops review.
        eventBus.publish({
          type: 'buildStepFinished',
          buildId: build.id,
          pipelineId: pipeline.id,
          nodeId,
          stepType: node.type,
          status: 'success',
        });
        outcomes.set(nodeId, 'success');
      } else {
        persist(
          'failure',
          `✖ step failed after ${result.attempts} attempt${result.attempts === 1 ? '' : 's'}: ${msg}`,
          nodeId,
          node.type,
        );
        eventBus.publish({
          type: 'buildStepFinished',
          buildId: build.id,
          pipelineId: pipeline.id,
          nodeId,
          stepType: node.type,
          status: 'failed',
        });
        outcomes.set(nodeId, 'failed');
        anyFailed = true;
        // Don't break — failure-edges may still need to fire and other parallel
        // branches keep running.
      }
    }
  }

  // On cancellation, let any still-running steps settle so child processes
  // (which cancelBuild has already SIGTERM'd) close cleanly.
  if (inflight.size > 0) {
    await Promise.allSettled(inflight.values());
    inflight.clear();
  }

  const finalStatus = cancelled ? 'cancelled' : anyFailed ? 'failed' : 'success';
  if (finalStatus === 'success' && build.triggerSha) {
    setPipelineLastBuiltSha(pipeline.id, build.triggerSha);
  }
  persist(
    finalStatus === 'success' ? 'success' : finalStatus === 'cancelled' ? 'system' : 'failure',
    finalStatus === 'success'
      ? 'Pipeline finished successfully.'
      : finalStatus === 'cancelled'
        ? 'Pipeline cancelled.'
        : 'Pipeline failed.',
    null,
    null,
  );
  finalize(build, finalStatus, pipeline);
}

function finalize(
  build: Build,
  finalStatus: 'success' | 'failed' | 'cancelled',
  _pipeline: Pipeline,
): void {
  updateBuildStatus(build.id, finalStatus);
  build.status = finalStatus;
  build.finishedAt = Date.now();
  eventBus.publish({ type: 'buildFinished', build });
}

function makeStepContext(
  build: Build,
  project: Project,
  node: DagNode,
  persist: (level: BuildLogLevel, message: string, nodeId: string | null, stepType: StepType | null) => void,
  watchdog: WatchdogState | null,
): StepContext {
  // Every log emit pokes the watchdog. The runner instrumentation pipes
  // child_process stdout/stderr through `persist` line-by-line below, so
  // long-running but chatty processes never trip the watchdog.
  const persistWithPoke = (
    level: BuildLogLevel,
    message: string,
    nodeId: string | null,
    stepType: StepType | null,
  ) => {
    persist(level, message, nodeId, stepType);
    watchdog?.poke();
  };
  return {
    project,
    build,
    log(message, level = 'info') {
      persistWithPoke(level, message, node.id, node.type);
    },
    attachProcess(child) {
      trackChild(build.id, child);
      const splitter = makeLineSplitter((line, level) =>
        persistWithPoke(level, line, node.id, node.type),
      );
      child.stdout?.on('data', (chunk: Buffer) => splitter.feed(chunk, 'stdout'));
      child.stderr?.on('data', (chunk: Buffer) => splitter.feed(chunk, 'stderr'));
      child.on('close', () => splitter.flush());
    },
  };
}

// Line splitter that tolerates partial chunks and CRLF line endings. Each
// completed line goes through `emit`; trailing partial data is held until the
// next chunk or until flush() runs at process close.
function makeLineSplitter(emit: (line: string, level: BuildLogLevel) => void) {
  const buf: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };
  return {
    feed(chunk: Buffer, kind: 'stdout' | 'stderr') {
      buf[kind] += chunk.toString();
      let nl: number;
      while ((nl = buf[kind].indexOf('\n')) !== -1) {
        const line = buf[kind].slice(0, nl).replace(/\r$/, '');
        buf[kind] = buf[kind].slice(nl + 1);
        if (line.length > 0) emit(line, kind);
      }
    },
    flush() {
      for (const k of ['stdout', 'stderr'] as const) {
        if (buf[k].length > 0) {
          emit(buf[k], k);
          buf[k] = '';
        }
      }
    },
  };
}
