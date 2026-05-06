import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import type { S3UploadStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MiB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GiB`;
}

async function sha256(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('data', (c) => h.update(c));
    stream.on('end', () => resolve(h.digest('hex')));
    stream.on('error', reject);
  });
}

function archiveFormat(name: string): string {
  const n = name.toLowerCase();
  if (n.endsWith('.tar.zst') || n.endsWith('.zst')) return 'tar.zst';
  if (n.endsWith('.tar.gz') || n.endsWith('.tgz')) return 'tar.gz';
  if (n.endsWith('.zip')) return 'zip';
  if (n.endsWith('.rar')) return 'rar';
  return 'binary';
}

function guessVersion(name: string): string {
  const m = name.match(/(\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.]+)?)/);
  return m ? m[1]! : `v${Math.floor(Date.now() / 1000)}`;
}

function contentTypeFor(fmt: string): string | undefined {
  if (fmt === 'zip') return 'application/zip';
  if (fmt === 'tar.zst') return 'application/zstd';
  if (fmt === 'tar.gz') return 'application/gzip';
  return undefined;
}

export async function runS3Upload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<S3UploadStepData>;
  if (!d.accessKeyId) throw new Error('s3Upload: missing accessKeyId');
  if (!d.secretAccessKey) throw new Error('s3Upload: missing secretAccessKey');
  if (!d.region) throw new Error('s3Upload: missing region');
  if (!d.bucket) throw new Error('s3Upload: missing bucket');
  if (!d.localPath) throw new Error('s3Upload: missing localPath');
  if (!d.key) throw new Error('s3Upload: missing key');

  const localAbs = isAbsolute(d.localPath) ? d.localPath : join(ctx.project.path, d.localPath);
  const stat = await fs.stat(localAbs);
  if (!stat.isFile()) throw new Error(`s3Upload: not a file: ${localAbs}`);

  const fileName = basename(localAbs);
  const fmt = archiveFormat(fileName);

  ctx.log(`computing sha256 of ${fileName} (${fmtBytes(stat.size)})…`);
  const sha = await sha256(localAbs);
  ctx.log(`sha256: ${sha}`, 'stdout');

  const client = new S3Client({
    region: d.region,
    credentials: { accessKeyId: d.accessKeyId, secretAccessKey: d.secretAccessKey },
  });

  ctx.log(`upload → s3://${d.bucket}/${d.key}`);

  const ct = contentTypeFor(fmt);
  const upload = new Upload({
    client,
    queueSize: 8,
    partSize: 64 * 1024 * 1024,
    params: {
      Bucket: d.bucket,
      Key: d.key,
      Body: createReadStream(localAbs),
      StorageClass: d.storageClass ?? 'STANDARD',
      ContentType: ct,
      Metadata: {
        sha256: sha,
        ...(d.manifestChannel ? { channel: d.manifestChannel } : {}),
        ...(d.manifestPlatform ? { platform: d.manifestPlatform } : {}),
      },
    },
  });

  let lastReport = 0;
  upload.on('httpUploadProgress', (p) => {
    const now = Date.now();
    if (now - lastReport > 2000 && p.loaded != null && p.total != null) {
      const pct = ((p.loaded / p.total) * 100).toFixed(1);
      ctx.log(
        `transferred ${fmtBytes(p.loaded)} / ${fmtBytes(p.total)} (${pct}%)`,
        'stdout',
      );
      lastReport = now;
    }
  });
  await upload.done();
  ctx.log(`upload complete`, 'success');

  let url = `s3://${d.bucket}/${d.key}`;
  const expires = Math.max(60, Math.min(7 * 24 * 3600, d.presignedExpiresSec ?? 7 * 24 * 3600));
  if (asBool(d.makePresignedUrl)) {
    url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: d.bucket, Key: d.key }),
      { expiresIn: expires },
    );
    ctx.log(`presigned URL valid for ${expires}s`, 'info');
  }

  if (d.manifestKey && d.manifestKey.trim().length > 0) {
    const manifest = {
      channel: d.manifestChannel ?? 'stable',
      platform: d.manifestPlatform ?? 'unknown',
      version: guessVersion(fileName),
      url,
      sha256: sha,
      size: stat.size,
      archive_format: fmt,
      released_at: new Date().toISOString(),
    };
    await client.send(
      new PutObjectCommand({
        Bucket: d.bucket,
        Key: d.manifestKey,
        Body: JSON.stringify(manifest, null, 2),
        ContentType: 'application/json',
      }),
    );
    ctx.log(`manifest → s3://${d.bucket}/${d.manifestKey}`, 'success');
  }
}
