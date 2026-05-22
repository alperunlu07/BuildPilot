// Cluster 11.A — per-user account settings.
//
// Two cards on this page:
//   1. Profile — display name + password change.
//   2. Notification preferences — desktop/telegram/slack/discord/email
//      toggles. These reduce out-of-band noise for users who, e.g., only
//      want desktop pings but no Telegram/Slack chatter.

import { useEffect, useState } from 'react';
import { AlertCircle, Bell, CheckCircle2, User as UserIcon } from 'lucide-react';
import type { NotificationPrefs } from '@buildpilot/shared-types';
import { DEFAULT_NOTIFICATION_PREFS } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { api } from '../lib/api';
import { PageContainer } from '../components/ui/PageContainer';

export function AccountPage() {
  const currentUser = useStore((s) => s.currentUser);
  const refreshAuth = useStore((s) => s.refreshAuth);
  const authEnabled = useStore((s) => s.authEnabled);

  if (!authEnabled) {
    return (
      <PageContainer maxWidth="42rem" className="space-y-4">
        <h1 className="text-xl font-semibold text-text-primary">Account</h1>
        <div className="rounded-md border border-border-subtle bg-bg-panel/60 p-4 text-sm text-text-secondary">
          Auth is disabled on this BuildPilot instance, so per-user account
          settings don't apply yet. Flip{' '}
          <code className="rounded bg-bg-elevated px-1 py-0.5 text-xs">auth.enabled</code>{' '}
          to <code className="rounded bg-bg-elevated px-1 py-0.5 text-xs">true</code>{' '}
          in <code className="rounded bg-bg-elevated px-1 py-0.5 text-xs">~/.buildpilot/config.json</code>{' '}
          to activate.
        </div>
      </PageContainer>
    );
  }

  if (!currentUser) {
    return (
      <PageContainer maxWidth="42rem" className="space-y-4">
        <h1 className="text-xl font-semibold text-text-primary">Account</h1>
        <div className="text-sm text-text-muted">Not signed in.</div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="42rem" className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-text-primary">Account</h1>
        <p className="text-xs text-text-muted">Update your profile and notification routing.</p>
      </header>

      <ProfileCard
        currentUser={currentUser}
        onSaved={() => void refreshAuth()}
      />
      <NotificationPrefsCard
        currentPrefs={currentUser.notificationPrefs ?? DEFAULT_NOTIFICATION_PREFS}
        onSaved={() => void refreshAuth()}
      />
    </PageContainer>
  );
}

function ProfileCard({
  currentUser,
  onSaved,
}: {
  currentUser: { id: string; displayName: string };
  onSaved(): void;
}) {
  const [displayName, setDisplayName] = useState(currentUser.displayName);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    if (password && password !== confirm) {
      setError('passwords do not match');
      return;
    }
    setSaving(true);
    try {
      const patch: { displayName?: string; password?: string } = {};
      if (displayName.trim() && displayName !== currentUser.displayName) {
        patch.displayName = displayName.trim();
      }
      if (password) {
        patch.password = password;
      }
      if (Object.keys(patch).length === 0) {
        setError('nothing to update');
        return;
      }
      await api.updateCurrentUser(patch);
      setPassword('');
      setConfirm('');
      setSavedAt(Date.now());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="density-card space-y-3 rounded-md border border-border-subtle bg-bg-panel/60 p-5"
    >
      <div className="flex items-center gap-2">
        <UserIcon size={16} className="text-accent" />
        <h2 className="text-sm font-semibold text-text-primary">Profile</h2>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-text-secondary">Display name</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">New password</label>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
            placeholder="Leave blank to keep current"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-text-secondary">Confirm new password</label>
          <input
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
            className="focusable w-full rounded-md border border-border-subtle bg-bg-base px-2 py-1.5 text-sm text-text-primary outline-none focus:border-accent"
          />
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-rose-700/50 bg-rose-900/30 px-2 py-1.5 text-xs text-rose-200">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {savedAt && !error && (
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 size={13} /> Saved.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="focusable rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </form>
  );
}

function NotificationPrefsCard({
  currentPrefs,
  onSaved,
}: {
  currentPrefs: NotificationPrefs;
  onSaved(): void;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(currentPrefs);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPrefs(currentPrefs);
  }, [currentPrefs]);

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      await api.updateNotificationPrefs(prefs);
      setSavedAt(Date.now());
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof NotificationPrefs): void {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
  }

  const channels: Array<{ key: keyof NotificationPrefs; label: string; hint: string }> = [
    { key: 'desktop', label: 'Desktop', hint: 'Browser notifications when the tab is unfocused' },
    { key: 'telegram', label: 'Telegram', hint: 'Personal mentions via the configured Telegram bot' },
    { key: 'slack', label: 'Slack', hint: 'Per-user DM routing for the Slack bot' },
    { key: 'discord', label: 'Discord', hint: 'Per-user DM routing for the Discord bot' },
    { key: 'email', label: 'Email', hint: 'Reserved — email delivery not yet implemented' },
  ];

  return (
    <div className="density-card space-y-3 rounded-md border border-border-subtle bg-bg-panel/60 p-5">
      <div className="flex items-center gap-2">
        <Bell size={16} className="text-amber-400" />
        <h2 className="text-sm font-semibold text-text-primary">Notification preferences</h2>
      </div>
      <p className="text-xs text-text-muted">
        Controls which channels deliver mentions and approval prompts to you specifically.
        Channel-level configuration (bot tokens, default chat IDs) still lives on the
        Settings page.
      </p>
      <ul className="space-y-1">
        {channels.map((c) => (
          <li
            key={c.key}
            className="flex items-center justify-between rounded-md border border-border-subtle bg-bg-base/40 px-3 py-2"
          >
            <div>
              <div className="text-sm text-text-primary">{c.label}</div>
              <div className="text-[11px] text-text-muted">{c.hint}</div>
            </div>
            <label className="inline-flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={prefs[c.key]}
                onChange={() => toggle(c.key)}
                className="h-4 w-4 rounded border-border bg-bg-panel text-sky-500 focus:ring-sky-500"
              />
              <span className="text-xs text-text-secondary">{prefs[c.key] ? 'On' : 'Off'}</span>
            </label>
          </li>
        ))}
      </ul>
      {error && (
        <div className="rounded border border-rose-700/50 bg-rose-900/30 px-2 py-1 text-xs text-rose-200">
          {error}
        </div>
      )}
      {savedAt && !error && (
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <CheckCircle2 size={13} /> Preferences saved.
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => void save()}
          disabled={saving}
          className="focusable rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
      </div>
    </div>
  );
}
