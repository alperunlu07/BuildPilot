import { describe, expect, it } from 'vitest';
import { buildAppStoreUploadCommand } from './appStoreUpload';

describe('buildAppStoreUploadCommand', () => {
  it('throws on missing appIdentifier', () => {
    expect(() => buildAppStoreUploadCommand({})).toThrow(/appIdentifier/);
  });

  it('builds a minimal deliver command', () => {
    const cmd = buildAppStoreUploadCommand({ appIdentifier: 'com.example.app' });
    expect(cmd).toBe(`fastlane deliver --app_identifier 'com.example.app'`);
  });

  it('chains the standard release flow flags', () => {
    const cmd = buildAppStoreUploadCommand({
      appIdentifier: 'com.example.app',
      ipaPath: 'build/MyApp.ipa',
      metadataPath: 'fastlane/metadata',
      screenshotsPath: 'fastlane/screenshots',
      submitForReview: 'true',
      automaticRelease: 'true',
      force: 'true',
    });
    expect(cmd).toContain(`--ipa 'build/MyApp.ipa'`);
    expect(cmd).toContain(`--metadata_path 'fastlane/metadata'`);
    expect(cmd).toContain(`--screenshots_path 'fastlane/screenshots'`);
    expect(cmd).toContain(`--submit_for_review true`);
    expect(cmd).toContain(`--automatic_release true`);
    expect(cmd).toContain(`--force true`);
  });

  it('skip flags only appear when set to true', () => {
    const cmd = buildAppStoreUploadCommand({ appIdentifier: 'a', skipMetadata: 'true' });
    expect(cmd).toContain(`--skip_metadata true`);
    expect(cmd).not.toContain('--skip_binary_upload');
    expect(cmd).not.toContain('--skip_screenshots');
  });
});
