import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store/store';
import { Dialog } from './ui/Dialog';

interface Props {
  open: boolean;
  onClose(): void;
}

export function AddProjectDialog({ open, onClose }: Props) {
  const addProject = useStore((s) => s.addProject);
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await addProject({ path: path.trim(), name: name.trim() || undefined });
      setPath('');
      setName('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} ariaLabel="Add project" size="md">
      <form onSubmit={submit}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-text-primary">Add project</h2>
          <button
            type="button"
            onClick={onClose}
            className="focusable rounded text-text-muted hover:text-text-primary"
            aria-label="Close add-project dialog"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
            Repository path
          </span>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\Users\you\code\my-repo"
            required
            spellCheck={false}
            data-autofocus
            className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm font-mono text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-text-muted">
            Display name (optional)
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Defaults to folder name"
            className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
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
            className="focusable rounded-md px-3 py-1.5 text-sm text-text-muted hover:text-text-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !path.trim()}
            className="focusable rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated"
          >
            {busy ? 'Adding…' : 'Add project'}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
