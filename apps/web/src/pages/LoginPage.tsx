// Cluster 11.A — login screen.
//
// Only routed to when `auth.enabled === true` and there's no active
// session. The `App.tsx` shell calls `refreshAuth()` on boot which sets
// the view to `/login` automatically when the server says auth is on but
// nobody is signed in. After a successful login we hop back to `/`.

import { AlertCircle, Lock, LogIn } from 'lucide-react';
import { useState } from 'react';
import { useStore } from '../store/store';

export function LoginPage() {
  const login = useStore((s) => s.login);
  const setView = useStore((s) => s.setView);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      setView({ type: 'home' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-full items-center justify-center bg-slate-950 px-4">
      <form
        onSubmit={onSubmit}
        className="density-card w-full max-w-sm space-y-4 rounded-lg border border-slate-800 bg-slate-900 p-6 shadow-xl"
      >
        <div className="flex items-center gap-2">
          <Lock size={18} className="text-sky-400" />
          <h1 className="text-lg font-semibold text-slate-100">Sign in to BuildPilot</h1>
        </div>
        <p className="text-xs text-slate-400">
          Enter your username and password. Sessions remain valid for 30 days.
        </p>

        <div className="space-y-1">
          <label htmlFor="login-username" className="text-xs font-medium text-slate-300">
            Username
          </label>
          <input
            id="login-username"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
            required
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="login-password" className="text-xs font-medium text-slate-300">
            Password
          </label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="focusable w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-sky-500"
            required
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-rose-700/50 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !username || !password}
          className="focusable flex w-full items-center justify-center gap-2 rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn size={14} />
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
