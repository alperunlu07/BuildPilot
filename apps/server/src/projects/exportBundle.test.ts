import { describe, it, expect } from 'vitest';
import type { Pipeline, ProjectBundlePayload } from '@buildpilot/shared-types';
import {
  decryptEnvelope,
  encryptPayload,
  nextAvailableName,
  scanReferences,
} from './exportBundle';

function pipeline(nodes: Pipeline['nodes']): Pipeline {
  return {
    id: 'pl-test',
    projectId: 'p-test',
    name: 'test',
    watch: { branch: 'main', intervalSec: 30, autoTrigger: 'off' },
    nodes,
    edges: [],
    createdAt: 0,
    updatedAt: 0,
    lastBuiltSha: null,
    matrix: null,
    laneId: 'default',
    priority: 100,
  };
}

describe('scanReferences', () => {
  it('collects secret names from string fields', () => {
    const p = pipeline([
      {
        id: 'n1',
        type: 'shell',
        position: { x: 0, y: 0 },
        data: { command: 'echo ${{ secrets.API_KEY }}' },
      },
    ]);
    const refs = scanReferences([p]);
    expect([...refs.secretNames]).toEqual(['API_KEY']);
    expect(refs.fileNames.size).toBe(0);
    expect(refs.hostIds.size).toBe(0);
  });

  it('collects file names from nested object/array fields', () => {
    const p = pipeline([
      {
        id: 'n1',
        type: 'shell',
        position: { x: 0, y: 0 },
        data: {
          env: { CERT_PATH: '${{ files.IOS_CERT }}' },
          args: ['--key', '${{ files.SIGNING_KEY }}'],
        },
      },
    ]);
    const refs = scanReferences([p]);
    expect([...refs.fileNames].sort()).toEqual(['IOS_CERT', 'SIGNING_KEY']);
  });

  it('collects hostIds from known fields only', () => {
    const p = pipeline([
      {
        id: 'n1',
        type: 'remoteSsh',
        position: { x: 0, y: 0 },
        data: {
          hostId: 'host-abc',
          targetHostId: 'host-def',
          // Not a host id field — must NOT be collected.
          otherId: 'host-xyz',
        },
      },
    ]);
    const refs = scanReferences([p]);
    expect([...refs.hostIds].sort()).toEqual(['host-abc', 'host-def']);
  });

  it('handles multiple references in one string + dedupes', () => {
    const p = pipeline([
      {
        id: 'n1',
        type: 'shell',
        position: { x: 0, y: 0 },
        data: {
          script:
            'echo ${{ secrets.API_KEY }} ${{ secrets.API_KEY }} ${{ secrets.OTHER }}',
        },
      },
    ]);
    const refs = scanReferences([p]);
    expect([...refs.secretNames].sort()).toEqual(['API_KEY', 'OTHER']);
  });

  it('returns empty sets when nothing is referenced', () => {
    const p = pipeline([
      {
        id: 'n1',
        type: 'pull',
        position: { x: 0, y: 0 },
        data: { branch: 'main' },
      },
    ]);
    const refs = scanReferences([p]);
    expect(refs.secretNames.size).toBe(0);
    expect(refs.fileNames.size).toBe(0);
    expect(refs.hostIds.size).toBe(0);
  });
});

describe('encryptPayload / decryptEnvelope roundtrip', () => {
  const samplePayload: ProjectBundlePayload = {
    version: 1,
    exportedAt: 1748000000000,
    sourceProjectId: 'p-src',
    project: {
      name: 'MyApp',
      path: '/tmp/myapp',
      defaultBranch: 'main',
      vcsProvider: null,
      vcsRepo: null,
      vcsCredentialId: null,
    },
    pipelines: [],
    secrets: [{ name: 'API_KEY', value: 'hunter2' }],
    vaultFiles: [],
    vcsCredentials: [],
    hosts: [],
  };

  it('round-trips a payload through encrypt → decrypt', () => {
    const envelope = encryptPayload(samplePayload, 'correct-passphrase');
    const recovered = decryptEnvelope(envelope, 'correct-passphrase');
    expect(recovered).toEqual(samplePayload);
  });

  it('produces a different ciphertext each invocation (random iv + salt)', () => {
    const a = encryptPayload(samplePayload, 'pass-twelve-chars');
    const b = encryptPayload(samplePayload, 'pass-twelve-chars');
    expect(a.ciphertextBase64).not.toBe(b.ciphertextBase64);
    expect(a.saltBase64).not.toBe(b.saltBase64);
    expect(a.ivBase64).not.toBe(b.ivBase64);
  });

  it('throws on wrong passphrase', () => {
    const envelope = encryptPayload(samplePayload, 'rightpass1');
    expect(() => decryptEnvelope(envelope, 'wrongpass1')).toThrow(/decryption failed/i);
  });

  it('throws on tampered ciphertext (GCM auth tag mismatch)', () => {
    const envelope = encryptPayload(samplePayload, 'rightpass1');
    const buf = Buffer.from(envelope.ciphertextBase64, 'base64');
    // Flip a single bit on the first byte so the GCM auth tag stops matching.
    buf[0] = (buf[0] ?? 0) ^ 0xff;
    const tampered = { ...envelope, ciphertextBase64: buf.toString('base64') };
    expect(() => decryptEnvelope(tampered, 'rightpass1')).toThrow();
  });

  it('rejects short passphrases on encrypt', () => {
    expect(() => encryptPayload(samplePayload, 'short')).toThrow(/at least 8 characters/i);
  });

  it('rejects envelopes with the wrong kind/version', () => {
    const envelope = encryptPayload(samplePayload, 'rightpass1');
    expect(() =>
      decryptEnvelope({ ...envelope, kind: 'other' as never }, 'rightpass1'),
    ).toThrow(/not a buildpilot project bundle/i);
    expect(() =>
      decryptEnvelope({ ...envelope, version: 2 as never }, 'rightpass1'),
    ).toThrow(/unsupported bundle version/i);
  });
});

describe('nextAvailableName', () => {
  it('returns the base name when free', () => {
    expect(nextAvailableName('foo', new Set())).toBe('foo');
  });

  it('walks the _N suffix until a free slot', () => {
    expect(nextAvailableName('foo', new Set(['foo']))).toBe('foo_2');
    expect(nextAvailableName('foo', new Set(['foo', 'foo_2']))).toBe('foo_3');
    expect(nextAvailableName('foo', new Set(['foo', 'foo_2', 'foo_3', 'foo_4']))).toBe('foo_5');
  });
});
