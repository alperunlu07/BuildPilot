import type { FirebaseAppDistributionStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { splitAdditionalArgs } from './_args';
import { execMaybeRemote, shellQuote } from './_exec';

// `firebase appdistribution:distribute` — beta distribution to tester groups
// with release notes. Auth is via service account (FIREBASE_TOKEN env) OR
// via the firebase CLI's interactive login (assumed pre-configured on the
// agent). We pass either the JSON service account key path through the
// GOOGLE_APPLICATION_CREDENTIALS env or fall back to firebase login state.
export function buildFirebaseDistributionCommand(d: Partial<FirebaseAppDistributionStepData>): string {
  if (!d.appId || d.appId.trim().length === 0) {
    throw new Error('firebaseAppDistribution: missing "appId"');
  }
  if (!d.binaryPath || d.binaryPath.trim().length === 0) {
    throw new Error('firebaseAppDistribution: missing "binaryPath"');
  }
  const parts: string[] = [];
  if (d.serviceAccountPath && d.serviceAccountPath.trim().length > 0) {
    parts.push(`GOOGLE_APPLICATION_CREDENTIALS=${shellQuote(d.serviceAccountPath.trim())}`);
  }
  if (d.firebaseToken && d.firebaseToken.length > 0) {
    parts.push(`FIREBASE_TOKEN=${shellQuote(d.firebaseToken)}`);
  }
  parts.push('firebase', 'appdistribution:distribute');
  parts.push(shellQuote(d.binaryPath.trim()));
  parts.push('--app', shellQuote(d.appId.trim()));
  if (d.groups && d.groups.trim().length > 0) {
    parts.push('--groups', shellQuote(d.groups.trim()));
  }
  if (d.testers && d.testers.trim().length > 0) {
    parts.push('--testers', shellQuote(d.testers.trim()));
  }
  if (d.releaseNotes && d.releaseNotes.trim().length > 0) {
    parts.push('--release-notes', shellQuote(d.releaseNotes));
  }
  if (d.releaseNotesFile && d.releaseNotesFile.trim().length > 0) {
    parts.push('--release-notes-file', shellQuote(d.releaseNotesFile.trim()));
  }
  parts.push(...splitAdditionalArgs(d.additionalArgs));
  return parts.join(' ');
}

export async function runFirebaseAppDistribution(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<FirebaseAppDistributionStepData>;
  const command = buildFirebaseDistributionCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: `firebase appdistribution:distribute ${d.binaryPath}`,
  });
}
