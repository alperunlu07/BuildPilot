import type { Build, Pipeline, Project, StepType } from '@buildpilot/shared-types';
import { appendBuildLog, updateBuildStatus } from '../store/builds';
import { setPipelineLastBuiltSha } from '../store/pipelines';
import { eventBus } from '../events/bus';
import { runCheckout } from './steps/checkout';
import { runPull } from './steps/pull';
import { runShell } from './steps/shell';
import { runUnityBatch } from './steps/unityBatch';

export interface StepContext {
  project: Project;
  build: Build;
  log(chunk: string): void;
}

type StepRunner = (ctx: StepContext, data: Record<string, unknown>) => Promise<void>;

const RUNNERS: Record<StepType, StepRunner> = {
  checkout: runCheckout,
  pull: runPull,
  shell: runShell,
  unityBatch: runUnityBatch,
};

interface DagNode {
  id: string;
  type: StepType;
  data: Record<string, unknown>;
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
}): Promise<void> {
  const { pipeline, project, build } = args;

  const append = (chunk: string) => {
    appendBuildLog(build.id, chunk);
    eventBus.publish({ type: 'buildLog', buildId: build.id, chunk });
  };

  updateBuildStatus(build.id, 'running');
  build.status = 'running';
  eventBus.publish({ type: 'buildStarted', build });
  append(`▶ Pipeline "${pipeline.name}" started @ ${new Date().toISOString()}\n`);
  append(`  trigger sha=${build.triggerSha} branch=${build.triggerBranch}\n\n`);

  const order = topologicalOrder(pipeline);
  if (order.length === 0) {
    append('⚠ No nodes in pipeline.\n');
  }

  let success = true;
  for (const node of order) {
    const runner = RUNNERS[node.type];
    append(`── [${node.type}] ${node.id} ──\n`);
    try {
      await runner({ project, build, log: append }, node.data);
      append(`✔ ${node.type} ok\n\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      append(`✖ ${node.type} failed: ${msg}\n\n`);
      success = false;
      break;
    }
  }

  const finalStatus = success ? 'success' : 'failed';
  updateBuildStatus(build.id, finalStatus);
  if (success && build.triggerSha) {
    setPipelineLastBuiltSha(pipeline.id, build.triggerSha);
  }

  build.status = finalStatus;
  build.finishedAt = Date.now();
  append(`\n${success ? '✔' : '✖'} Pipeline ${finalStatus}.\n`);
  eventBus.publish({ type: 'buildFinished', build });
}
