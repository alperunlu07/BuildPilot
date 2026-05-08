import type { BranchTargetedTestFlightStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Auto-route a TestFlight build to the BetaGroup matching its branch name
// (an Xcode Cloud convenience). Logic:
//   1. Compute the target group name from the active branch via a
//      configurable mapping table (default: branch name, optionally lower-
//      cased / prefixed). Falls back to a configured default group when the
//      branch isn't in the table.
//   2. Find the BetaGroup by name on the app.
//   3. Attach the buildId to that group via the relationships endpoint.
//
// The branch comes from the build trigger (Pipeline runs are always tagged
// with `triggerBranch`).
export interface BranchMapping {
  pattern: RegExp;
  group: string;
}

export function parseBranchMapping(input: string | undefined): BranchMapping[] {
  if (!input || input.trim().length === 0) return [];
  const out: BranchMapping[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=>');
    if (eq < 0) throw new Error(`branchTargetedTestFlight: malformed mapping "${line}" — expected "branch-pattern => GroupName"`);
    const pattern = line.slice(0, eq).trim();
    const group = line.slice(eq + 2).trim();
    if (!pattern || !group) {
      throw new Error(`branchTargetedTestFlight: empty pattern or group in "${line}"`);
    }
    // Patterns can be a regex (/.../) or a plain literal — convert literal
    // wildcards (* → .*, ? → .).
    let re: RegExp;
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      re = new RegExp(pattern.slice(1, -1));
    } else {
      const esc = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
      re = new RegExp(`^${esc}$`);
    }
    out.push({ pattern: re, group });
  }
  return out;
}

export function pickGroupForBranch(branch: string, mappings: BranchMapping[], fallback?: string): string | undefined {
  for (const m of mappings) {
    if (m.pattern.test(branch)) return m.group;
  }
  return fallback;
}

export async function runBranchTargetedTestFlight(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<BranchTargetedTestFlightStepData>;
  if (!d.keyId || !d.issuerId) {
    throw new Error('branchTargetedTestFlight: keyId + issuerId required');
  }
  if (!d.appBundleId) {
    throw new Error('branchTargetedTestFlight: missing "appBundleId"');
  }
  if (!d.buildId) {
    throw new Error('branchTargetedTestFlight: missing "buildId"');
  }
  const branch = (d.branchOverride && d.branchOverride.trim().length > 0
    ? d.branchOverride.trim()
    : ctx.build.triggerBranch
  );
  if (!branch || branch.length === 0) {
    throw new Error('branchTargetedTestFlight: no branch on build (triggerBranch is empty)');
  }

  const mappings = parseBranchMapping(d.mapping);
  const group = pickGroupForBranch(branch, mappings, d.defaultGroup);
  if (!group) {
    throw new Error(
      `branchTargetedTestFlight: no group mapped for branch "${branch}" and no defaultGroup configured`,
    );
  }
  ctx.log(`branch="${branch}" → group="${group}"`);

  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };

  // Look up appId
  const appsRes = await ascRequest({
    creds,
    path: '/v1/apps',
    query: { 'filter[bundleId]': d.appBundleId, limit: 1 },
  });
  if (!appsRes.ok) throw new Error(`branchTargetedTestFlight app lookup: ${ascErrorMessage(appsRes)}`);
  const apps = (appsRes.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const firstApp = apps[0];
  if (!firstApp) throw new Error(`no app for bundleId=${d.appBundleId}`);

  // Look up groupId
  const groupsRes = await ascRequest({
    creds,
    path: '/v1/betaGroups',
    query: { 'filter[app]': firstApp.id, 'filter[name]': group, limit: 1 },
  });
  if (!groupsRes.ok) throw new Error(`branchTargetedTestFlight group lookup: ${ascErrorMessage(groupsRes)}`);
  const groups = (groupsRes.data as { data?: Array<{ id: string }> } | undefined)?.data ?? [];
  const firstGroup = groups[0];
  if (!firstGroup) {
    if (d.createMissingGroup === 'true') {
      const createRes = await ascRequest({
        creds,
        method: 'POST',
        path: '/v1/betaGroups',
        body: {
          data: {
            type: 'betaGroups',
            attributes: { name: group },
            relationships: { app: { data: { type: 'apps', id: firstApp.id } } },
          },
        },
      });
      if (!createRes.ok) throw new Error(`branchTargetedTestFlight createGroup: ${ascErrorMessage(createRes)}`);
      const newId = (createRes.data as { data?: { id?: string } } | undefined)?.data?.id;
      if (!newId) throw new Error('branchTargetedTestFlight: ASC did not return new group id');
      ctx.log(`created BetaGroup "${group}"`);
      await attachBuildToGroup(creds, newId, d.buildId);
    } else {
      throw new Error(`no BetaGroup "${group}" on app ${firstApp.id} — set createMissingGroup="true" to create on demand`);
    }
  } else {
    await attachBuildToGroup(creds, firstGroup.id, d.buildId);
  }
  ctx.log(`build ${d.buildId} attached to ${group}`, 'success');
}

async function attachBuildToGroup(creds: AscCredentials, groupId: string, buildId: string): Promise<void> {
  const res = await ascRequest({
    creds,
    method: 'POST',
    path: `/v1/betaGroups/${encodeURIComponent(groupId)}/relationships/builds`,
    body: { data: [{ type: 'builds', id: buildId }] },
  });
  if (!res.ok && res.status !== 409 && res.status !== 422) {
    throw new Error(`branchTargetedTestFlight attach: ${ascErrorMessage(res)}`);
  }
}
