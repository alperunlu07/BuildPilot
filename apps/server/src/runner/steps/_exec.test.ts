import { describe, expect, it } from 'vitest';
import { isRemote, shellQuote } from './_exec';

describe('isRemote', () => {
  it('returns true when hostId is set', () => {
    expect(isRemote({ hostId: 'abc' })).toBe(true);
  });

  it('returns true when host is set', () => {
    expect(isRemote({ host: 'u@h' })).toBe(true);
  });

  it('treats whitespace-only host/hostId as not-remote', () => {
    expect(isRemote({ hostId: '   ', host: '   ' })).toBe(false);
  });

  it('returns false when neither field is set', () => {
    expect(isRemote({})).toBe(false);
  });
});

describe('shellQuote', () => {
  it('wraps simple strings in single quotes', () => {
    expect(shellQuote('hello')).toBe(`'hello'`);
  });

  it('escapes embedded single quotes', () => {
    // The POSIX trick: '...'\''...' — close, escaped quote, reopen.
    expect(shellQuote(`O'Reilly`)).toBe(`'O'\\''Reilly'`);
  });

  it('preserves spaces and special shell metachars without re-escaping', () => {
    expect(shellQuote('a b c $X `cmd`')).toBe(`'a b c $X \`cmd\`'`);
  });

  it('quotes empty strings as ""', () => {
    expect(shellQuote('')).toBe(`''`);
  });
});
