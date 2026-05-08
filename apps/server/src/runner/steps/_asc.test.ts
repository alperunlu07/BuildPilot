import { generateKeyPairSync, createPublicKey, verify as cryptoVerify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ascErrorMessage, signAscJwt, type AscResponse } from './_asc';

// Generate a fresh P-256 key for each test run so the tests don't depend on
// any committed fixtures and never touch a real ASC key file.
function makeP256(): { pem: string; publicPem: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    pem: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string,
    publicPem: publicKey.export({ type: 'spki', format: 'pem' }) as string,
  };
}

function decodeJwtParts(jwt: string): { header: unknown; payload: unknown; sig: Buffer } {
  const parts = jwt.split('.');
  if (parts.length !== 3) throw new Error(`expected 3 JWT parts, got ${parts.length}`);
  const [h, p, s] = parts as [string, string, string];
  const decode = (seg: string) =>
    JSON.parse(Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'));
  return {
    header: decode(h),
    payload: decode(p),
    sig: Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'),
  };
}

describe('signAscJwt', () => {
  it('produces an ES256 JWT with the expected header + payload', () => {
    const { pem } = makeP256();
    const fixedClock = { nowSec: () => 1_700_000_000 };
    const out = signAscJwt({
      keyId: 'ABCDEFGH12',
      issuerId: '57246542-96fe-1a63-e053-0824d011072a',
      privateKeyPem: pem,
      clock: fixedClock,
    });
    expect(out.header).toEqual({ alg: 'ES256', kid: 'ABCDEFGH12', typ: 'JWT' });
    expect(out.payload).toEqual({
      iss: '57246542-96fe-1a63-e053-0824d011072a',
      exp: 1_700_000_000 + 1200,
      aud: 'appstoreconnect-v1',
    });
    const decoded = decodeJwtParts(out.jwt);
    expect(decoded.header).toEqual(out.header);
    expect(decoded.payload).toEqual(out.payload);
    // r||s raw form is 64 bytes for P-256.
    expect(decoded.sig.length).toBe(64);
  });

  it('signature verifies with the matching public key', () => {
    const { pem, publicPem } = makeP256();
    const out = signAscJwt({ keyId: 'K', issuerId: 'I', privateKeyPem: pem });
    const parts = out.jwt.split('.');
    expect(parts).toHaveLength(3);
    const [h, p, s] = parts as [string, string, string];
    const sig = Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
    const ok = cryptoVerify(
      'sha256',
      Buffer.from(`${h}.${p}`),
      { key: createPublicKey(publicPem), dsaEncoding: 'ieee-p1363' },
      sig,
    );
    expect(ok).toBe(true);
  });

  it('caps ttl at 20 minutes when caller asks for longer', () => {
    const { pem } = makeP256();
    const fixedClock = { nowSec: () => 1000 };
    const out = signAscJwt({
      keyId: 'K',
      issuerId: 'I',
      privateKeyPem: pem,
      ttlSec: 9999,
      clock: fixedClock,
    });
    expect(out.payload.exp).toBe(1000 + 1200);
  });

  it('throws on missing inputs', () => {
    expect(() => signAscJwt({ keyId: '', issuerId: 'i', privateKeyPem: 'p' })).toThrow(/keyId/);
    expect(() => signAscJwt({ keyId: 'k', issuerId: '', privateKeyPem: 'p' })).toThrow(/issuerId/);
    expect(() => signAscJwt({ keyId: 'k', issuerId: 'i', privateKeyPem: 'not a key' })).toThrow(/PEM/);
  });
});

describe('ascErrorMessage', () => {
  it('returns empty string for successful responses', () => {
    expect(ascErrorMessage({ ok: true, status: 200, text: '', data: {} })).toBe('');
  });

  it('flattens the ASC error envelope', () => {
    const r: AscResponse = {
      ok: false,
      status: 409,
      text: '',
      data: {
        errors: [
          { status: '409', code: 'ENTITY_ERROR.RELATIONSHIP.INVALID', title: 'Bad rel', detail: 'no such build' },
        ],
      },
    };
    expect(ascErrorMessage(r)).toMatch(/409.*ENTITY_ERROR.*Bad rel.*no such build/);
  });

  it('falls back to HTTP status + body snippet when no error envelope', () => {
    expect(
      ascErrorMessage({ ok: false, status: 500, text: 'oops', data: undefined }),
    ).toMatch(/HTTP 500.*oops/);
  });
});
