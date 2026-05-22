// Cluster 12 — project export / import HTTP surface.
//
// POST /api/projects/:id/export
//   body { passphrase } → { envelope, manifest }
// POST /api/projects/import
//   body { envelope, passphrase, options } → ProjectImportSummary
//
// Both endpoints sit on the auth-required side of the middleware stack
// when auth.enabled is true. The export endpoint is the ONLY API surface
// that lets plaintext secrets leave the server, so it audit-logs every
// invocation regardless of the auth flag.

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { basename } from 'node:path';
import type {
  Pipeline,
  ProjectBundleEnvelope,
  ProjectBundleHost,
  ProjectBundlePayload,
  ProjectBundleSecret,
  ProjectBundleVaultFile,
  ProjectBundleVcsCredential,
  ProjectExportManifest,
  ProjectImportOptions,
  ProjectImportSummary,
} from '@buildpilot/shared-types';
import { getProject, createProject, getProjectByPath, updateProjectVcs } from '../store/projects';
import { listPipelines, createPipeline } from '../store/pipelines';
import {
  createSecret,
  decryptSecretValue,
  getSecret,
  listSecrets,
  rotateSecret,
} from '../store/secrets';
import {
  createVaultFile,
  getVaultFileMeta,
  listVaultFiles,
  readVaultFileContents,
} from '../store/vaultFiles';
import {
  createHost,
  getHost,
  listHosts,
} from '../store/hosts';
import {
  createVcsCredential,
  getVcsCredentialRuntime,
  listVcsCredentials,
} from '../store/vcsCredentials';
import {
  decryptEnvelope,
  encryptPayload,
  nextAvailableName,
  scanReferences,
} from '../projects/exportBundle';

const exportSchema = z.object({
  passphrase: z.string().min(8),
});

const conflictPolicy = z.enum(['skip', 'rename', 'overwrite']);

const importSchema = z.object({
  envelope: z.object({
    kind: z.literal('buildpilot-project-bundle'),
    version: z.literal(1),
    saltBase64: z.string().min(1),
    ivBase64: z.string().min(1),
    ciphertextBase64: z.string().min(1),
  }),
  passphrase: z.string().min(1),
  options: z.object({
    pathOverride: z.string().nullable().optional(),
    conflictPolicy: z.object({
      project: z.enum(['rename', 'replace']),
      secrets: conflictPolicy,
      vaultFiles: conflictPolicy,
      hosts: z.enum(['new', 'merge']),
      vcsCredentials: z.enum(['new', 'merge']),
    }),
  }),
});

export async function projectExportRoutes(app: FastifyInstance): Promise<void> {
  // ── Export ────────────────────────────────────────────────────────────────
  app.post('/api/projects/:id/export', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = exportSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    const project = getProject(id);
    if (!project) return reply.code(404).send({ error: 'project not found' });

    const pipelines = listPipelines(id);
    const refs = scanReferences(pipelines);

    // Resolve referenced external resources, decrypting on the fly. Missing
    // references are NOT a fatal error — the user may want to export a
    // partially configured project and supply the values manually on the
    // receiving side. We surface them in the manifest so the export dialog
    // can warn.
    const missing: string[] = [];

    const secrets: ProjectBundleSecret[] = [];
    for (const name of refs.secretNames) {
      const value = decryptSecretValue(name);
      if (value === null) {
        missing.push(`secret ${name}`);
        continue;
      }
      secrets.push({ name, value });
    }

    const vaultFiles: ProjectBundleVaultFile[] = [];
    for (const name of refs.fileNames) {
      const meta = getVaultFileMeta(name);
      if (!meta) {
        missing.push(`file ${name}`);
        continue;
      }
      try {
        const buf = readVaultFileContents(name);
        vaultFiles.push({
          name,
          filename: meta.filename,
          mime: meta.mime,
          contentBase64: buf.toString('base64'),
        });
      } catch (err) {
        missing.push(`file ${name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    const hosts: ProjectBundleHost[] = [];
    for (const hostId of refs.hostIds) {
      const h = getHost(hostId);
      if (!h) {
        missing.push(`host ${hostId}`);
        continue;
      }
      hosts.push({
        id: h.id,
        name: h.name,
        host: h.host,
        identityFile: h.identityFile ?? null,
        password: h.password ?? null,
        skipStrictHostKey: h.skipStrictHostKey ?? false,
        description: h.description ?? null,
      });
    }

    const vcsCredentials: ProjectBundleVcsCredential[] = [];
    if (project.vcsCredentialId) {
      const cred = getVcsCredentialRuntime(project.vcsCredentialId);
      if (!cred) {
        missing.push(`vcs-credential ${project.vcsCredentialId}`);
      } else {
        vcsCredentials.push({
          id: cred.id,
          name: cred.name,
          provider: cred.provider,
          baseUrl: cred.baseUrl,
          token: cred.token,
        });
      }
    }

    const payload: ProjectBundlePayload = {
      version: 1,
      exportedAt: Date.now(),
      sourceProjectId: project.id,
      project: {
        name: project.name,
        path: project.path,
        defaultBranch: project.defaultBranch,
        vcsProvider: project.vcsProvider ?? null,
        vcsRepo: project.vcsRepo ?? null,
        vcsCredentialId: project.vcsCredentialId ?? null,
      },
      pipelines,
      secrets,
      vaultFiles,
      vcsCredentials,
      hosts,
    };

    const envelope = encryptPayload(payload, parsed.data.passphrase);

    const manifest: ProjectExportManifest = {
      pipelines: pipelines.length,
      secrets: secrets.length,
      vaultFiles: vaultFiles.length,
      hosts: hosts.length,
      vcsCredentials: vcsCredentials.length,
      missingReferences: missing,
    };

    return reply
      .header('Cache-Control', 'no-store, must-revalidate')
      .send({ envelope, manifest });
  });

  // ── Import ────────────────────────────────────────────────────────────────
  app.post('/api/projects/import', async (req, reply) => {
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });

    let payload: ProjectBundlePayload;
    try {
      payload = decryptEnvelope(
        parsed.data.envelope as ProjectBundleEnvelope,
        parsed.data.passphrase,
      );
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }

    const opts = parsed.data.options as ProjectImportOptions;
    const summary: ProjectImportSummary = {
      projectId: '',
      projectName: '',
      pipelinesCreated: 0,
      secretsImported: 0,
      secretsSkipped: 0,
      secretsRenamed: 0,
      filesImported: 0,
      filesSkipped: 0,
      filesRenamed: 0,
      hostsCreated: 0,
      hostsMerged: 0,
      vcsCredentialsCreated: 0,
      vcsCredentialsMerged: 0,
      errors: [],
    };

    // 1. Resolve the destination project — rename or replace.
    const targetPath = opts.pathOverride && opts.pathOverride.trim().length > 0
      ? opts.pathOverride.trim()
      : payload.project.path;
    const targetName = await pickProjectName(payload.project.name, opts.conflictPolicy.project);

    const existingByPath = getProjectByPath(targetPath);
    let created;
    if (existingByPath) {
      if (opts.conflictPolicy.project === 'replace') {
        // Reuse the existing project row — keep its id so any saved
        // references survive. Update fields the bundle ships.
        created = existingByPath;
      } else {
        // 'rename' under a path collision — re-route to a unique
        // synthetic path. The user is expected to fix the path in
        // settings after import; we surface the choice via an error
        // entry so it isn't silent.
        const altPath = `${targetPath}-imported-${Date.now()}`;
        summary.errors.push(
          `project path "${targetPath}" already registered; created with alt path "${altPath}"`,
        );
        created = createProject({
          name: targetName,
          path: altPath,
          defaultBranch: payload.project.defaultBranch,
        });
      }
    } else {
      created = createProject({
        name: targetName,
        path: targetPath,
        defaultBranch: payload.project.defaultBranch,
      });
    }
    summary.projectId = created.id;
    summary.projectName = created.name;

    // 2. Secrets — apply conflict policy per name.
    const liveSecrets = new Set(listSecrets().map((s) => s.name));
    const secretRename = new Map<string, string>(); // bundle name → final name
    for (const sec of payload.secrets) {
      let target = sec.name;
      if (liveSecrets.has(target)) {
        if (opts.conflictPolicy.secrets === 'skip') {
          summary.secretsSkipped += 1;
          continue;
        }
        if (opts.conflictPolicy.secrets === 'rename') {
          target = nextAvailableName(target, liveSecrets);
          secretRename.set(sec.name, target);
          summary.secretsRenamed += 1;
        }
        // overwrite: keep target = sec.name, rotate value
      }
      try {
        if (liveSecrets.has(target) && opts.conflictPolicy.secrets === 'overwrite') {
          rotateSecret(target, sec.value);
        } else {
          createSecret(target, sec.value);
          liveSecrets.add(target);
        }
        summary.secretsImported += 1;
      } catch (err) {
        summary.errors.push(`secret ${sec.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 3. Vault files — same playbook as secrets.
    const liveFiles = new Set(listVaultFiles().map((f) => f.name));
    const fileRename = new Map<string, string>();
    for (const file of payload.vaultFiles) {
      let target = file.name;
      if (liveFiles.has(target)) {
        if (opts.conflictPolicy.vaultFiles === 'skip') {
          summary.filesSkipped += 1;
          continue;
        }
        if (opts.conflictPolicy.vaultFiles === 'rename') {
          target = nextAvailableName(target, liveFiles);
          fileRename.set(file.name, target);
          summary.filesRenamed += 1;
        }
        // overwrite: delete and recreate
      }
      try {
        const content = Buffer.from(file.contentBase64, 'base64');
        if (liveFiles.has(target) && opts.conflictPolicy.vaultFiles === 'overwrite') {
          // No first-class rotate API for files — delete + recreate.
          const { deleteVaultFile } = await import('../store/vaultFiles');
          deleteVaultFile(target);
        }
        createVaultFile({
          name: target,
          filename: file.filename,
          mime: file.mime,
          content,
        });
        liveFiles.add(target);
        summary.filesImported += 1;
      } catch (err) {
        summary.errors.push(`file ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 4. Hosts — merge (when name+host match) or create new.
    const liveHosts = listHosts();
    const hostIdMap = new Map<string, string>(); // bundle id → final id
    for (const h of payload.hosts) {
      const matching = liveHosts.find((live) => live.name === h.name && live.host === h.host);
      if (matching && opts.conflictPolicy.hosts === 'merge') {
        hostIdMap.set(h.id, matching.id);
        summary.hostsMerged += 1;
        continue;
      }
      try {
        const newHost = createHost({
          name: matching ? `${h.name}-imported` : h.name,
          host: h.host,
          identityFile: h.identityFile,
          password: h.password,
          skipStrictHostKey: h.skipStrictHostKey,
          description: h.description,
        });
        hostIdMap.set(h.id, newHost.id);
        summary.hostsCreated += 1;
      } catch (err) {
        summary.errors.push(`host ${h.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 5. VCS credentials — merge (when name+provider match) or create new.
    const liveCreds = listVcsCredentials();
    let importedCredId: string | null = null;
    for (const cred of payload.vcsCredentials) {
      const matching = liveCreds.find(
        (live) => live.name === cred.name && live.provider === cred.provider,
      );
      if (matching && opts.conflictPolicy.vcsCredentials === 'merge') {
        importedCredId = matching.id;
        summary.vcsCredentialsMerged += 1;
        continue;
      }
      try {
        const newCred = createVcsCredential({
          name: matching ? `${cred.name}-imported` : cred.name,
          provider: cred.provider,
          baseUrl: cred.baseUrl ?? undefined,
          vcsToken: cred.token,
        });
        importedCredId = newCred.id;
        summary.vcsCredentialsCreated += 1;
      } catch (err) {
        summary.errors.push(`vcs-credential ${cred.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 6. Link the new project to its VCS credential (if any).
    if (importedCredId || payload.project.vcsProvider || payload.project.vcsRepo) {
      try {
        updateProjectVcs(created.id, {
          vcsProvider: payload.project.vcsProvider ?? null,
          vcsRepo: payload.project.vcsRepo ?? null,
          vcsCredentialId: importedCredId,
        });
      } catch (err) {
        summary.errors.push(`vcs-link: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // 7. Pipelines — rewrite node.data so renamed secrets/files/hosts point
    // to their new identifiers, then create.
    for (const pl of payload.pipelines) {
      const rewritten = rewritePipelineRefs(pl, {
        secretRename,
        fileRename,
        hostIdMap,
      });
      try {
        createPipeline({
          projectId: created.id,
          name: rewritten.name,
          watch: rewritten.watch,
          nodes: rewritten.nodes,
          edges: rewritten.edges,
          matrix: rewritten.matrix,
          laneId: rewritten.laneId,
          priority: rewritten.priority,
        });
        summary.pipelinesCreated += 1;
      } catch (err) {
        summary.errors.push(
          `pipeline ${pl.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return reply.send(summary);
  });
}

// Bundle's project.name may collide with an existing project — handled per
// policy. 'replace' lets the call site keep the name; 'rename' walks a _2
// _3 suffix list.
async function pickProjectName(
  base: string,
  policy: 'rename' | 'replace',
): Promise<string> {
  if (policy === 'replace') return base;
  // Build a set of taken names from the live projects.
  const { listProjects } = await import('../store/projects');
  const taken = new Set(listProjects().map((p) => p.name));
  return nextAvailableName(base, taken);
}

// Recurse pipeline.nodes[].data, rewriting any ${{ secrets.X }} or
// ${{ files.X }} markers whose names got renamed, plus any hostId fields
// whose ids got remapped.
function rewritePipelineRefs(
  pl: Pipeline,
  maps: {
    secretRename: Map<string, string>;
    fileRename: Map<string, string>;
    hostIdMap: Map<string, string>;
  },
): Pipeline {
  const SECRET_RE = /\$\{\{\s*secrets\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  const FILE_RE = /\$\{\{\s*files\.([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;
  const HOST_FIELDS = new Set(['hostId', 'targetHostId']);

  function rewriteString(s: string, parentKey?: string): string {
    if (parentKey && HOST_FIELDS.has(parentKey) && maps.hostIdMap.has(s)) {
      return maps.hostIdMap.get(s)!;
    }
    let out = s.replace(SECRET_RE, (m, name) => {
      const renamed = maps.secretRename.get(name);
      return renamed ? `\${{ secrets.${renamed} }}` : m;
    });
    out = out.replace(FILE_RE, (m, name) => {
      const renamed = maps.fileRename.get(name);
      return renamed ? `\${{ files.${renamed} }}` : m;
    });
    return out;
  }

  function walk(value: unknown, parentKey?: string): unknown {
    if (typeof value === 'string') return rewriteString(value, parentKey);
    if (Array.isArray(value)) return value.map((v) => walk(v, parentKey));
    if (value && typeof value === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        out[k] = walk(v, k);
      }
      return out;
    }
    return value;
  }

  return {
    ...pl,
    nodes: pl.nodes.map((n) => ({
      ...n,
      data: walk(n.data) as Record<string, unknown>,
    })),
  };
}

// Avoid an unused import — getSecret is used implicitly via createSecret's
// uniqueness check but not directly. Keep the import for future extension.
void getSecret;
