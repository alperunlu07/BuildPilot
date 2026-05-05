import { listPipelines } from '../store/pipelines';
import { getProject } from '../store/projects';
import { getLastSeenSha, setLastSeenSha } from '../store/state';
import { fetchAll, getRemoteHeadSha, listCommits } from '../git/operations';
import { eventBus } from '../events/bus';
import { logger } from '../logger';

interface ScheduledWatch {
  pipelineId: string;
  projectId: string;
  branch: string;
  intervalSec: number;
  timer?: NodeJS.Timeout;
  inFlight: boolean;
}

const scheduled = new Map<string, ScheduledWatch>(); // key = pipelineId + branch

function key(pipelineId: string, branch: string): string {
  return `${pipelineId}::${branch}`;
}

export function startPoller(): void {
  syncSchedules();
  logger.info('poller started');
}

export function reloadSchedules(): void {
  syncSchedules();
}

function syncSchedules(): void {
  const pipelines = listPipelines();
  const wanted = new Set<string>();

  for (const pipeline of pipelines) {
    const k = key(pipeline.id, pipeline.watch.branch);
    wanted.add(k);
    const existing = scheduled.get(k);
    if (!existing) {
      const entry: ScheduledWatch = {
        pipelineId: pipeline.id,
        projectId: pipeline.projectId,
        branch: pipeline.watch.branch,
        intervalSec: pipeline.watch.intervalSec,
        inFlight: false,
      };
      scheduled.set(k, entry);
      schedule(entry);
    } else if (existing.intervalSec !== pipeline.watch.intervalSec) {
      if (existing.timer) clearInterval(existing.timer);
      existing.intervalSec = pipeline.watch.intervalSec;
      schedule(existing);
    }
  }

  for (const [k, entry] of scheduled) {
    if (!wanted.has(k) && entry.timer) {
      clearInterval(entry.timer);
      scheduled.delete(k);
    }
  }
}

function schedule(entry: ScheduledWatch): void {
  const tick = () => {
    if (entry.inFlight) return;
    entry.inFlight = true;
    void runOnce(entry).finally(() => {
      entry.inFlight = false;
    });
  };
  entry.timer = setInterval(tick, entry.intervalSec * 1000);
  // Kick off shortly after scheduling so we don't wait the full interval on boot.
  setTimeout(tick, 1500);
}

async function runOnce(entry: ScheduledWatch): Promise<void> {
  const project = getProject(entry.projectId);
  if (!project) return;
  try {
    await fetchAll(project.path);
    const head = await getRemoteHeadSha(project.path, entry.branch);
    if (!head) return;

    eventBus.publish({
      type: 'pollerTick',
      projectId: project.id,
      branch: entry.branch,
      head,
    });

    const lastSeen = getLastSeenSha(project.id, entry.branch);
    if (lastSeen === head) return;

    if (lastSeen === null) {
      // First observation: set the baseline silently to avoid a startup notification storm.
      setLastSeenSha(project.id, entry.branch, head);
      return;
    }

    const commits = await listCommits(project.path, head, 50, lastSeen);
    setLastSeenSha(project.id, entry.branch, head);
    if (commits.length > 0) {
      eventBus.publish({
        type: 'newCommit',
        projectId: project.id,
        pipelineId: entry.pipelineId,
        branch: entry.branch,
        commits,
      });
    }
  } catch (err) {
    logger.warn({ err: String(err), project: project.path, branch: entry.branch }, 'poll failed');
  }
}
