import type { ReactNode } from 'react';
import { AlertTriangle, Check, Info } from 'lucide-react';
import { cn } from '../../lib/cn';

export type SettingsBannerKind = 'ok' | 'danger' | 'info';

// Ports docs/designs/extras.css `.settings-banner.ok / .danger`. Used
// for prominent inline notes that need their own block (e.g. "Binding
// to 0.0.0.0 has no auth" or "No external connections active").
export interface SettingsBannerProps {
  kind: SettingsBannerKind;
  title: ReactNode;
  body?: ReactNode;
  // Default false — when true the banner sits flush at the edges
  // (margin removed). Useful when the banner is embedded inside a
  // SettingsGroup body directly.
  flush?: boolean;
}

const ICONS = {
  ok: Check,
  danger: AlertTriangle,
  info: Info,
} as const;

export function SettingsBanner({ kind, title, body, flush = false }: SettingsBannerProps) {
  const Icon = ICONS[kind];
  return (
    <div
      className={cn(
        'flex items-start gap-2.5 rounded-md border px-3.5 py-3',
        flush ? '' : 'mx-4 my-3',
        kind === 'ok' && 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-300',
        kind === 'danger' && 'border-rose-500/25 bg-rose-500/[0.08] text-rose-300',
        kind === 'info' && 'border-sky-500/25 bg-sky-500/[0.06] text-sky-300',
      )}
    >
      <Icon size={13} className="mt-0.5 shrink-0" />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[12.5px] font-medium">{title}</span>
        {body && <span className="text-[11.5px] leading-snug opacity-90">{body}</span>}
      </div>
    </div>
  );
}
