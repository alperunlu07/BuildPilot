import { describe, expect, it } from 'vitest';
import { parseHost, resolveHost } from './_ssh';

describe('parseHost', () => {
  it('parses user@host', () => {
    expect(parseHost('build@mac.local')).toEqual({
      user: 'build',
      host: 'mac.local',
      port: 22,
    });
  });

  it('parses user@host:port', () => {
    expect(parseHost('root@example.com:2222')).toEqual({
      user: 'root',
      host: 'example.com',
      port: 2222,
    });
  });

  it('keeps non-numeric trailing colon segments inside the host (IPv6 friendliness)', () => {
    // Not a real IPv6 example but exercises the "trailing :foo isn't a port" branch.
    expect(parseHost('u@host:abc')).toEqual({ user: 'u', host: 'host:abc', port: 22 });
  });

  it('throws when the spec lacks @', () => {
    expect(() => parseHost('mac.local')).toThrow(/user@host/);
  });
});

describe('resolveHost (inline path — no DB)', () => {
  it('returns the inline fields verbatim when hostId is empty', () => {
    const r = resolveHost({
      hostId: '',
      host: 'build@mac.local',
      identityFile: '~/.ssh/id_ed25519',
      skipStrictHostKey: 'true',
    });
    expect(r).toEqual({
      spec: 'build@mac.local',
      identityFile: '~/.ssh/id_ed25519',
      password: undefined,
      skipStrictHostKey: true,
    });
  });

  it('coerces skipStrictHostKey from the string "true" / "false"', () => {
    const t = resolveHost({ host: 'u@h', identityFile: 'k', skipStrictHostKey: 'true' });
    const f = resolveHost({ host: 'u@h', identityFile: 'k', skipStrictHostKey: 'false' });
    expect(t.skipStrictHostKey).toBe(true);
    expect(f.skipStrictHostKey).toBe(false);
  });

  it('throws when neither hostId nor inline host is provided', () => {
    expect(() => resolveHost({})).toThrow(/saved hostId or an inline host/);
  });
});
