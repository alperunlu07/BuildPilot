import { describe, expect, it } from 'vitest';
import { readPlayerCcdTarget, resolveCcdVerifyInputs } from './ccdVerify';

const ROOT = process.platform === 'win32' ? 'C:\\proj' : '/proj';
const BASE = { bucketName: 'Android', contentDir: 'CCDBuildData' };

describe('resolveCcdVerifyInputs', () => {
  it('requires a bucket and a content directory', () => {
    expect(() => resolveCcdVerifyInputs({ contentDir: 'x' }, ROOT)).toThrow(/bucketName/);
    expect(() => resolveCcdVerifyInputs({ bucketName: 'Android' }, ROOT)).toThrow(/contentDir/);
  });

  it('defaults badge, environment and sample size', () => {
    const r = resolveCcdVerifyInputs(BASE, ROOT);
    expect(r.badge).toBe('latest');
    expect(r.environmentName).toBe('production');
    expect(r.sampleBundles).toBe(3);
    expect(r.binaryAbs).toBeUndefined();
  });

  it('allows sampling to be switched off', () => {
    expect(resolveCcdVerifyInputs({ ...BASE, sampleBundles: 0 }, ROOT).sampleBundles).toBe(0);
  });

  it('rejects a negative sample size', () => {
    expect(() => resolveCcdVerifyInputs({ ...BASE, sampleBundles: -1 }, ROOT)).toThrow(
      /sampleBundles/,
    );
  });

  it('resolves a relative binary path against the project root', () => {
    const r = resolveCcdVerifyInputs({ ...BASE, binaryPath: 'Builds/Android/Game.aab' }, ROOT);
    expect(r.binaryAbs).toContain('Game.aab');
    expect(r.binaryAbs).toContain('proj');
  });
});

describe('readPlayerCcdTarget', () => {
  // This is the shape Unity writes into assets/aa/settings.json when the
  // Addressables profile uses CCD management.
  it('reads the target compiled into the player', () => {
    const settings = JSON.stringify({
      m_buildTarget: 'Android',
      m_CcdManagedData: {
        EnvironmentId: 'e1',
        EnvironmentName: 'production',
        BucketId: 'b1',
        Badge: 'latest',
        State: 0,
      },
    });
    expect(readPlayerCcdTarget(settings)).toEqual({
      environmentName: 'production',
      bucketId: 'b1',
      badge: 'latest',
    });
  });

  // A player built without CCD management has no target to disagree with, so
  // the caller should see empty fields rather than a thrown error.
  it('returns nothing for a settings file with no CCD block', () => {
    expect(readPlayerCcdTarget(JSON.stringify({ m_buildTarget: 'Android' }))).toEqual({});
  });
});
