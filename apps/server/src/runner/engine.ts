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
import { isCancelled, trackChild } from './coordinator';
import { runCheckout } from './steps/checkout';
import { runPull } from './steps/pull';
import { runShell } from './steps/shell';
import { runUnityBatch } from './steps/unityBatch';
import { runHttpRequest } from './steps/httpRequest';
import { runSlackNotify } from './steps/slackNotify';
import { runDiscordNotify } from './steps/discordNotify';
import { runAiPrompt } from './steps/aiPrompt';

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
  aiPrompt: runAiPrompt,
};

interface DagNode {
  id: string;
  type: StepType;
  data: Record<string, unknown>;
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

  const fullOrder = topologicalOrder(pipeline);
  let order = fullOrder;
  if (fromNodeId) {
    const allowed = descendantsOf(pipeline, fromNodeId);
    order = fullOrder.filter((n) => allowed.has(n.id));
    persist(
      'info',
      `Restart-from: ${fromNodeId} (${order.length} of ${fullOrder.length} steps)`,
      null,
      null,
    );
  }
  if (order.length === 0) persist('info', 'Pipeline has no nodes.', null, null);

  let success = true;
  let cancelled = false;
  for (const node of order) {
    if (isCancelled(build.id)) {
      cancelled = true;
      break;
    }
    const runner = RUNNERS[node.type];

    eventBus.publish({
      type: 'buildStepStarted',
      buildId: build.id,
      pipelineId: pipeline.id,
      nodeId: node.id,
      stepType: node.type,
    });
    persist('system', `▶ step started`, node.id, node.type);

    const ctx = makeStepContext(build, project, node, persist);
    const aiFix = readAiAutoFix(node.data);
    const maxAttempts = aiFix?.enabled ? Math.max(1, aiFix.maxRetries ?? 3) + 1 : 1;
    let stepOk = false;
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (attempt > 1) {
        persist(
          'system',
          `↻ retry ${attempt - 1}/${maxAttempts - 1} after AI fix`,
          node.id,
          node.type,
        );
      }
      try {
        await runner(ctx, node.data);
        if (isCancelled(build.id)) {
          cancelled = true;
          break;
        }
        stepOk = true;
        break;
      } catch (err) {
        lastErr = err;
        if (isCancelled(build.id)) {
          cancelled = true;
          break;
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
          // fall through to next attempt
        }
      }
    }

    if (cancelled) {
      eventBus.publish({
        type: 'buildStepFinished',
        buildId: build.id,
        pipelineId: pipeline.id,
        nodeId: node.id,
        stepType: node.type,
        status: 'failed',
      });
      const cancelMsg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'cancelled');
      persist('system', `✖ step cancelled (${cancelMsg})`, node.id, node.type);
      break;
    }
    if (stepOk) {
      persist('success', '✔ step ok', node.id, node.type);
      eventBus.publish({
        type: 'buildStepFinished',
        buildId: build.id,
        pipelineId: pipeline.id,
        nodeId: node.id,
        stepType: node.type,
        status: 'success',
      });
    } else {
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr ?? 'unknown error');
      persist(
        'failure',
        `✖ step failed after ${maxAttempts} attempt${maxAttempts === 1 ? '' : 's'}: ${msg}`,
        node.id,
        node.type,
      );
      eventBus.publish({
        type: 'buildStepFinished',
        buildId: build.id,
        pipelineId: pipeline.id,
        nodeId: node.id,
        stepType: node.type,
        status: 'failed',
      });
      success = false;
      break;
    }
  }

  const finalStatus = cancelled ? 'cancelled' : success ? 'success' : 'failed';
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
): StepContext {
  return {
    project,
    build,
    log(message, level = 'info') {
      persist(level, message, node.id, node.type);
    },
    attachProcess(child) {
      trackChild(build.id, child);
      const splitter = makeLineSplitter((line, level) => persist(level, line, node.id, node.type));
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
