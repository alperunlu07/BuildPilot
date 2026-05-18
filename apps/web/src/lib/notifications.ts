// Tiny wrapper around the browser Notification API. We only fire native
// notifications when the tab is hidden (or unfocused) so the in-page toast
// covers the visible case without surfacing two prompts at once.
//
// Cluster 11.A — when auth is enabled and the current user has explicitly
// opted out of desktop notifications via their account preferences, we
// suppress the native notification regardless of the local opt-in below.
// When auth is disabled the preference layer is bypassed and the existing
// behavior is preserved.

const STORAGE_KEY = 'buildpilot.nativeNotifications';

// Bridge for the Zustand store to publish the current user's desktop
// preference without notifications.ts having to import the store module
// (which would create a cycle: store -> notifications -> store).
//
// `App.tsx` subscribes to the store and pushes the value in here on every
// change; default is `true` so behavior matches today before the bridge
// has any chance to fire.
let desktopAllowedByUserPref = true;

export function setDesktopNotificationsAllowedByUserPref(v: boolean): void {
  desktopAllowedByUserPref = v;
}

export type NotificationsState = 'unsupported' | 'denied' | 'default' | 'granted';

export function notificationsState(): NotificationsState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationsState;
}

export function notificationsEnabled(): boolean {
  if (notificationsState() !== 'granted') return false;
  const v = localStorage.getItem(STORAGE_KEY);
  // Default ON once permission is granted; users can mute via setEnabled(false).
  const local = v === null ? true : v === '1';
  if (!local) return false;
  // Per-user override (Cluster 11.A). The bridge above is updated by
  // App.tsx whenever the current user's preferences change; when auth is
  // disabled it stays true and preserves the pre-existing behavior.
  return desktopAllowedByUserPref;
}

export function setEnabled(on: boolean): void {
  localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
}

export async function ensurePermission(): Promise<NotificationsState> {
  const state = notificationsState();
  if (state === 'unsupported' || state === 'granted' || state === 'denied') return state;
  const result = await Notification.requestPermission();
  return result as NotificationsState;
}

interface NotifyOptions {
  title: string;
  body: string;
  tag?: string;
  onClick?: () => void;
  // When true, fire even if the tab is focused. Defaults to false so the
  // in-page toast handles foreground visibility on its own.
  alwaysShow?: boolean;
}

export function notify(opts: NotifyOptions): void {
  if (!notificationsEnabled()) return;
  const focused =
    typeof document !== 'undefined' && document.visibilityState === 'visible' && document.hasFocus();
  if (focused && !opts.alwaysShow) return;

  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      tag: opts.tag,
      icon: '/favicon.ico',
    });
    if (opts.onClick) {
      n.onclick = () => {
        window.focus();
        opts.onClick?.();
        n.close();
      };
    }
  } catch {
    // ignore — some browsers throw if permission was revoked mid-session.
  }
}
