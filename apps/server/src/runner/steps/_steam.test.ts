import { describe, expect, it } from 'vitest';
import { buildAppBuildVdf, buildSteamcmdUploadCommand, type SteamAppBuildModel } from './_steam';

describe('buildAppBuildVdf', () => {
  it('emits a minimal app_build with one inlined depot', () => {
    const model: SteamAppBuildModel = {
      appId: '480',
      description: 'BuildPilot test',
      contentRoot: '../',
      depots: [
        {
          id: '481',
          fileMappings: [{ localPath: '*', depotPath: '.', recursive: true }],
        },
      ],
    };
    const vdf = buildAppBuildVdf(model);
    expect(vdf).toContain('"AppID" "480"');
    expect(vdf).toContain('"Desc" "BuildPilot test"');
    expect(vdf).toContain('"ContentRoot" "../"');
    expect(vdf).toContain('"481"');
    expect(vdf).toContain('"LocalPath" "*"');
    expect(vdf).toContain('"recursive" "1"');
  });

  it('escapes quotes and backslashes in values', () => {
    const vdf = buildAppBuildVdf({
      appId: '1',
      description: 'has "quotes" and a \\backslash',
      contentRoot: 'C:\\path',
      depots: [],
    });
    expect(vdf).toContain('has \\"quotes\\" and a \\\\backslash');
    expect(vdf).toContain('"ContentRoot" "C:\\\\path"');
  });

  it('emits SetLive when set', () => {
    const vdf = buildAppBuildVdf({
      appId: '1',
      description: 'd',
      contentRoot: '.',
      setLive: 'beta',
      depots: [],
    });
    expect(vdf).toContain('"SetLive" "beta"');
  });

  it('marks preview builds', () => {
    const vdf = buildAppBuildVdf({
      appId: '1',
      description: 'd',
      contentRoot: '.',
      preview: true,
      depots: [],
    });
    expect(vdf).toContain('"Preview" "1"');
  });

  it('refers to external depot vdf when fileMappings is empty', () => {
    const vdf = buildAppBuildVdf({
      appId: '1',
      description: 'd',
      contentRoot: '.',
      depots: [{ id: '999', fileMappings: [] }],
    });
    expect(vdf).toContain('"999" "depot_build_999.vdf"');
  });
});

describe('buildSteamcmdUploadCommand', () => {
  it('chains login + run_app_build + quit', () => {
    const cmd = buildSteamcmdUploadCommand({
      username: 'partner',
      password: 'secret',
      vdfPath: '/tmp/app_build_480.vdf',
    });
    expect(cmd).toBe(
      `steamcmd +@ShutdownOnFailedCommand 1 +@NoPromptForPassword 1 ` +
        `+login 'partner' 'secret' +run_app_build '/tmp/app_build_480.vdf' +quit`,
    );
  });

  it('appends Steam Guard code when present', () => {
    const cmd = buildSteamcmdUploadCommand({
      username: 'partner',
      password: 'secret',
      steamGuardCode: 'XYZ123',
      vdfPath: '/tmp/x.vdf',
    });
    expect(cmd).toContain(`+login 'partner' 'secret' 'XYZ123'`);
  });

  it('honours custom steamcmd path', () => {
    const cmd = buildSteamcmdUploadCommand({
      steamcmdPath: '/opt/steamcmd/steamcmd.sh',
      username: 'u',
      password: 'p',
      vdfPath: '/v',
    });
    expect(cmd.startsWith('/opt/steamcmd/steamcmd.sh ')).toBe(true);
  });
});
