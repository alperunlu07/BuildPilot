import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  createNodeTemplate,
  deleteNodeTemplate,
  getNodeTemplate,
  listNodeTemplates,
  updateNodeTemplate,
} from '../store/nodeTemplates';
import { eventBus } from '../events/bus';

const stepTypes = [
  'checkout',
  'pull',
  'shell',
  'unityBatch',
  'httpRequest',
  'slackNotify',
  'discordNotify',
  'telegramNotify',
  'aiPrompt',
  'artifact',
  'remoteSsh',
  'sftpUpload',
  'xcodebuild',
  'gitMerge',
  's3Upload',
  'testflightUpload',
  'keychainUnlock',
  'provisioningProfileInstall',
  'notarize',
  'stapleNotarization',
  'fastlaneMatch',
  'cocoapodsInstall',
  'swiftPackageResolve',
  'dsymUpload',
  'xcresultParse',
  'xcodeSelect',
  'ensureGitStatusClean',
  'incrementBuildNumber',
  'getBuildNumber',
  'changelogFromGitCommits',
  'updateInfoPlist',
  'swiftlint',
  'swiftFormat',
] as const;

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  baseStepType: z.enum(stepTypes),
  data: z.record(z.string(), z.unknown()),
});

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  baseStepType: z.enum(stepTypes).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export async function nodeTemplatesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/node-templates', async () => listNodeTemplates());

  app.get('/api/node-templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const t = getNodeTemplate(id);
    if (!t) return reply.code(404).send({ error: 'not found' });
    return t;
  });

  app.post('/api/node-templates', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const created = createNodeTemplate(parsed.data);
    eventBus.publish({ type: 'nodeTemplateChanged', templateId: created.id, action: 'created' });
    return created;
  });

  app.patch('/api/node-templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    const updated = updateNodeTemplate(id, parsed.data);
    if (!updated) return reply.code(404).send({ error: 'not found' });
    eventBus.publish({ type: 'nodeTemplateChanged', templateId: id, action: 'updated' });
    return updated;
  });

  app.delete('/api/node-templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!getNodeTemplate(id)) return reply.code(404).send({ error: 'not found' });
    deleteNodeTemplate(id);
    eventBus.publish({ type: 'nodeTemplateChanged', templateId: id, action: 'deleted' });
    return { ok: true };
  });
}
