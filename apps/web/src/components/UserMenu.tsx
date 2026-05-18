// Cluster 11.A — profile dropdown for the sidebar header.
//
// Renders one of three modes:
//   - auth disabled: nothing (existing dashboards stay clean).
//   - auth enabled + signed in: avatar + name + dropdown with role,
//     "Account settings", "API tokens", "Audit log", "Sign out".
//   - auth enabled + no session: a small "Sign in" link.

import { useEffect, useRef, useState } from 'react';
import {
  ClipboardList,
  KeyRound,
  LogIn,
  LogOut,
  Settings,
  Users,
} from 'lucide-react';
import { useStore } from '../store/store';
import { cn } from '../lib/cn';

// Deterministic color per username so the avatar bubble stays consistent.
function colorFor(name: string): string {
  const palette = [
    'bg-sky-600',
    'bg-emerald-600',
    'bg-amber-600',
    'bg-violet-600',
    'bg-rose-600',
    'bg-teal-600',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return palette[h % palette.length]!;
}

function initial(name: string): string {
  const c = name.trim().charAt(0).toUpperCase();
  return c || '?';
}

export function UserMenu() {
  const authEnabled = useStore((s) => s.authEnabled);
  const currentUser = useStore((s) => s.currentUser);
  const setView = useStore((s) => s.setView);
  const logout = useStore((s) => s.logout);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  // Close on outside click + Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!authEnabled) return null;

  if (!currentUser) {
    return (
      <button
        type="button"
        onClick={() => setView({ type: 'login' })}
        className="focusable flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:border-sky-500 hover:text-sky-300"
        title="Sign in"
      >
        <LogIn size={12} />
        Sign in
      </button>
    );
  }

  const label = currentUser.displayName || currentUser.username;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          'focusable flex items-center gap-2 rounded-md border border-slate-700 px-1.5 py-1 text-left hover:border-sky-500',
        )}
        title={`Signed in as ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold text-white',
            colorFor(currentUser.username),
          )}
        >
          {initial(label)}
        </span>
        <span className="hidden min-w-0 flex-col text-left sm:flex">
          <span className="truncate text-xs font-medium text-slate-200">{label}</span>
          <span className="truncate text-[10px] uppercase tracking-wide text-slate-400">
            {currentUser.role}
          </span>
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-md border border-slate-700 bg-slate-900 shadow-2xl"
        >
          <div className="border-b border-slate-700 px-3 py-2">
            <div className="truncate text-sm font-medium text-slate-100">{label}</div>
            <div className="truncate text-[11px] text-slate-400">@{currentUser.username}</div>
            <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
              {currentUser.role}
            </div>
          </div>
          <MenuItem
            icon={<Settings size={13} />}
            label="Account settings"
            onClick={() => {
              setOpen(false);
              setView({ type: 'account' });
            }}
          />
          {currentUser.role === 'admin' && (
            <MenuItem
              icon={<Users size={13} />}
              label="Users"
              onClick={() => {
                setOpen(false);
                setView({ type: 'users' });
              }}
            />
          )}
          <MenuItem
            icon={<KeyRound size={13} />}
            label="API tokens"
            onClick={() => {
              setOpen(false);
              setView({ type: 'apiTokens' });
            }}
          />
          {(currentUser.role === 'admin' || currentUser.role === 'maintainer') && (
            <MenuItem
              icon={<ClipboardList size={13} />}
              label="Audit log"
              onClick={() => {
                setOpen(false);
                setView({ type: 'audit' });
              }}
            />
          )}
          <div className="border-t border-slate-800" />
          <MenuItem
            icon={<LogOut size={13} />}
            label="Sign out"
            onClick={async () => {
              setOpen(false);
              await logout();
            }}
          />
        </div>
      )}
    </div>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="focusable flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-slate-200 hover:bg-slate-800"
    >
      <span className="shrink-0 text-slate-400">{icon}</span>
      <span>{label}</span>
    </button>
  );
}
