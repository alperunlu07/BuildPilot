// Tiny wrapper around the browser Notification API. We only fire native
// notifications when the tab is hidden (or unfocused) so the in-page toast
// covers the visible case without surfacing two prompts at once.

const STORAGE_KEY = 'buildpilot.nativeNotifications';

export type NotificationsState = 'unsupported' | 'denied' | 'default' | 'granted';

export function notificationsState(): NotificationsState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  return Notification.permission as NotificationsState;
}

export function notificationsEnabled(): boolean {
  if (notificationsState() !== 'granted') return false;
  const v = localStorage.getItem(STORAGE_KEY);
  // Default ON once permission is granted; users can mute via setEnabled(false).
  return v === null ? true : v === '1';
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
