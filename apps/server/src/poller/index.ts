import { getPipeline, listPipelines } from '../store/pipelines';
import { getProject } from '../store/projects';
import {
  getLastSeenSha,
  getPollerKv,
  setLastSeenSha,
  setPollerKv,
} from '../store/state';
import {
  changedPathsBetween,
  fetchAll,
  getRemoteHeadSha,
  listCommits,
  listTagsWithSha,
} from '../git/operations';
import { eventBus } from '../events/bus';
import { logger } from '../logger';
import { getTelegramConfig, isTelegramEnabled, sendApprovalRequest } from '../runner/telegramBot';
import { createBuild, getBuild, updateBuildStatus } from '../store/builds';
import {
  cancelBuild,
  enqueueBuild,
  listInflightBuildsForPipeline,
} from '../runner/coordinator';
import {
  matchesCron,
  matchesTagPattern,
  parseCron,
  pathsMatchFilter,
} from './triggers';

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

// Cron evaluation runs out-of-band from the branch poller so per-minute
// schedules don't depend on a project's intervalSec. One global tick every
// 60s walks all pipelines that declare a cronExpr.
let cronTimer: NodeJS.Timeout | null = null;

export function startPoller(): void {
  syncSchedules();
  startCronLoop();
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

function startCronLoop(): void {
  if (cronTimer) return;
  // Fire on the next-minute boundary then every 60s — so a cron entry for
  // "0 9 * * *" is at most ~1 minute late, not ~30 seconds early.
  const now = Date.now();
  const msUntilNextMinute = 60_000 - (now % 60_000);
  setTimeout(() => {
    void cronTick().catch((err) => logger.warn({ err: String(err) }, 'cron tick failed'));
    cronTimer = setInterval(() => {
      void cronTick().catch((err) => logger.warn({ err: String(err) }, 'cron tick failed'));
    }, 60_000);
  }, msUntilNextMinute);
}

async function cronTick(): Promise<void> {
  // Truncate to the minute so re-firing within the same minute is a no-op.
  const now = new Date();
  now.setUTCSeconds(0, 0);
  const ts = String(now.getTime());
  for (const pipeline of listPipelines()) {
    if (!pipeline.watch.cronExpr || pipeline.watch.cronExpr.trim().length === 0) continue;
    const spec = parseCron(pipeline.watch.cronExpr);
    if (!spec) {
      logger.warn(
        { pipelineId: pipeline.id, cronExpr: pipeline.watch.cronExpr },
        'invalid cronExpr — ignoring',
      );
      continue;
    }
    if (!matchesCron(spec, now)) continue;
    const kvKey = `cron-last-fired:${pipeline.id}`;
    if (getPollerKv(kvKey) === ts) continue; // already fired this minute
    setPollerKv(kvKey, ts);
    const project = getProject(pipeline.projectId);
    if (!project) continue;
    logger.info(
      { pipelineId: pipeline.id, cronExpr: pipeline.watch.cronExpr },
      'cron: firing scheduled build',
    );
    await maybeCancelInFlight(pipeline.id, pipeline.watch.cancelInProgressOnNewCommit ?? false);
    const head = (await getRemoteHeadSha(project.path, pipeline.watch.branch)) ?? '';
    const build = createBuild({
      pipelineId: pipeline.id,
      projectId: project.id,
      triggerSha: head,
      triggerBranch: pipeline.watch.branch,
    });
    void enqueueBuild({ pipeline, project, build }).catch((err) => {
      logger.error({ err, pipelineId: pipeline.id }, 'cron-triggered pipeline crashed');
    });
  }
}

async function runOnce(entry: ScheduledWatch): Promise<void> {
  const project = getProject(entry.projectId);
  if (!project) return;
  try {
    await fetchAll(project.path);
    const head = await getRemoteHeadSha(project.path, entry.branch);
    if (!head) {
      logger.info({ project: project.name, branch: entry.branch }, 'poll (no remote ref)');
      return;
    }

    const lastSeen = getLastSeenSha(project.id, entry.branch);
    const isNew = lastSeen !== null && lastSeen !== head;
    logger.info(
      {
        project: project.name,
        branch: entry.branch,
        head: head.slice(0, 7),
        change: isNew ? `${lastSeen!.slice(0, 7)} → ${head.slice(0, 7)}` : undefined,
      },
      isNew ? 'poll: new commits' : 'poll',
    );

    eventBus.publish({
      type: 'pollerTick',
      projectId: project.id,
      branch: entry.branch,
      head,
    });

    // Tag-pattern triggers: poll tags every tick (we already fetched). Cheap
    // since the working tree's already populated. Each (pipeline,tag) pair
    // is fired at most once.
    await maybeFireTagTriggers(entry.pipelineId, project.path);

    if (lastSeen === head) return;

    if (lastSeen === null) {
      // First observation: set the baseline silently to avoid a startup notification storm.
      setLastSeenSha(project.id, entry.branch, head);
      return;
    }

    const commits = await listCommits(project.path, head, 50, lastSeen);
    setLastSeenSha(project.id, entry.branch, head);
    if (commits.length === 0) return;

    // Path-filter check: if the pipeline has pathFilter set and none of the
    // changed files match, surface the new commits as a pollerTick but
    // *don't* fire builds / approvals. Caller still sees the commits.
    const pipeline = getPipeline(entry.pipelineId);
    let pathFilterMatched = true;
    if (pipeline?.watch.pathFilter && pipeline.watch.pathFilter.trim().length > 0) {
      const changed = await changedPathsBetween(project.path, lastSeen, head);
      pathFilterMatched = pathsMatchFilter(changed, pipeline.watch.pathFilter);
      logger.info(
        {
          pipelineId: pipeline.id,
          changedCount: changed.length,
          matched: pathFilterMatched,
        },
        'poll: path filter evaluated',
      );
    }

    eventBus.publish({
      type: 'newCommit',
      projectId: project.id,
      pipelineId: entry.pipelineId,
      branch: entry.branch,
      commits,
    });

    if (!pathFilterMatched) return;

    // Cancel previous in-flight build for this pipeline if the operator
    // opted into rolling-build mode.
    if (pipeline?.watch.cancelInProgressOnNewCommit) {
      await maybeCancelInFlight(entry.pipelineId, true);
    }

    // If this pipeline opted into Telegram approvals + a bot is wired up,
    // ask via Telegram with Build / Skip inline buttons.
    if (pipeline?.watch.telegramApprovals && isTelegramEnabled()) {
      const cfg = getTelegramConfig();
      if (cfg && cfg.defaultChatId) {
        const head4 = commits[0]!.shortSha;
        const subj = commits[0]!.subject.slice(0, 80);
        const more = commits.length > 1 ? ` (+${commits.length - 1} more)` : '';
        await sendApprovalRequest({
          chatId: cfg.defaultChatId,
          pipelineId: entry.pipelineId,
          text:
            `🔔 <b>${escapeHtml(project.name)}</b> · ${commits.length} new commit` +
            `${commits.length === 1 ? '' : 's'} on <code>${escapeHtml(entry.branch)}</code>\n` +
            `<i>pipeline:</i> ${escapeHtml(pipeline.name)}\n` +
            `<code>${head4}</code> ${escapeHtml(subj)}${more}\n\n` +
            `Build now?`,
        });
      }
    }
  } catch (err) {
    logger.warn({ err: String(err), project: project.path, branch: entry.branch }, 'poll failed');
  }
}

async function maybeFireTagTriggers(pipelineId: string, projectPath: string): Promise<void> {
  const pipeline = getPipeline(pipelineId);
  if (!pipeline) return;
  const pattern = pipeline.watch.tagPattern;
  if (!pattern || pattern.trim().length === 0) return;
  const tags = await listTagsWithSha(projectPath);
  if (tags.length === 0) return;
  const project = getProject(pipeline.projectId);
  if (!project) return;
  for (const { tag, sha } of tags) {
    if (!matchesTagPattern(tag, pattern)) continue;
    const kvKey = `tag-fired:${pipelineId}:${tag}`;
    const seen = getPollerKv(kvKey);
    if (seen === sha) continue; // already fired for this tag@sha
    setPollerKv(kvKey, sha);
    logger.info({ pipelineId, tag, sha: sha.slice(0, 7) }, 'tag-trigger: firing build');
    if (pipeline.watch.cancelInProgressOnNewCommit) {
      await maybeCancelInFlight(pipeline.id, true);
    }
    const build = createBuild({
      pipelineId,
      projectId: project.id,
      triggerSha: sha,
      triggerBranch: `refs/tags/${tag}`,
    });
    void enqueueBuild({ pipeline, project, build }).catch((err) => {
      logger.error({ err, pipelineId, tag }, 'tag-triggered pipeline crashed');
    });
  }
}

async function maybeCancelInFlight(pipelineId: string, enabled: boolean): Promise<void> {
  if (!enabled) return;
  const ids = listInflightBuildsForPipeline(pipelineId);
  for (const buildId of ids) {
    const { wasRunning } = cancelBuild(buildId);
    if (!wasRunning) {
      updateBuildStatus(buildId, 'cancelled');
      const fresh = getBuild(buildId);
      if (fresh) eventBus.publish({ type: 'buildFinished', build: fresh });
    }
    logger.info({ pipelineId, buildId, wasRunning }, 'rolling-build: cancelled in-flight build');
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
