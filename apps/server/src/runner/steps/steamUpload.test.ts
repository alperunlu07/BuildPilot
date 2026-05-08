import { describe, expect, it } from 'vitest';
import { parseDepotsField } from './steamUpload';

describe('parseDepotsField', () => {
  it('returns empty when given blank input', () => {
    expect(parseDepotsField('')).toEqual([]);
    expect(parseDepotsField(undefined)).toEqual([]);
  });

  it('parses single-line "<depotId>:<localPath>"', () => {
    const out = parseDepotsField('481:*');
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe('481');
    expect(out[0]?.fileMappings[0]).toEqual({ localPath: '*', depotPath: '.', recursive: true });
  });

  it('parses multiple depots + custom depotPath + recursive=false', () => {
    const out = parseDepotsField('481:Builds/Linux:server-files\n482:Builds/Win:.:false');
    expect(out).toHaveLength(2);
    expect(out[0]?.fileMappings[0]).toEqual({
      localPath: 'Builds/Linux',
      depotPath: 'server-files',
      recursive: true,
    });
    expect(out[1]?.fileMappings[0]?.recursive).toBe(false);
  });

  it('rejects non-numeric depot ids', () => {
    expect(() => parseDepotsField('abc:*')).toThrow(/numeric depot id/);
  });

  it('skips comment + blank lines', () => {
    const out = parseDepotsField('# header\n\n481:*\n# tail');
    expect(out).toHaveLength(1);
  });

  it('throws when no parsable lines', () => {
    expect(() => parseDepotsField('# only comments')).toThrow(/no depots/);
  });
});
