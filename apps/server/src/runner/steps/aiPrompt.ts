import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { AiPromptStepData, AiTool } from '@buildpilot/shared-types';
import { getAiIntegrationsRuntime } from '../../config';
import type { StepContext } from '../engine';

// Default invocation for each known CLI. Claude Code, Codex, Aider, and
// Gemini all support a "non-interactive, take this prompt, print the answer
// and exit" mode — we use that to make them composable inside a pipeline.
//
// The shape is { command, args }: args is the prefix; the prompt is appended
// as the final positional argument.
const DEFAULTS: Record<Exclude<AiTool, 'custom'>, { command: string; args: string[] }> = {
  claude: { command: 'claude',  args: ['--print', '--dangerously-skip-permissions'] },
  codex:  { command: 'codex',   args: ['exec'] },
  aider:  { command: 'aider',   args: ['--yes-always', '--message'] },
  gemini: { command: 'gemini',  args: ['-p'] },
};

// Flag used by each CLI to pin a specific model. Surfaced separately from
// DEFAULTS because the model override slots in *before* the prompt positional
// argument, not at the end.
const MODEL_FLAG: Record<Exclude<AiTool, 'custom'>, string> = {
  claude: '--model',
  codex: '--model',
  aider: '--model',
  gemini: '-m',
};

function asBool(v: unknown): boolean {
  return v === true || v === 'true';
}

export async function runAiPrompt(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<AiPromptStepData>;
  const tool = (d.tool ?? 'claude') as AiTool;
  if (!d.prompt || d.prompt.trim().length === 0) {
    throw new Error('aiPrompt: missing "prompt"');
  }

  const cwd = d.cwd ? join(ctx.project.path, d.cwd) : ctx.project.path;

  let command: string;
  let args: string[];
  if (tool === 'custom') {
    if (!d.command || d.command.trim().length === 0) {
      throw new Error('aiPrompt: tool=custom requires a "command"');
    }
    // Split the custom command on whitespace; first token is the binary,
    // rest are extra args. Prompt is appended as the last positional arg.
    const parts = d.command.trim().split(/\s+/);
    command = parts[0]!;
    args = parts.slice(1);
  } else {
    // Per-tool path/model overrides from ~/.buildpilot/config.json
    // (PATCH /api/config/ai-integrations). Empty / undefined falls back to
    // the hardcoded DEFAULTS — keeps existing installs working unchanged.
    const override = getAiIntegrationsRuntime()[tool];
    const def = DEFAULTS[tool];
    command = override?.path && override.path.length > 0 ? override.path : def.command;
    args = [...def.args];
    if (override?.model && override.model.length > 0) {
      args.push(MODEL_FLAG[tool], override.model);
    }
  }
  args.push(d.prompt);

  ctx.log(`${tool} → ${command} ${args.slice(0, -1).join(' ')} <prompt>`);
  ctx.log(`prompt: ${truncate(d.prompt, 240)}`);
  ctx.log(`cwd: ${cwd}`);

  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      // Use shell: true on Windows so .cmd / .ps1 launchers (claude.cmd etc.)
      // are found via PATHEXT without us hardcoding the extension.
      shell: process.platform === 'win32',
    });
    ctx.attachProcess(child);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const msg = `${command} exited with code ${code}`;
      if (asBool(d.allowFailure)) {
        ctx.log(`(allowFailure=true) ${msg}`, 'info');
        resolve();
      } else {
        reject(new Error(msg));
      }
    });
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}… (${s.length - n} more chars)`;
}
