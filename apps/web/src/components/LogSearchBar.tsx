import { useMemo } from 'react';
import { Regex, Search, X } from 'lucide-react';
import { cn } from '../lib/cn';

interface Props {
  query: string;
  onQueryChange(q: string): void;
  regex: boolean;
  onRegexChange(on: boolean): void;
  // null = valid (or empty); string = regex compile error to surface inline.
  regexError?: string | null;
  // Optional trailing slot for parent-provided buttons (presets, etc.).
  trailing?: React.ReactNode;
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
}: Props) {
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
      {trailing}
    </div>
  );
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
