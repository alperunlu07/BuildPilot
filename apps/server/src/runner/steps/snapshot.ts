import type { SnapshotStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { execMaybeRemote, shellQuote } from './_exec';
import { splitAdditionalArgs } from './_args';

// `fastlane snapshot` drives a UI Test bundle across N simulator devices and
// languages, capturing localized screenshots. Almost everything can live in a
// Snapfile checked into the project root, so this builder enforces nothing —
// it just forwards whatever fields are set. The runner emits a hint line via
// the engine's log channel when neither scheme nor workspace/project is
// supplied, since that combination only makes sense if a Snapfile exists.

// Pure argv builder — exported for the test suite. Returns a fully
// shell-quoted string ready to be handed to execMaybeRemote.
export function buildSnapshotCommand(d: Partial<SnapshotStepData>): string {
  const parts: string[] = ['fastlane', 'snapshot'];

  const flag = (name: string, value: string) => {
    parts.push(name, shellQuote(value));
  };

  // --output_directory always emitted with a default of 'screenshots' so the
  // produced command line is self-documenting in logs even when the user
  // leaves the field blank.
  const outputDir = d.outputDirectory && d.outputDirectory.trim().length > 0
    ? d.outputDirectory.trim()
    : 'screenshots';
  flag('--output_directory', outputDir);

  if (d.outputSimulatorLogs === 'true') parts.push('--output_simulator_logs');

  if (d.iosVersion && d.iosVersion.trim().length > 0) {
    flag('--ios_version', d.iosVersion.trim());
  }
  if (d.scheme && d.scheme.trim().length > 0) flag('--scheme', d.scheme.trim());
  if (d.workspacePath && d.workspacePath.trim().length > 0) {
    flag('--workspace', d.workspacePath.trim());
  }
  if (d.projectPath && d.projectPath.trim().length > 0) {
    flag('--project', d.projectPath.trim());
  }

  // Comma-separated lists pass through as a single shell-quoted token so
  // commas survive the shell. fastlane snapshot parses them on its end.
  if (d.devices && d.devices.trim().length > 0) {
    flag('--devices', d.devices.trim());
  }
  if (d.languages && d.languages.trim().length > 0) {
    flag('--languages', d.languages.trim());
  }

  // launchArguments is the only multiline-non-paths field across our steps.
  // Inline split + trim + filter; each line becomes its own --launch_arguments
  // flag so snapshot picks them up as repeated args.
  if (d.launchArguments && d.launchArguments.trim().length > 0) {
    const lines = d.launchArguments
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      flag('--launch_arguments', line);
    }
  }

  if (d.clearPreviousScreenshots === 'true') {
    parts.push('--clear_previous_screenshots');
  }

  parts.push(...splitAdditionalArgs(d.additionalArgs));

  return parts.join(' ');
}

export async function runSnapshot(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<SnapshotStepData>;

  // Surface a hint when neither scheme nor workspace/project is set AND the
  // user hasn't pointed cwd at a directory that presumably holds a Snapfile.
  // Don't throw — a Snapfile in the project root is a perfectly valid setup.
  const hasScheme = d.scheme && d.scheme.trim().length > 0;
  const hasWs = d.workspacePath && d.workspacePath.trim().length > 0;
  const hasProj = d.projectPath && d.projectPath.trim().length > 0;
  const hasCwd = d.cwd && d.cwd.trim().length > 0;
  if (!hasScheme && !hasWs && !hasProj && !hasCwd) {
    ctx.log(
      'snapshot: no scheme/workspace/project/cwd set — relying on a Snapfile in the project root',
    );
  }

  const command = buildSnapshotCommand(d);
  await execMaybeRemote({
    ctx,
    d,
    command,
    cwd: d.cwd && d.cwd.trim().length > 0 ? d.cwd : undefined,
    label: command,
  });
}
