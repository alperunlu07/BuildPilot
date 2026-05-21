import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { StepType } from '@buildpilot/shared-types';
import { STEP_DEFINITIONS } from '@buildpilot/step-registry';

interface Props {
  open: boolean;
  // The data that will be cloned into the template — already stripped of
  // runtime fields by the caller.
  baseStepType: StepType;
  initialName?: string;
  onClose(): void;
  onSubmit(input: { name: string; description: string | null }): void | Promise<void>;
}

export function SaveTemplateDialog({
  open,
  baseStepType,
  initialName,
  onClose,
  onSubmit,
}: Props) {
  const [name, setName] = useState(initialName ?? '');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(initialName ?? '');
      setDescription('');
      setError(null);
      setBusy(false);
    }
  }, [open, initialName]);

  if (!open) return null;
  const def = STEP_DEFINITIONS[baseStepType];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Template name is required.');
      return;
    }
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bg-base/70 backdrop-blur-sm p-3 sm:p-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        // Responsive overhaul Faz 2 — phone-width fluid, snaps to 440px sm+.
        className="w-full max-h-[calc(100dvh-24px)] overflow-y-auto sm:w-[440px] rounded-lg border border-border-subtle bg-bg-panel p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Save as node template</h2>
          <button type="button" onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <p className="mb-4 text-xs text-text-muted">
          Saves the current node's field values as a reusable palette entry. Based on{' '}
          <span
            className="rounded px-1.5 py-0.5 font-medium text-text-primary"
            style={{ backgroundColor: `${def.color}25`, color: def.color }}
          >
            {def.label}
          </span>
          . You can drag the saved template into any pipeline; editing the template later
          does not change nodes already placed.
        </p>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">Name</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Compress to RAR"
            required
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
            Description (optional)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="WinRAR a -r Server.rar Server\\*"
            rows={2}
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-[12px] text-text-primary focus:border-accent focus:outline-none"
          />
        </label>

        {error && (
          <div className="mb-3 rounded-md border border-rose-800 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated"
          >
            {busy ? 'Saving…' : 'Save template'}
          </button>
        </div>
      </form>
    </div>
  );
}
