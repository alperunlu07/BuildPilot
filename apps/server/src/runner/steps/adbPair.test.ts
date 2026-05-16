import { describe, expect, it } from 'vitest';
import { buildAdbPairArgs } from './adbPair';

describe('buildAdbPairArgs', () => {
  it('returns pair <address> when both fields are valid', () => {
    expect(
      buildAdbPairArgs({ address: '192.168.1.50:39213', pairingCode: '123456' }),
    ).toEqual(['pair', '192.168.1.50:39213']);
  });

  it('throws when address is missing', () => {
    expect(() => buildAdbPairArgs({ pairingCode: '123456' })).toThrow(/address/);
  });

  it('throws when address has no port', () => {
    expect(() => buildAdbPairArgs({ address: '192.168.1.50', pairingCode: '123456' })).toThrow(
      /ip:port/,
    );
  });

  it('throws when pairingCode is missing', () => {
    expect(() => buildAdbPairArgs({ address: '1.2.3.4:5555' })).toThrow(/pairingCode/);
  });

  it('throws when pairingCode is not 6 digits', () => {
    expect(() =>
      buildAdbPairArgs({ address: '1.2.3.4:5555', pairingCode: '12345' }),
    ).toThrow(/6-digit/);
    expect(() =>
      buildAdbPairArgs({ address: '1.2.3.4:5555', pairingCode: 'abcdef' }),
    ).toThrow(/6-digit/);
  });
});
