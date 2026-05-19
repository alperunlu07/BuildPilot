import { useEffect, useMemo, useRef, useState } from 'react';
import type { Secret, VaultFile } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { cn } from '../lib/cn';

// Cluster 11.B item 1 — `${{ secrets.X }}` / `${{ files.X }}` autocomplete.
// Wraps an <input>/<textarea> and intercepts typing of the `${{ s` /
// `${{ f` trigger sequences to surface a suggestion list of every secret
// or vault file name. The wrapped element is rendered as a slot so the
// caller controls value/onChange/style — the wrapper only contributes
// the dropdown overlay.

interface SecretLike {
  name: string;
}

interface Props {
  // Current value of the wrapped input. The autocomplete consumes it as
  // a controlled value so it can track caret position relative to the
  // last marker prefix.
  value: string;
  onChange(next: string): void;
  // Element that gets the value/onChange + ref. Use 'input' for text
  // fields and 'textarea' for multi-line panels.
  as?: 'input' | 'textarea';
  placeholder?: string;
  className?: string;
  rows?: number;
  spellCheck?: boolean;
  onBlur?(): void;
  onFocus?(): void;
  // Optional list overrides. When omitted the component fetches the live
  // catalogue once on first mount and caches it for the lifetime of the
  // page; the cache key flips when a secret/file list change is detected.
  secrets?: SecretLike[];
  files?: SecretLike[];
}

// Tiny in-module cache so every input on the StepPropertyPanel shares one
// network round-trip. Refresh when the user clicks the "reload" affordance
// in the dropdown footer.
let _cache: { secrets: Secret[]; files: VaultFile[]; loadedAt: number } | null = null;
async function loadCatalogue(force = false): Promise<{
  secrets: Secret[];
  files: VaultFile[];
}> {
  if (_cache && !force) return { secrets: _cache.secrets, files: _cache.files };
  const [secrets, files] = await Promise.all([api.listSecrets(), api.listVaultFiles()]);
  _cache = { secrets, files, loadedAt: Date.now() };
  return { secrets, files };
}

interface ActiveMarker {
  // 'secrets' or 'files' kind, derived from the character after `${{ `.
  kind: 'secrets' | 'files';
  // Index of the opening `${{` in the value.
  start: number;
  // Index of the cursor (used as the end of the typed query).
  end: number;
  // The fragment typed after `secrets.` / `files.` so far.
  query: string;
}

// Reverse-scan the value for an unclosed `${{ ... ` marker that the cursor
// sits inside. Returns null when there's no active marker.
function detectActiveMarker(value: string, caret: number): ActiveMarker | null {
  // Look back from the caret for the most recent `${{` not yet closed by `}}`.
  const open = value.lastIndexOf('${{', caret - 1);
  if (open === -1) return null;
  const close = value.indexOf('}}', open);
  if (close !== -1 && close < caret) return null;
  const inside = value.slice(open + 3, caret);
  // Tolerate leading whitespace between `${{` and `secrets.` / `files.`.
  const m = inside.match(/^\s*(secrets|files)\.([A-Za-z0-9_]*)$/);
  if (!m) {
    // Also fire when the user has just typed `${{ s` or `${{ f` — we want
    // to suggest BOTH `secrets.` and `files.` completions to nudge them.
    const partial = inside.match(/^\s*([sf][a-z]*)$/);
    if (partial) {
      return {
        kind: partial[1]!.startsWith('f') ? 'files' : 'secrets',
        start: open,
        end: caret,
        query: '',
      };
    }
    return null;
  }
  return {
    kind: m[1] as 'secrets' | 'files',
    start: open,
    end: caret,
    query: m[2] ?? '',
  };
}

export function SecretReferenceAutocomplete({
  value,
  onChange,
  as = 'input',
  placeholder,
  className,
  rows,
  spellCheck,
  onBlur,
  onFocus,
  secrets: explicitSecrets,
  files: explicitFiles,
}: Props) {
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const [catalogue, setCatalogue] = useState<{
    secrets: SecretLike[];
    files: SecretLike[];
  }>({ secrets: [], files: [] });
  const [marker, setMarker] = useState<ActiveMarker | null>(null);
  const [highlight, setHighlight] = useState(0);

  // Pull the live catalogue once. The component-shared cache means the N
  // sensitive fields in a property panel only cost one round-trip per page.
  useEffect(() => {
    if (explicitSecrets && explicitFiles) {
      setCatalogue({ secrets: explicitSecrets, files: explicitFiles });
      return;
    }
    let cancelled = false;
    loadCatalogue()
      .then((cat) => {
        if (!cancelled) setCatalogue(cat);
      })
      .catch(() => {
        // Best-effort: if the API fails we just don't show suggestions.
        if (!cancelled) setCatalogue({ secrets: [], files: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [explicitSecrets, explicitFiles]);

  const suggestions = useMemo(() => {
    if (!marker) return [];
    const list = marker.kind === 'secrets' ? catalogue.secrets : catalogue.files;
    const q = marker.query.toLowerCase();
    return list
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [marker, catalogue]);

  function commit(name: string) {
    if (!marker) return;
    const before = value.slice(0, marker.start);
    const after = value.slice(marker.end);
    // Skip the closing `}}` if it's already there.
    const closing = after.startsWith('}}') ? '' : ' }}';
    const inserted = `\${{ ${marker.kind}.${name}${closing}`;
    const newValue = before + inserted + after;
    onChange(newValue);
    setMarker(null);
    // Move caret past the inserted block on the next tick.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const pos = before.length + inserted.length;
      el.setSelectionRange(pos, pos);
      el.focus();
    });
  }

  function refreshMarker(target: HTMLInputElement | HTMLTextAreaElement) {
    const caret = target.selectionStart ?? target.value.length;
    const next = detectActiveMarker(target.value, caret);
    setMarker(next);
    setHighlight(0);
  }

  const sharedProps = {
    ref: (el: HTMLInputElement | HTMLTextAreaElement | null) => {
      ref.current = el;
    },
    value,
    placeholder,
    spellCheck,
    className,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      onChange(e.target.value);
      refreshMarker(e.target);
    },
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      // Arrow-key cursor moves also reposition the marker but don't fire
      // onChange, so keep the dropdown in sync via onKeyUp.
      refreshMarker(e.currentTarget);
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!marker || suggestions.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlight((h) => (h + 1) % suggestions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
      } else if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        commit(suggestions[highlight]!.name);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setMarker(null);
      }
    },
    onBlur: () => {
      // Delay so a click on a suggestion can still register before close.
      setTimeout(() => setMarker(null), 100);
      onBlur?.();
    },
    onFocus,
  };

  return (
    <div className="relative">
      {as === 'textarea' ? (
        <textarea
          {...(sharedProps as React.TextareaHTMLAttributes<HTMLTextAreaElement>)}
          rows={rows}
        />
      ) : (
        <input
          {...(sharedProps as React.InputHTMLAttributes<HTMLInputElement>)}
          type="text"
        />
      )}
      {marker && suggestions.length > 0 && (
        <ul
          role="listbox"
          aria-label={`${marker.kind} suggestions`}
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-y-auto rounded-md border border-slate-700 bg-slate-900 py-1 text-sm shadow-lg"
        >
          {suggestions.map((s, i) => (
            <li key={s.name}>
              <button
                type="button"
                onMouseDown={(e) => {
                  // mousedown fires before blur, so we get to handle the
                  // click without the deferred-close racing us.
                  e.preventDefault();
                  commit(s.name);
                }}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-1 text-left text-slate-200',
                  i === highlight ? 'bg-slate-800' : 'hover:bg-slate-800/60',
                )}
              >
                <span className="font-mono">{s.name}</span>
                <span className="text-[10px] uppercase text-slate-400">
                  {marker.kind === 'secrets' ? 'secret' : 'file'}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Reset the autocomplete catalogue cache. Called when the user creates /
// rotates / deletes a secret so the dropdown sees the change without a
// page reload.
export function invalidateSecretCatalogue(): void {
  _cache = null;
}
