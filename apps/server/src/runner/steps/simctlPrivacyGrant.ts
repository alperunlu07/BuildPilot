import type { SimctlPrivacyGrantStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// `xcrun simctl privacy <udid> grant|revoke|reset <service> <bundleId>` —
// preseed photos / camera / contacts permissions before UI tests run, so the
// permission dialog never blocks the test runner. Common services:
// all, calendar, contacts-limited, contacts, location, location-always,
// photos-add, photos, media-library, microphone, motion, reminders, siri,
// speech, user-tracking.
const VALID_ACTIONS = new Set(['grant', 'revoke', 'reset']);

export function buildSimctlPrivacyCommand(d: Partial<SimctlPrivacyGrantStepData>): string {
  const action = d.action ?? 'grant';
  if (!VALID_ACTIONS.has(action)) {
    throw new Error(`simctlPrivacyGrant: invalid action "${action}"`);
  }
  if (!d.service || d.service.trim().length === 0) {
    throw new Error('simctlPrivacyGrant: missing "service"');
  }
  const target = d.udid && d.udid.trim().length > 0 ? shellQuote(d.udid.trim()) : `'booted'`;
  const parts = ['xcrun', 'simctl', 'privacy', target, action, shellQuote(d.service.trim())];
  if (d.bundleId && d.bundleId.trim().length > 0) parts.push(shellQuote(d.bundleId.trim()));
  return parts.join(' ');
}

export async function runSimctlPrivacyGrant(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SimctlPrivacyGrantStepData>;
  const command = buildSimctlPrivacyCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    label: `simctl privacy ${d.action ?? 'grant'} ${d.service} ${d.bundleId ?? '(all)'}`,
  });
}
