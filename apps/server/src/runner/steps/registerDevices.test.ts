import { describe, expect, it } from 'vitest';
import { parseUdidLines } from './registerDevices';

describe('parseUdidLines', () => {
  const SAMPLE = '00008101-001A2B3C4D5E6F70';
  const SAMPLE2 = 'ABCDEF1234567890ABCDEF1234567890ABCDEFAA';

  it('parses a single bare UDID', () => {
    const out = parseUdidLines(SAMPLE);
    expect(out).toEqual([{ name: 'Device-00008101', udid: SAMPLE, platform: 'IOS' }]);
  });

  it('parses "name=UDID" form', () => {
    const out = parseUdidLines(`Alice's iPhone=${SAMPLE}\nBob's iPad=${SAMPLE2}`);
    expect(out).toEqual([
      { name: "Alice's iPhone", udid: SAMPLE, platform: 'IOS' },
      { name: "Bob's iPad", udid: SAMPLE2, platform: 'IOS' },
    ]);
  });

  it('skips blank + comment lines', () => {
    const out = parseUdidLines(`# devices\n\n${SAMPLE}\n\n# more\n${SAMPLE2}\n`);
    expect(out).toHaveLength(2);
  });

  it('honours the default platform', () => {
    const out = parseUdidLines(SAMPLE, 'MAC_OS');
    expect(out[0]?.platform).toBe('MAC_OS');
  });

  it('throws on non-UDID-looking values', () => {
    expect(() => parseUdidLines('not-a-udid')).toThrow(/UDID/);
  });

  it('throws on empty input', () => {
    expect(() => parseUdidLines('   \n  \n')).toThrow(/no UDIDs/);
  });
});
