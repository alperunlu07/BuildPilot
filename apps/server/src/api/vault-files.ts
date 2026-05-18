import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { VAULT_FILE_MAX_BYTES } from '@buildpilot/shared-types';
import {
  createVaultFile,
  deleteVaultFile,
  getVaultFileMeta,
  listVaultFiles,
  readVaultFileContents,
} from '../store/vaultFiles';

// Cluster 11.B — file vault CRUD. Upload accepts a JSON body so we can
// reuse the existing JSON parser (the dashboard is the only client; a
// multipart parser is a future-friendly addition). Contents are sent as
// base64 to keep arbitrary bytes round-tripping safely.

const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const uploadSchema = z.object({
  name: z.string().regex(NAME_RE),
  filename: z.string().min(1),
  mime: z.string().min(1).default('application/octet-stream'),
  // base64-encoded bytes. We validate the decoded size against the cap.
  contentBase64: z.string().min(1),
});

export async function vaultFilesRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/vault-files', async () => listVaultFiles());

  app.get('/api/vault-files/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    const meta = getVaultFileMeta(name);
    if (!meta) return reply.code(404).send({ error: 'not found' });
    return meta;
  });

  // Download — returns the decrypted bytes with the original filename so
  // the browser can save the artefact verbatim.
  app.get('/api/vault-files/:name/download', async (req, reply) => {
    const { name } = req.params as { name: string };
    const meta = getVaultFileMeta(name);
    if (!meta) return reply.code(404).send({ error: 'not found' });
    const buf = readVaultFileContents(name);
    return reply
      .header('content-type', meta.mime || 'application/octet-stream')
      .header(
        'content-disposition',
        `attachment; filename="${meta.filename.replace(/[^A-Za-z0-9._-]/g, '_')}"`,
      )
      .send(buf);
  });

  // Override the default 1 MiB body limit on the upload route so a
  // multi-megabyte base64 payload (which expands ~33%) fits comfortably.
  app.post('/api/vault-files', { bodyLimit: VAULT_FILE_MAX_BYTES * 2 }, async (req, reply) => {
    const parsed = uploadSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.flatten() });
    if (getVaultFileMeta(parsed.data.name)) {
      return reply.code(409).send({ error: 'a vault file with that name already exists' });
    }
    let buf: Buffer;
    try {
      buf = Buffer.from(parsed.data.contentBase64, 'base64');
    } catch {
      return reply.code(400).send({ error: 'contentBase64 is not valid base64' });
    }
    if (buf.length === 0) {
      return reply.code(400).send({ error: 'file contents decoded to zero bytes' });
    }
    if (buf.length > VAULT_FILE_MAX_BYTES) {
      return reply
        .code(413)
        .send({ error: `file exceeds ${VAULT_FILE_MAX_BYTES} byte cap` });
    }
    try {
      const created = createVaultFile({
        name: parsed.data.name,
        filename: parsed.data.filename,
        mime: parsed.data.mime,
        content: buf,
      });
      return created;
    } catch (err) {
      return reply
        .code(400)
        .send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.delete('/api/vault-files/:name', async (req, reply) => {
    const { name } = req.params as { name: string };
    if (!deleteVaultFile(name)) return reply.code(404).send({ error: 'not found' });
    return { ok: true };
  });
}
