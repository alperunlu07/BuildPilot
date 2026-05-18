import { useEffect, useMemo, useState } from 'react';
import { Bookmark, Plus, Regex, Search, Trash2, X } from 'lucide-react';
import { cn } from '../lib/cn';

export interface SavedLogFilter {
  id: string;
  name: string;
  query: string;
  regex: boolean;
}

interface Props {
  query: string;
  onQueryChange(q: string): void;
  regex: boolean;
  onRegexChange(on: boolean): void;
  // null = valid (or empty); string = regex compile error to surface inline.
  regexError?: string | null;
  // Optional trailing slot for parent-provided buttons.
  trailing?: React.ReactNode;
  // Saved filter presets — when omitted the presets dropdown is hidden.
  presets?: SavedLogFilter[];
  onApplyPreset?(p: SavedLogFilter): void;
  onSavePreset?(name: string): void;
  onDeletePreset?(id: string): void;
}

// Compact search bar used by BuildDetailPage / BuildLogPanel.
// Owns nothing — query + regex live in the parent so they can be persisted
// or re-applied via saved presets.
export function LogSearchBar({
  query,
  onQueryChange,
  regex,
  onRegexChange,
  regexError,
  trailing,
  presets,
  onApplyPreset,
  onSavePreset,
  onDeletePreset,
}: Props) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [newName, setNewName] = useState('');
  useEffect(() => {
    if (!presetsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest('[data-log-presets]')) setPresetsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [presetsOpen]);

  return (
    <div className="flex flex-1 items-center gap-1.5">
      <div
        className={cn(
          'flex flex-1 items-center gap-1 rounded-md border bg-slate-900 px-2 py-1 text-xs',
          regexError ? 'border-rose-700' : 'border-slate-700 focus-within:border-sky-500',
        )}
      >
        <Search size={12} className="text-slate-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder={regex ? 'Regex (e.g. ^error|warning)' : 'Filter messages…'}
          className="min-w-0 flex-1 bg-transparent text-slate-100 placeholder-slate-600 focus:outline-none"
        />
        {query && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            className="text-slate-500 hover:text-slate-300"
            title="Clear"
          >
            <X size={12} />
          </button>
        )}
        <button
          type="button"
          onClick={() => onRegexChange(!regex)}
          className={cn(
            'rounded px-1 py-0.5',
            regex
              ? 'bg-sky-900/60 text-sky-300'
              : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300',
          )}
          title={regex ? 'Disable regex' : 'Enable regex mode'}
        >
          <Regex size={12} />
        </button>
      </div>
      {regexError && (
        <span className="text-[10px] text-rose-300" title={regexError}>
          regex err
        </span>
      )}
      {presets && onApplyPreset && onSavePreset && onDeletePreset && (
        <div className="relative" data-log-presets>
          <button
            type="button"
            onClick={() => setPresetsOpen((o) => !o)}
            className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] text-slate-300 hover:border-sky-500 hover:text-sky-400"
            title="Saved filter presets"
          >
            <Bookmark size={12} /> Presets
            {presets.length > 0 && (
              <span className="rounded-full bg-slate-800 px-1.5 text-[10px] text-slate-400">
                {presets.length}
              </span>
            )}
          </button>
          {presetsOpen && (
            <div className="absolute right-0 top-full z-30 mt-1 w-72 rounded-md border border-slate-700 bg-slate-900 p-2 text-xs shadow-lg">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-slate-500">
                Saved filters
              </div>
              {presets.length === 0 ? (
                <div className="px-1 py-1 text-slate-500">No saved filters yet.</div>
              ) : (
                <ul className="max-h-48 space-y-0.5 overflow-y-auto">
                  {presets.map((p) => (
                    <li
                      key={p.id}
                      className="group flex items-center justify-between gap-1 rounded px-1.5 py-1 hover:bg-slate-800"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onApplyPreset(p);
                          setPresetsOpen(false);
                        }}
                        className="min-w-0 flex-1 text-left text-slate-200"
                        title={`${p.regex ? 'regex: ' : ''}${p.query}`}
                      >
                        <div className="truncate font-medium">{p.name}</div>
                        <div className="truncate font-mono text-[10px] text-slate-500">
                          {p.regex ? '/' : ''}
                          {p.query}
                          {p.regex ? '/' : ''}
                        </div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePreset(p.id)}
                        className="shrink-0 text-slate-600 opacity-0 hover:text-rose-400 group-hover:opacity-100"
                        title="Delete preset"
                      >
                        <Trash2 size={11} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-2 flex items-center gap-1 border-t border-slate-800 pt-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Save current as…"
                  className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 py-1 text-slate-200 placeholder-slate-600 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={!newName.trim() || !query.trim()}
                  onClick={() => {
                    onSavePreset(newName.trim());
                    setNewName('');
                  }}
                  className="inline-flex items-center gap-1 rounded border border-sky-700 px-1.5 py-1 text-sky-300 hover:border-sky-500 disabled:opacity-40"
                  title={!query.trim() ? 'Type a filter first' : 'Save preset'}
                >
                  <Plus size={11} /> Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {trailing}
    </div>
  );
}

// LocalStorage backing for filter presets — shared across builds.
const PRESETS_KEY = 'buildpilot:logFilterPresets:v1';
const SEED_PRESETS: SavedLogFilter[] = [
  { id: 'errors-only', name: 'Errors only', query: 'error|fail|fatal', regex: true },
  { id: 'xcode-warn', name: 'Xcode warnings', query: ': warning:', regex: false },
  { id: 'build-cmds', name: 'Build commands', query: '^(\\$|>|exec)', regex: true },
];

export function loadLogPresets(): SavedLogFilter[] {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    if (!raw) return SEED_PRESETS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return SEED_PRESETS;
    return parsed.filter(
      (p): p is SavedLogFilter =>
        p && typeof p.id === 'string' && typeof p.name === 'string' && typeof p.query === 'string',
    );
  } catch {
    return SEED_PRESETS;
  }
}

export function saveLogPresets(list: SavedLogFilter[]): void {
  try {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(list));
  } catch {
    /* quota / disabled storage — best-effort */
  }
}

// Compile a query into an (entry-message) → matched predicate. Handles the
// regex error path with a graceful fallback (matches nothing on bad regex
// so the user sees the empty result + error chip instead of a JS exception).
export function useCompiledFilter(query: string, regex: boolean): {
  match(message: string): boolean;
  error: string | null;
} {
  return useMemo(() => {
    if (!query) return { match: () => true, error: null };
    if (regex) {
      try {
        const re = new RegExp(query, 'i');
        return { match: (m: string) => re.test(m), error: null };
      } catch (err) {
        return { match: () => false, error: err instanceof Error ? err.message : String(err) };
      }
    }
    const needle = query.toLowerCase();
    return { match: (m: string) => m.toLowerCase().includes(needle), error: null };
  }, [query, regex]);
}
