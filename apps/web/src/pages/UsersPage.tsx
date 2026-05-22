// Cluster 11.A — admin-only user management page.

import { useEffect, useState } from 'react';
import { AlertCircle, Plus, Trash2, UserPlus } from 'lucide-react';
import type { User, UserRole } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';

const ROLES: UserRole[] = ['admin', 'maintainer', 'viewer'];

export function UsersPage() {
  const currentUser = useStore((s) => s.currentUser);
  const authEnabled = useStore((s) => s.authEnabled);
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  async function reload(): Promise<void> {
    try {
      setLoading(true);
      setUsers(await api.listUsers());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  async function setRole(u: User, role: UserRole): Promise<void> {
    try {
      await api.updateUser(u.id, { role });
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function remove(u: User): Promise<void> {
    if (!window.confirm(`Delete user "${u.username}"? Sessions and tokens are revoked too.`)) {
      return;
    }
    try {
      await api.deleteUser(u.id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const isAdmin = !authEnabled || currentUser?.role === 'admin';

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-3 sm:p-4 md:p-6">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Users</h1>
          <p className="text-xs text-text-muted">
            {authEnabled
              ? 'Manage accounts that can sign into this BuildPilot instance.'
              : 'Auth is disabled — users you create here become active once you flip auth.enabled in config.json.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="focusable flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
          >
            <UserPlus size={14} />
            New user
          </button>
        )}
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-700/50 bg-rose-900/30 px-3 py-2 text-xs text-rose-200">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-text-muted">Loading…</div>
      ) : users.length === 0 ? (
        <div className="rounded-md border border-border-subtle bg-bg-panel/60 p-6 text-sm text-text-muted">
          No users yet. Create the first one to enable login.
        </div>
      ) : (
        // Responsive review follow-up — wrap the table in an
        // overflow-x-auto scroller and lift the rounded border to the
        // wrapper. The previous `overflow-hidden` on the table itself
        // suppressed horizontal scroll on iPhone 12 (390px), clipping
        // the trailing Last-login + actions columns with no
        // affordance. `overflow-clip` on the wrapper clips the rounded
        // corners without creating a new scroll container.
        <div className="overflow-clip rounded-md border border-border-subtle">
        <div className="overflow-x-auto overscroll-x-contain">
        <table className="min-w-[640px] w-full text-sm">
          <thead className="bg-bg-panel text-xs uppercase tracking-wider text-text-muted">
            <tr>
              <th className="px-3 py-2 text-left">Username</th>
              <th className="px-3 py-2 text-left">Display name</th>
              <th className="px-3 py-2 text-left">Role</th>
              <th className="px-3 py-2 text-left">Last login</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border-subtle hover:bg-bg-panel/80">
                <td className="px-3 py-2 font-mono text-xs text-text-primary">{u.username}</td>
                <td className="px-3 py-2 text-text-primary">{u.displayName}</td>
                <td className="px-3 py-2">
                  {isAdmin ? (
                    <select
                      value={u.role}
                      onChange={(e) => void setRole(u, e.target.value as UserRole)}
                      className="focusable rounded border border-border-subtle bg-bg-base px-2 py-1 text-xs text-text-primary"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs uppercase text-text-secondary">{u.role}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-text-muted">
                  {u.lastLoginAt
                    ? new Date(u.lastLoginAt).toLocaleString()
                    : <span className="text-text-faint">never</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {isAdmin && currentUser?.id !== u.id && (
                    <button
                      type="button"
                      onClick={() => void remove(u)}
                      className="focusable rounded p-1 text-text-muted hover:text-rose-400"
                      aria-label="Delete user"
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
        </div>
      )}

      {showCreate && (
        <CreateUserDialog
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
          }}
        />
      )}
    </div>
  );
}

function CreateUserDialog({
  onClose,
  onCreated,
}: {
  onClose(): void;
  onCreated(): void;
}) {
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('viewer');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await api.createUser({
        username,
        password,
        displayName: displayName || undefined,
        role,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/70 px-4"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="density-card w-full max-w-md space-y-3 rounded-lg border border-border-subtle bg-bg-panel p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2">
          <Plus size={16} className="text-accent" />
          <h2 className="text-base font-semibold text-text-primary">Create user</h2>
        </div>
        <Field label="Username" value={username} onChange={setUsername} autoComplete="off" />
        <Field
          label="Display name (optional)"
          value={displayName}
          onChange={setDisplayName}
          autoComplete="off"
        />
        <Field
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          autoComplete="new-password"
        />
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="rounded border border-rose-700/50 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="focusable rounded-md border border-border-subtle px-3 py-1.5 text-xs text-text-secondary hover:border-text-faint"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !username || !password}
            className="focusable rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {submitting ? 'Creating…' : 'Create user'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  autoComplete,
}: {
  label: string;
  value: string;
  onChange(v: string): void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-text-secondary">{label}</label>
      <input
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary outline-none placeholder:text-text-faint focus:border-accent"
      />
    </div>
  );
}
