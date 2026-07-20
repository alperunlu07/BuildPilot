import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertBinaryMatchesKind, resolvePlayInputs } from './playConsoleUpload';

// Minimal store-method (uncompressed) zip, just enough central-directory
// structure for the entry-name walk. Real APKs/AABs carry far more, but the
// preflight only ever looks at names.
function makeZip(entryNames: string[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of entryNames) {
    const nameBuf = Buffer.from(name, 'utf8');
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entryNames.length, 8);
  eocd.writeUInt16LE(entryNames.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

const AAB_ENTRIES = ['BundleConfig.pb', 'base/dex/classes.dex', 'base/manifest/AndroidManifest.xml'];
const APK_ENTRIES = ['AndroidManifest.xml', 'classes.dex', 'lib/arm64-v8a/libil2cpp.so'];

describe('assertBinaryMatchesKind', () => {
  it('accepts a real bundle as .aab and a real apk as .apk', () => {
    expect(() => assertBinaryMatchesKind(makeZip(AAB_ENTRIES), 'aab')).not.toThrow();
    expect(() => assertBinaryMatchesKind(makeZip(APK_ENTRIES), 'apk')).not.toThrow();
  });

  // The regression this guard exists for: Unity emits an APK when
  // buildAppBundle is off, no matter what the output file is named, and Play
  // only reports it as an opaque HTTP 500 after the whole upload completes.
  it('rejects an APK that has been named .aab', () => {
    expect(() => assertBinaryMatchesKind(makeZip(APK_ENTRIES), 'aab')).toThrow(
      /BundleConfig\.pb/,
    );
  });

  it('rejects an App Bundle that has been named .apk', () => {
    expect(() => assertBinaryMatchesKind(makeZip(AAB_ENTRIES), 'apk')).toThrow(/\.aab/);
  });

  it('waves through archives it cannot decode rather than blocking a release', () => {
    expect(() => assertBinaryMatchesKind(Buffer.from('not a zip at all'), 'aab')).not.toThrow();
  });
});

describe('resolvePlayInputs', () => {
  it('classifies .aab vs .apk correctly', () => {
    const r1 = resolvePlayInputs(
      { packageName: 'com.example.app', binaryPath: 'a.aab' },
      '/proj',
    );
    expect(r1.binaryKind).toBe('aab');
    expect(r1.binaryAbs).toBe(join('/proj', 'a.aab'));
    const r2 = resolvePlayInputs(
      { packageName: 'com.example.app', binaryPath: '/abs/a.apk' },
      '/proj',
    );
    expect(r2.binaryKind).toBe('apk');
    expect(r2.binaryAbs).toBe('/abs/a.apk');
  });

  it('defaults track=internal and status=completed', () => {
    const r = resolvePlayInputs(
      { packageName: 'com.example.app', binaryPath: 'a.aab' },
      '/proj',
    );
    expect(r.track).toBe('internal');
    expect(r.status).toBe('completed');
    expect(r.userFraction).toBeUndefined();
  });

  it('parses release notes when supplied', () => {
    const r = resolvePlayInputs(
      {
        packageName: 'p',
        binaryPath: 'a.aab',
        releaseNotes: 'en-US=Hello\ntr-TR=Merhaba',
      },
      '/proj',
    );
    expect(r.releaseNotes).toEqual([
      { language: 'en-US', text: 'Hello' },
      { language: 'tr-TR', text: 'Merhaba' },
    ]);
  });

  it('rejects unknown tracks', () => {
    expect(() =>
      resolvePlayInputs(
        { packageName: 'p', binaryPath: 'a.aab', track: 'preview' },
        '/proj',
      ),
    ).toThrow(/track/);
  });

  it('rejects unknown statuses', () => {
    expect(() =>
      resolvePlayInputs(
        { packageName: 'p', binaryPath: 'a.aab', status: 'rolledOut' },
        '/proj',
      ),
    ).toThrow(/status/);
  });

  it('demands userFraction when status=inProgress', () => {
    expect(() =>
      resolvePlayInputs(
        { packageName: 'p', binaryPath: 'a.aab', status: 'inProgress' },
        '/proj',
      ),
    ).toThrow(/userFraction/);
  });

  it('accepts userFraction in (0, 1]', () => {
    const r = resolvePlayInputs(
      {
        packageName: 'p',
        binaryPath: 'a.aab',
        status: 'inProgress',
        userFraction: 0.1,
      },
      '/proj',
    );
    expect(r.userFraction).toBe(0.1);
  });

  it('rejects unsupported binary extensions', () => {
    expect(() =>
      resolvePlayInputs({ packageName: 'p', binaryPath: 'a.zip' }, '/proj'),
    ).toThrow(/aab.*apk/);
  });

  it('throws when packageName is missing', () => {
    expect(() => resolvePlayInputs({ binaryPath: 'a.aab' }, '/proj')).toThrow(
      /packageName/,
    );
  });

  it('throws when binaryPath is missing', () => {
    expect(() => resolvePlayInputs({ packageName: 'p' }, '/proj')).toThrow(/binaryPath/);
  });
});
