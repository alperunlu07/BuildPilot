import type { DsymUploadStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';

// Per-backend command builders. Each returns the joined shell command
// (env prefix included where required) so callers can pass it straight
// to execMaybeRemote.

export function buildCrashlyticsCommand(d: Partial<DsymUploadStepData>): string {
  if (!d.googleServicePlistPath || d.googleServicePlistPath.trim().length === 0) {
    throw new Error('dsymUpload (crashlytics): missing "googleServicePlistPath"');
  }
  if (!d.dsymPath) throw new Error('dsymUpload: missing "dsymPath"');
  // Modern Firebase distributes upload-symbols inside the FirebaseCrashlytics
  // pod. Path is configurable so users with a non-standard layout can point
  // at it; bare `upload-symbols` works when the pod's bin dir is on PATH.
  const bin = d.uploadSymbolsBinary && d.uploadSymbolsBinary.trim().length > 0
    ? d.uploadSymbolsBinary.trim()
    : 'upload-symbols';
  const platform = d.platform ?? 'ios';
  const parts = [
    shellQuote(bin),
    '-gsp',
    shellQuote(d.googleServicePlistPath),
    '-p',
    platform,
    shellQuote(d.dsymPath),
  ];
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return parts.join(' ');
}

export function buildSentryCommand(d: Partial<DsymUploadStepData>): string {
  if (!d.sentryOrg) throw new Error('dsymUpload (sentry): missing "sentryOrg"');
  if (!d.sentryProject) throw new Error('dsymUpload (sentry): missing "sentryProject"');
  if (!d.dsymPath) throw new Error('dsymUpload: missing "dsymPath"');
  const parts: string[] = [];
  if (d.sentryAuthToken && d.sentryAuthToken.length > 0) {
    parts.push(`SENTRY_AUTH_TOKEN=${shellQuote(d.sentryAuthToken)}`);
  }
  parts.push(
    'sentry-cli',
    'debug-files',
    'upload',
    '--org',
    shellQuote(d.sentryOrg),
    '--project',
    shellQuote(d.sentryProject),
    shellQuote(d.dsymPath),
  );
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return parts.join(' ');
}

export function buildBugsnagCommand(d: Partial<DsymUploadStepData>): string {
  if (!d.bugsnagApiKey) throw new Error('dsymUpload (bugsnag): missing "bugsnagApiKey"');
  if (!d.dsymPath) throw new Error('dsymUpload: missing "dsymPath"');
  const bin = d.bugsnagCliPath && d.bugsnagCliPath.trim().length > 0
    ? d.bugsnagCliPath.trim()
    : 'bugsnag-cli';
  const parts = [
    shellQuote(bin),
    'upload',
    'xcode-archive',
    '--api-key',
    shellQuote(d.bugsnagApiKey),
    shellQuote(d.dsymPath),
  ];
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return parts.join(' ');
}

export function buildDsymUploadCommand(d: Partial<DsymUploadStepData>): string {
  switch (d.backend) {
    case 'crashlytics':
      return buildCrashlyticsCommand(d);
    case 'sentry':
      return buildSentryCommand(d);
    case 'bugsnag':
      return buildBugsnagCommand(d);
    default:
      throw new Error(`dsymUpload: invalid or missing backend "${d.backend ?? '(unset)'}"`);
  }
}

export async function runDsymUpload(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<DsymUploadStepData>;
  const command = buildDsymUploadCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    label: `dsym upload (${d.backend}) -> ${d.dsymPath}`,
  });
}
