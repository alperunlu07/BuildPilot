import { useState } from 'react';
import { X } from 'lucide-react';
import { useStore } from '../store/store';

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

  if (!open) return null;

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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-[480px] rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Add project</h2>
          <button
            type="button"
            onClick={onClose}
            className="focusable rounded text-slate-400 hover:text-slate-200"
            aria-label="Close add-project dialog"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
            Repository path
          </span>
          <input
            type="text"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\Users\you\code\my-repo"
            required
            spellCheck={false}
            autoFocus
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm font-mono text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
          />
        </label>

        <label className="mb-4 block">
          <span className="mb-1 block text-xs uppercase tracking-wide text-slate-400">
            Display name (optional)
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Defaults to folder name"
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
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
            className="focusable rounded-md px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy || !path.trim()}
            className="focusable rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-slate-700"
          >
            {busy ? 'Adding…' : 'Add project'}
          </button>
        </div>
      </form>
    </div>
  );
}
