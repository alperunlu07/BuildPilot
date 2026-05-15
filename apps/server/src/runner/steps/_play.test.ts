import { generateKeyPairSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { parseReleaseNotes, signPlayAssertion } from './_play';

function freshRsaKey(): string {
  // Generate a one-shot RSA-2048 key for the JWT signing roundtrip. Faster
  // than wiring a fixture file into the test corpus and keeps the test
  // hermetic.
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  return privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
}

describe('signPlayAssertion', () => {
  it('produces a 3-segment JWT with RS256 header + scope payload', () => {
    const pem = freshRsaKey();
    const jwt = signPlayAssertion({
      key: { client_email: 'svc@p.iam.gserviceaccount.com', private_key: pem },
      clock: { nowSec: () => 1_700_000_000 },
    });
    const parts = jwt.split('.');
    expect(parts.length).toBe(3);
    const header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString());
    expect(header).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(payload.iss).toBe('svc@p.iam.gserviceaccount.com');
    expect(payload.aud).toBe('https://oauth2.googleapis.com/token');
    expect(payload.scope).toBe('https://www.googleapis.com/auth/androidpublisher');
    expect(payload.iat).toBe(1_700_000_000);
    expect(payload.exp).toBe(1_700_000_000 + 3600);
  });

  it('honours the ttlSec override + caps it at 1h', () => {
    const pem = freshRsaKey();
    const jwt = signPlayAssertion({
      key: { client_email: 'a@b.iam.gserviceaccount.com', private_key: pem },
      clock: { nowSec: () => 100 },
      ttlSec: 999_999, // way over the cap
    });
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1]!, 'base64url').toString());
    expect(payload.exp).toBe(100 + 3600);
  });

  it('throws on a key missing client_email', () => {
    expect(() =>
      // @ts-expect-error testing the runtime guard
      signPlayAssertion({ key: { private_key: 'PEM' }, clock: { nowSec: () => 0 } }),
    ).toThrow(/client_email/);
  });

  it('throws on a non-PEM private key', () => {
    expect(() =>
      signPlayAssertion({
        key: { client_email: 'a@b', private_key: 'not-a-pem' },
      }),
    ).toThrow(/private_key/);
  });
});

describe('parseReleaseNotes', () => {
  it('parses lang=text lines into { language, text } objects', () => {
    expect(
      parseReleaseNotes(['en-US=First note', 'tr-TR=Türkçe nota'].join('\n')),
    ).toEqual([
      { language: 'en-US', text: 'First note' },
      { language: 'tr-TR', text: 'Türkçe nota' },
    ]);
  });

  it('skips blank + malformed lines', () => {
    expect(
      parseReleaseNotes(['', 'no-equals', '=missing-lang', 'en-US=ok'].join('\n')),
    ).toEqual([{ language: 'en-US', text: 'ok' }]);
  });

  it('preserves trailing equals signs in the text', () => {
    expect(parseReleaseNotes('en-US=foo=bar')).toEqual([
      { language: 'en-US', text: 'foo=bar' },
    ]);
  });

  it('returns [] for blank input', () => {
    expect(parseReleaseNotes('')).toEqual([]);
    expect(parseReleaseNotes(undefined)).toEqual([]);
  });
});
