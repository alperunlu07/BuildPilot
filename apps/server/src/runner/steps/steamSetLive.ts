import type { SteamSetLiveStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { steamSetAppBuildLive } from './_steam';

// Sets a previously-uploaded build live on a Steam branch via the
// Steamworks Web API. Use after a `steamUpload` step that didn't include
// SetLive in its VDF (the safer pattern — uploads stay on the unreleased
// "default" branch until an operator-approved promotion).
export async function runSteamSetLive(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SteamSetLiveStepData>;
  if (!d.steamWebApiKey || d.steamWebApiKey.length === 0) {
    throw new Error('steamSetLive: missing "steamWebApiKey"');
  }
  if (!d.appId || d.appId.trim().length === 0) {
    throw new Error('steamSetLive: missing "appId"');
  }
  if (!d.buildId || d.buildId.trim().length === 0) {
    throw new Error('steamSetLive: missing "buildId"');
  }
  if (!d.branch || d.branch.trim().length === 0) {
    throw new Error('steamSetLive: missing "branch"');
  }

  ctx.log(`steam setLive: app=${d.appId} build=${d.buildId} branch=${d.branch}`);
  const result = await steamSetAppBuildLive(
    { webApiKey: d.steamWebApiKey, baseUrl: d.baseUrl },
    {
      appId: d.appId,
      buildId: d.buildId,
      branch: d.branch,
      description: d.description,
    },
  );
  if (!result.ok) {
    throw new Error(`steamSetLive failed (status=${result.status}): ${result.error}`);
  }
  ctx.log(`branch "${d.branch}" now serves build ${d.buildId}`, 'success');
}
