import { MessageSquareCode } from 'lucide-react';

// Cluster 11.E · Pipeline-level allow-list of PR-comment slash commands.
// Wired into the PipelineEditor Triggers panel next to the Cron + tag +
// path-filter controls.

interface Props {
  // Comma- / whitespace-separated tokens accepted on a PR comment (without
  // the leading slash). Empty disables.
  commands: string;
  onCommandsChange(value: string): void;
  // Optional whitelist of comment authors allowed to fire the trigger.
  authors: string;
  onAuthorsChange(value: string): void;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function SlashCommandConfig({
  commands,
  onCommandsChange,
  authors,
  onAuthorsChange,
}: Props & { pipelineName?: string }) {
  const tokens = commands
    .split(/[,\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);
  const hasWildcard = tokens.includes('*');
  return (
    <div className="space-y-2">
      <span className="block text-[11px] uppercase tracking-wide text-slate-400">
        <MessageSquareCode size={11} className="mr-1 inline" />
        PR-comment trigger commands
      </span>
      <input
        type="text"
        value={commands}
        onChange={(e) => onCommandsChange(e.target.value)}
        placeholder="run-ios, run-all  (or use * to accept the pipeline's name as a slug)"
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
      />
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1 text-[11px]">
          {tokens.map((t) => (
            <span
              key={t}
              className={
                t === '*'
                  ? 'rounded bg-sky-950/40 px-2 py-0.5 text-sky-300'
                  : 'rounded bg-slate-800 px-2 py-0.5 text-slate-200'
              }
            >
              /{t}
            </span>
          ))}
        </div>
      )}
      {hasWildcard && (
        <p className="text-[11px] text-sky-300">
          Wildcard mode: any comment with /&lt;slug-of-pipeline-name&gt; will
          trigger this pipeline. e.g. <span className="font-mono">/{slug('Sample · checkout → pull → shell') || 'pipeline-name'}</span>.
        </p>
      )}
      <p className="text-[11px] text-slate-400">
        Receivers: <code className="font-mono">POST /api/webhooks/pr-comment/&lt;projectId&gt;</code>.
        Optional HMAC secret via env{' '}
        <code className="font-mono">BUILDPILOT_PR_COMMENT_SECRET_&lt;projectId&gt;</code>.
      </p>
      <span className="mt-2 block text-[11px] uppercase tracking-wide text-slate-400">
        Allowed authors (optional whitelist)
      </span>
      <input
        type="text"
        value={authors}
        onChange={(e) => onAuthorsChange(e.target.value)}
        placeholder="alperunlu07, ci-bot   (empty = anyone with write access)"
        className="w-full rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-xs text-slate-200 focus:border-sky-500 focus:outline-none"
      />
    </div>
  );
}
