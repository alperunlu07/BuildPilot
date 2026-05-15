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

// Datadog: `datadog-ci dsyms upload <path>`. API key + site come from env vars
// so they don't show up in argv (or in error messages on non-zero exit).
export function buildDatadogCommand(d: Partial<DsymUploadStepData>): string {
  if (!d.datadogApiKey) throw new Error('dsymUpload (datadog): missing "datadogApiKey"');
  if (!d.dsymPath) throw new Error('dsymUpload: missing "dsymPath"');
  const bin = d.datadogCliPath && d.datadogCliPath.trim().length > 0
    ? d.datadogCliPath.trim()
    : 'datadog-ci';
  const parts: string[] = [];
  parts.push(`DATADOG_API_KEY=${shellQuote(d.datadogApiKey)}`);
  if (d.datadogSite && d.datadogSite.trim().length > 0) {
    parts.push(`DATADOG_SITE=${shellQuote(d.datadogSite.trim())}`);
  }
  parts.push(shellQuote(bin), 'dsyms', 'upload', shellQuote(d.dsymPath));
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return parts.join(' ');
}

// Instabug ships a wrapper shell script (Instabug_dsym_upload.sh) that takes
// the app token as its first positional arg and the .xcarchive / .dSYM as
// the second. The token is supplied via env to keep it off the command line
// when the script itself permits — Instabug's wrapper allows both, so we
// prefer env-based for parity with the other providers.
export function buildInstabugCommand(d: Partial<DsymUploadStepData>): string {
  if (!d.instabugAppToken) {
    throw new Error('dsymUpload (instabug): missing "instabugAppToken"');
  }
  if (!d.dsymPath) throw new Error('dsymUpload: missing "dsymPath"');
  const script = d.instabugScriptPath && d.instabugScriptPath.trim().length > 0
    ? d.instabugScriptPath.trim()
    : 'Instabug_dsym_upload.sh';
  const parts: string[] = [];
  parts.push(`INSTABUG_APP_TOKEN=${shellQuote(d.instabugAppToken)}`);
  parts.push(shellQuote(script), shellQuote(d.instabugAppToken), shellQuote(d.dsymPath));
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return parts.join(' ');
}

// Embrace ships a darwin-only binary (`embrace_symbol_upload.darwin`) and
// expects --app and --token on argv plus the dSYM path. The token is
// sensitive but the CLI doesn't have an env-only mode — we still log it as
// `--token <quoted>` and rely on the engine's secret masking when surfaced.
export function buildEmbraceCommand(d: Partial<DsymUploadStepData>): string {
  if (!d.embraceAppId) throw new Error('dsymUpload (embrace): missing "embraceAppId"');
  if (!d.embraceApiToken) throw new Error('dsymUpload (embrace): missing "embraceApiToken"');
  if (!d.dsymPath) throw new Error('dsymUpload: missing "dsymPath"');
  const bin = d.embraceUploadPath && d.embraceUploadPath.trim().length > 0
    ? d.embraceUploadPath.trim()
    : 'embrace_symbol_upload.darwin';
  const parts = [
    shellQuote(bin),
    '--app',
    shellQuote(d.embraceAppId),
    '--token',
    shellQuote(d.embraceApiToken),
    shellQuote(d.dsymPath),
  ];
  if (d.additionalArgs && d.additionalArgs.trim().length > 0) {
    parts.push(...d.additionalArgs.split(/\s+/).filter(Boolean).map(shellQuote));
  }
  return parts.join(' ');
}

// New Relic: `newrelic-ios-symbol-upload <app-token> <dsym-path>` — the
// CLI is positional and treats the first arg as the application token.
export function buildNewRelicCommand(d: Partial<DsymUploadStepData>): string {
  if (!d.newrelicAppToken) {
    throw new Error('dsymUpload (newrelic): missing "newrelicAppToken"');
  }
  if (!d.dsymPath) throw new Error('dsymUpload: missing "dsymPath"');
  const bin = d.newrelicCliPath && d.newrelicCliPath.trim().length > 0
    ? d.newrelicCliPath.trim()
    : 'newrelic-ios-symbol-upload';
  const parts = [shellQuote(bin), shellQuote(d.newrelicAppToken), shellQuote(d.dsymPath)];
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
    case 'datadog':
      return buildDatadogCommand(d);
    case 'instabug':
      return buildInstabugCommand(d);
    case 'embrace':
      return buildEmbraceCommand(d);
    case 'newrelic':
      return buildNewRelicCommand(d);
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
