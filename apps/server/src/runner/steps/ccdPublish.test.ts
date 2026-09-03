import { describe, expect, it } from 'vitest';
import { flattenReleaseNotes, resolveCcdPublishInputs } from './ccdPublish';

const ROOT = process.platform === 'win32' ? 'C:\\proj' : '/proj';

describe('resolveCcdPublishInputs', () => {
  it('requires a bucket and a content directory', () => {
    expect(() => resolveCcdPublishInputs({ contentDir: 'x' }, ROOT)).toThrow(/bucketName/);
    expect(() => resolveCcdPublishInputs({ bucketName: 'Android' }, ROOT)).toThrow(/contentDir/);
  });

  it('defaults to the catalog-referenced scope and to cutting a release', () => {
    const r = resolveCcdPublishInputs({ bucketName: 'Android', contentDir: 'CCDBuildData' }, ROOT);
    expect(r.uploadScope).toBe('catalogReferenced');
    expect(r.createRelease).toBe(true);
    expect(r.badge).toBeUndefined();
  });

  it('treats only the literal string "false" as opting out of the release', () => {
    const off = resolveCcdPublishInputs(
      { bucketName: 'Android', contentDir: 'c', createRelease: 'false' },
      ROOT,
    );
    expect(off.createRelease).toBe(false);
    const on = resolveCcdPublishInputs(
      { bucketName: 'Android', contentDir: 'c', createRelease: 'true' },
      ROOT,
    );
    expect(on.createRelease).toBe(true);
  });

  it('rejects an unknown upload scope rather than silently uploading everything', () => {
    expect(() =>
      resolveCcdPublishInputs(
        { bucketName: 'Android', contentDir: 'c', uploadScope: 'everything' },
        ROOT,
      ),
    ).toThrow(/uploadScope/);
  });

  it('resolves a relative content directory against the project root', () => {
    const r = resolveCcdPublishInputs({ bucketName: 'Android', contentDir: 'CCDBuildData' }, ROOT);
    expect(r.contentDirAbs).toContain('CCDBuildData');
    expect(r.contentDirAbs).toContain('proj');
  });

  it('keeps an absolute content directory as-is', () => {
    const abs = process.platform === 'win32' ? 'D:\\content' : '/content';
    const r = resolveCcdPublishInputs({ bucketName: 'Android', contentDir: abs }, ROOT);
    expect(r.contentDirAbs).toBe(abs);
  });

  it('treats blank optional fields as unset', () => {
    const r = resolveCcdPublishInputs(
      { bucketName: 'Android', contentDir: 'c', badge: '   ', releaseNotes: '', catalogFile: '' },
      ROOT,
    );
    expect(r.badge).toBeUndefined();
    expect(r.releaseNotes).toBeUndefined();
    expect(r.catalogFile).toBeUndefined();
  });
});

describe('flattenReleaseNotes', () => {
  // CCD release notes are single-line; pasting the store notes in should not
  // fail the publish at its last step.
  it('collapses multi-line notes into one line', () => {
    expect(flattenReleaseNotes('[en-US]\nFixed things\n\n• Faster')).toBe(
      '[en-US] Fixed things • Faster',
    );
  });

  it('caps the length', () => {
    expect(flattenReleaseNotes('x'.repeat(400))).toHaveLength(255);
  });
});
