import { describe, expect, it } from 'vitest';
import { parseAscApiArgs } from './appStoreConnectApi';

describe('parseAscApiArgs', () => {
  it('defaults method to GET', () => {
    expect(parseAscApiArgs({ path: '/v1/apps' })).toEqual({
      method: 'GET',
      path: '/v1/apps',
      query: undefined,
      body: undefined,
    });
  });

  it('parses queryJson + bodyJson', () => {
    const out = parseAscApiArgs({
      method: 'PATCH',
      path: '/v1/betaBuildLocalizations/abc123',
      queryJson: '{"include":"build"}',
      bodyJson: '{"data":{"type":"betaBuildLocalizations","attributes":{"whatsNew":"Bug fixes"}}}',
    });
    expect(out.method).toBe('PATCH');
    expect(out.query).toEqual({ include: 'build' });
    expect((out.body as { data: { attributes: { whatsNew: string } } }).data.attributes.whatsNew).toBe(
      'Bug fixes',
    );
  });

  it('throws on missing path', () => {
    expect(() => parseAscApiArgs({})).toThrow(/path/);
  });

  it('throws on invalid method', () => {
    expect(() => parseAscApiArgs({ path: '/x', method: 'PUT' as unknown as 'GET' })).toThrow(/method/);
  });

  it('throws on invalid JSON in body', () => {
    expect(() => parseAscApiArgs({ path: '/x', bodyJson: 'not-json' })).toThrow(/bodyJson/);
  });

  it('throws on invalid JSON in query', () => {
    expect(() => parseAscApiArgs({ path: '/x', queryJson: '{not}' })).toThrow(/queryJson/);
  });
});
