import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  Build,
  BuildLogLevel,
  Project,
} from '@buildpilot/shared-types';
import type { StepContext } from '../runner/engine';
import { runSlackNotify } from '../runner/steps/slackNotify';
import { runDiscordNotify } from '../runner/steps/discordNotify';
import { runTelegramNotify } from '../runner/steps/telegramNotify';
import { runTeamsNotify } from '../runner/steps/teamsNotify';
import { runEmailNotify } from '../runner/steps/emailNotify';
import { runHttpRequest } from '../runner/steps/httpRequest';
import { logger } from '../logger';

// /api/test-notify — fire a single notify step with the supplied data and
// report the result inline. Mounted under the same prefix used by the rest
// of the API so the dashboard can reach it via the existing /api proxy.
//
// We deliberately reuse the production step runners rather than hand-rolling
// a duplicate happy-path: identical validation, identical masking, identical
// failure messages. That way a "Send test" button is a true preview of what
// the pipeline will do at run-time.

type SupportedStepType =
  | 'slackNotify'
  | 'discordNotify'
  | 'telegramNotify'
  | 'teamsNotify'
  | 'emailNotify'
  | 'httpRequest';

const SUPPORTED: ReadonlySet<SupportedStepType> = new Set<SupportedStepType>([
  'slackNotify',
  'discordNotify',
  'telegramNotify',
  'teamsNotify',
  'emailNotify',
  'httpRequest',
]);

const RUNNERS: Record<SupportedStepType, (ctx: StepContext, data: Record<string, unknown>) => Promise<void>> = {
  slackNotify: runSlackNotify,
  discordNotify: runDiscordNotify,
  telegramNotify: runTelegramNotify,
  teamsNotify: runTeamsNotify,
  emailNotify: runEmailNotify,
  httpRequest: runHttpRequest,
};

const requestSchema = z.object({
  stepType: z.string(),
  data: z.record(z.unknown()).optional(),
});

// Synthetic project/build pair so the step runner can call ctx.project /
// ctx.build without us creating database rows for a throwaway test. The
// runners we expose here only use ctx.log; the synthetic objects exist
// purely to keep TypeScript happy.
function mockProject(): Project {
  return {
    id: '__test_project__',
    name: '(test channel)',
    path: '/tmp',
    defaultBranch: 'main',
    createdAt: Date.now(),
  };
}

function mockBuild(): Build {
  return {
    id: randomUUID(),
    pipelineId: '__test_pipeline__',
    projectId: '__test_project__',
    triggerSha: '0000000000000000000000000000000000000000',
    triggerBranch: 'main',
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    log: '',
  };
}

// Capture every ctx.log() into a list of lines we return alongside the
// pass/fail flag. The dashboard renders these inline so the user can see
// what was sent and what came back.
interface CapturedLine {
  level: BuildLogLevel;
  message: string;
}

function makeMockContext(lines: CapturedLine[]): StepContext {
  const project = mockProject();
  const build = mockBuild();
  return {
    project,
    build,
    nodeId: 'test-notify-mock',
    log(message: string, level: BuildLogLevel = 'info'): void {
      lines.push({ level, message });
    },
    // No-op: notify steps never spawn child processes. If a future step type
    // does, the test endpoint will need to attach a logger to the child too —
    // for now we just ignore it.
    attachProcess(): void {
      // intentionally empty
    },
  };
}

export async function testNotifyRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/test-notify', async (req, reply) => {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: parsed.error.flatten() });
    }
    const stepType = parsed.data.stepType as SupportedStepType;
    if (!SUPPORTED.has(stepType)) {
      return reply.code(400).send({
        ok: false,
        error: `unsupported stepType "${stepType}". Allowed: ${[...SUPPORTED].join(', ')}`,
      });
    }
    const data = parsed.data.data ?? {};
    const runner = RUNNERS[stepType];
    const lines: CapturedLine[] = [];
    const ctx = makeMockContext(lines);
    try {
      await runner(ctx, data);
      logger.info({ stepType }, 'test-notify: success');
      return reply.send({ ok: true, lines });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ stepType, err: msg }, 'test-notify: failed');
      return reply.code(200).send({ ok: false, error: msg, lines });
    }
  });
}
