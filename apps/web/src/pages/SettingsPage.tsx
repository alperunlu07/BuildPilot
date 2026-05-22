import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  Copy,
  Database,
  Eye,
  EyeOff,
  FolderOpen,
  Info,
  Layers,
  Lock,
  Plus,
  Send,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AiIntegrationProbeEntry,
  AiIntegrationsConfig,
  AiToolConfig,
  Lane,
  SystemDiskUsage,
  SystemEncryptedFieldsResponse,
  SystemInfo,
  TelegramConfigPublic,
} from '@buildpilot/shared-types';
import { api, LaneInUseError } from '../lib/api';
import { useStore } from '../store/store';
import type { Density, ThemeChoice } from '../lib/theme';
import {
  DEFAULT_ACCENT,
  applyAccent,
  readStoredAccent,
  writeStoredAccent,
} from '../lib/theme';
import i18n from '../lib/i18n';
import { Input } from '../components/ui/Input';
import { Switch } from '../components/ui/Switch';
import {
  SettingsBanner,
  SettingsCode,
  SettingsGroup,
  SettingsRow,
  SettingsTable,
  SettingsTableRow,
  type SettingsTableColumn,
} from '../components/settings';

// UI v2 Settings redesign — ports docs/designs/settings.jsx into the
// real app. The page is a 2-pane switcher: an icon nav on the left,
// one section visible at a time on the right. Every section composes
// the SettingsGroup / SettingsRow / SettingsBanner / SettingsTable /
// SettingsCode primitives so the page reads as a single, consistent
// stack of config blocks rather than the previous per-section card mix.

type SectionId =
  | 'general'
  | 'security'
  | 'notify'
  | 'telegram'
  | 'webhooks'
  | 'ai'
  | 'retention'
  | 'lanes'
  | 'vault'
  | 'access'
  | 'about';

interface SectionDef {
  id: SectionId;
  label: string;
  icon: LucideIcon;
  soon?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'general', label: 'General', icon: SettingsIcon },
  { id: 'security', label: 'Security', icon: Lock },
  { id: 'notify', label: 'Notifications', icon: Bell },
  { id: 'telegram', label: 'Telegram', icon: Send },
  { id: 'webhooks', label: 'Webhooks', icon: Zap },
  { id: 'ai', label: 'AI Integrations', icon: Sparkles },
  { id: 'retention', label: 'Retention', icon: Database },
  { id: 'lanes', label: 'Lanes & Concurrency', icon: Layers },
  { id: 'vault', label: 'File Vault', icon: Lock, soon: true },
  { id: 'access', label: 'Users & Access', icon: Users, soon: true },
  { id: 'about', label: 'About', icon: Info },
];

function isSectionId(value: string): value is SectionId {
  return SECTIONS.some((s) => s.id === value && !s.soon);
}

function readSectionFromHash(): SectionId {
  const raw = window.location.hash.replace(/^#/, '');
  return isSectionId(raw) ? raw : 'general';
}

export function SettingsPage() {
  const [section, setSection] = useState<SectionId>(() => readSectionFromHash());

  // Sync ↔ hash so reloads + deep links preserve position. We only
  // write the hash when the user clicks the nav; URL-driven changes
  // (back/forward) drive state via the hashchange listener.
  useEffect(() => {
    const onHash = (): void => setSection(readSectionFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  // Responsive overhaul follow-up — keep the active tab visible in the
  // horizontal mobile tab strip. Without this, deep-linking to
  // /settings#about lands on the About section but the strip stays
  // anchored on 'General' with no indication of context. Refs are
  // populated by the SECTIONS render below; the effect runs both on
  // section change AND on mount so initial hash navigation scrolls.
  const tabRefs = useRef<Partial<Record<SectionId, HTMLButtonElement | null>>>({});
  useEffect(() => {
    const node = tabRefs.current[section];
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [section]);

  function navigate(id: SectionId): void {
    if (window.location.hash !== `#${id}`) {
      window.history.replaceState(null, '', `#${id}`);
    }
    setSection(id);
  }

  return (
    // Responsive overhaul Faz 3 — was a fixed 220px+1fr 2-column grid
    // that left no room for the content on phones. Below md the layout
    // stacks: nav strip at top (horizontal scroll), content below.
    // The aside reclaims its 220px column at md+.
    <div className="flex h-full min-h-0 flex-col md:grid md:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="shrink-0 overflow-y-auto border-b border-border-subtle bg-bg-panel md:border-b-0 md:border-r">
        <div className="px-4 py-4 md:py-5">
          <h1 className="text-base font-semibold tracking-tight text-text-primary">Settings</h1>
          <p className="hidden md:block mt-1 text-[11px] leading-relaxed text-text-muted">
            Configure BuildPilot · stored in{' '}
            <code className="font-mono text-text-secondary">~/.buildpilot/config.json</code>
          </p>
          {/* Below md the nav scrolls horizontally as a tab-strip so all
              section buttons stay reachable without giving up vertical
              space to a full vertical list. The relative wrapper +
              after:* pseudo paints a right-edge gradient that's only
              visible on the mobile strip, signalling there's more
              content past the viewport edge (iOS Safari hides
              scrollbars by default so we'd otherwise have no hint). */}
          <div className="relative md:contents after:pointer-events-none after:absolute after:right-0 after:top-3 after:h-7 after:w-6 after:bg-gradient-to-l after:from-bg-panel after:to-transparent md:after:hidden">
          <nav
            className="mt-3 flex flex-row gap-1 overflow-x-auto pb-1 md:mt-4 md:flex-col md:gap-px md:overflow-visible md:pb-0"
            aria-label="Settings sections"
          >
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              const active = s.id === section;
              return (
                <button
                  key={s.id}
                  ref={(el) => {
                    tabRefs.current[s.id] = el;
                  }}
                  type="button"
                  onClick={() => !s.soon && navigate(s.id)}
                  disabled={s.soon}
                  aria-current={active ? 'page' : undefined}
                  className={[
                    // Mobile: shrink-0 keeps each tab compact so the row
                    // can scroll horizontally. Above md it goes back to
                    // a full-width vertical button.
                    'relative flex h-7 shrink-0 items-center gap-2 rounded-md px-2.5 text-left text-[12.5px] transition-colors md:w-full md:gap-2.5',
                    active
                      ? 'bg-bg-hover text-text-primary'
                      : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary',
                    s.soon && 'cursor-not-allowed opacity-50 hover:bg-transparent hover:text-text-secondary',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  {/* Active stripe — only shown on the vertical nav (md+);
                      the mobile tab-strip uses bg-bg-hover as the
                      "selected" indicator. */}
                  {active && (
                    <span
                      aria-hidden
                      className="absolute -left-[12px] top-[7px] hidden h-3.5 w-[3px] rounded-sm bg-accent md:block"
                    />
                  )}
                  <Icon size={13} className="shrink-0" />
                  <span className="truncate md:flex-1">{s.label}</span>
                  {s.soon && (
                    <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-text-muted">
                      soon
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
          </div>
        </div>
      </aside>
      <div className="flex-1 overflow-y-auto px-4 pb-8 pt-4 sm:px-6 md:px-8 md:pb-12 md:pt-6">
        <div className="mx-auto max-w-[760px]">
          {section === 'general' && <GeneralSection />}
          {section === 'security' && <SecuritySection />}
          {section === 'notify' && <NotificationsSection />}
          {section === 'telegram' && <TelegramSection />}
          {section === 'webhooks' && <WebhooksSection />}
          {section === 'ai' && <AiIntegrationsSection />}
          {section === 'retention' && <RetentionSection />}
          {section === 'lanes' && <LanesSection />}
          {section === 'vault' && <SoonSection title="File Vault" />}
          {section === 'access' && <SoonSection title="Users & Access" />}
          {section === 'about' && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

// ── Shared helpers ──────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(n >= 100 ? 0 : n >= 10 ? 1 : 2)} ${units[i]}`;
}

function MonoPath({ path, className }: { path: string; className?: string }) {
  return (
    <span
      className={['truncate font-mono text-[11.5px] text-text-secondary', className]
        .filter(Boolean)
        .join(' ')}
      title={path}
    >
      {path}
    </span>
  );
}

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      title={done ? 'Copied' : label}
      aria-label={label}
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
      className="rounded p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
    >
      {done ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// Wrapper around the existing Input primitive that ports the design's
// fixed-width inline-input shape. Settings-page forms tend to want a
// narrow control rather than the full-width Input default.
function InlineInput({
  value,
  onChange,
  width = 200,
  placeholder,
  mono = false,
  type = 'text',
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange?: (v: string) => void;
  width?: number;
  placeholder?: string;
  mono?: boolean;
  type?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <Input
      type={type}
      value={value}
      onChange={(e) => onChange?.(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      aria-label={ariaLabel}
      style={{ width }}
      className={mono ? 'font-mono' : undefined}
    />
  );
}

// Inline <select> wrapper that picks up the same look as InlineInput.
// We use a native <select> rather than a custom Listbox because the
// settings page sticks to platform a11y wherever possible.
function InlineSelect<T extends string>({
  value,
  onChange,
  options,
  width = 180,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  width?: number;
  ariaLabel?: string;
}) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        aria-label={ariaLabel}
        style={{ width }}
        className="h-7 w-full appearance-none rounded-btn border border-border bg-bg-elevated px-2.5 pr-6 text-[12.5px] text-text-primary outline-none transition-colors hover:border-border-default focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={11}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-muted"
      />
    </div>
  );
}

// ── General section ─────────────────────────────────────────────────────────
// Server (bind host + ports + poll), Paths (db / config / master key /
// artifacts), Appearance (theme / density / language + accent picker).
function GeneralSection() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [usage, setUsage] = useState<SystemDiskUsage | null>(null);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const { t } = useTranslation();

  useEffect(() => {
    void api.systemInfo().then(setInfo).catch(() => undefined);
    void api.systemDiskUsage().then(setUsage).catch(() => undefined);
  }, []);

  function changeLanguage(lang: string): void {
    setLanguage(lang);
    void i18n.changeLanguage(lang);
  }

  const hostOptions: { value: string; label: string }[] = [
    { value: '127.0.0.1', label: '127.0.0.1' },
    { value: '0.0.0.0', label: '0.0.0.0' },
  ];

  return (
    <>
      <SettingsGroup
        title="Server"
        desc="Process bound to your machine. Changes require a server restart."
      >
        <SettingsRow
          label="Bind host"
          hint="Use 0.0.0.0 only behind Tailscale or a trusted LAN."
          control={
            <InlineSelect
              value={info?.host ?? '127.0.0.1'}
              onChange={() => undefined}
              options={hostOptions}
              width={140}
              ariaLabel="Bind host (read only)"
            />
          }
        />
        {info?.host === '0.0.0.0' && !info.authEnabled && (
          <SettingsBanner
            kind="danger"
            title="BuildPilot has no authentication enabled."
            body="Binding to 0.0.0.0 exposes the API to your entire network. Enable auth in ~/.buildpilot/config.json (auth.enabled = true) or fall back to 127.0.0.1."
          />
        )}
        <SettingsRow
          label="Server port"
          hint="API server (Fastify)"
          control={
            <InlineInput
              value={info ? String(info.port) : '—'}
              width={110}
              mono
              disabled
              ariaLabel="Server port (read only)"
            />
          }
        />
        <SettingsRow
          label="Web origin"
          hint="Vite dev server (development) / served bundle (production)"
          control={
            <InlineInput
              value={info?.webOrigin ?? '—'}
              width={220}
              mono
              disabled
              ariaLabel="Web origin (read only)"
            />
          }
        />
        <SettingsRow
          label="Default poll interval"
          hint="Used for pipelines that don't override it"
          control={
            <span className="inline-flex items-center gap-2">
              <InlineInput
                value={info ? String(info.pollIntervalSec) : '—'}
                width={80}
                mono
                disabled
                ariaLabel="Poll interval (read only)"
              />
              <span className="text-[11.5px] text-text-muted">seconds</span>
            </span>
          }
        />
      </SettingsGroup>

      <SettingsGroup title="Paths" desc="Where BuildPilot stores its data on your machine.">
        {usage ? (
          usage.entries.map((entry) => (
            <SettingsRow
              key={entry.label}
              label={entry.label}
              hint={
                !entry.exists && entry.path
                  ? 'File does not exist yet — created on first write.'
                  : undefined
              }
              control={
                <div className="flex items-center gap-2">
                  {entry.path ? (
                    <MonoPath path={entry.path} className="max-w-[320px]" />
                  ) : (
                    <span className="text-[11.5px] italic text-text-muted">
                      tracked across builds — see Disk Usage
                    </span>
                  )}
                  <span className="font-mono text-[11px] text-text-muted">
                    {entry.exists ? formatBytes(entry.bytes) : '—'}
                  </span>
                  {entry.path && <CopyButton value={entry.path} />}
                  {entry.path && entry.exists && (
                    <button
                      type="button"
                      disabled
                      title="Open in Finder/Explorer — coming soon"
                      className="rounded p-1 text-text-faint opacity-60"
                    >
                      <FolderOpen size={11} />
                    </button>
                  )}
                </div>
              }
            />
          ))
        ) : (
          <SettingsRow
            label="Loading…"
            control={<span className="text-[11.5px] text-text-muted">Reading disk usage</span>}
          />
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Appearance"
        desc="Theme, density, language, and accent. Stored in this browser only."
      >
        <SettingsRow
          label={t('theme.title')}
          hint="Drives the entire UI palette"
          control={
            <InlineSelect
              value={theme}
              onChange={(v: ThemeChoice) => setTheme(v)}
              options={[
                { value: 'system', label: t('theme.system') },
                { value: 'dark', label: t('theme.dark') },
                { value: 'light', label: t('theme.light') },
              ]}
              width={140}
              ariaLabel="Theme"
            />
          }
        />
        <SettingsRow
          label={t('density.title')}
          hint="Comfortable: 32px rows. Compact: 28px rows."
          control={
            <InlineSelect
              value={density}
              onChange={(v: Density) => setDensity(v)}
              options={[
                { value: 'comfortable', label: t('density.comfortable') },
                { value: 'compact', label: t('density.compact') },
              ]}
              width={140}
              ariaLabel="Density"
            />
          }
        />
        <SettingsRow
          label={t('language.title')}
          control={
            <InlineSelect
              value={language}
              onChange={(v) => changeLanguage(v)}
              options={[
                { value: 'en', label: 'English' },
                { value: 'tr', label: 'Türkçe' },
              ]}
              width={140}
              ariaLabel="Language"
            />
          }
        />
        <div className="px-4 py-3">
          <AccentPicker />
        </div>
      </SettingsGroup>
    </>
  );
}

// UI v2 Faz 12 — accent picker, retained from the previous Settings
// implementation. Live repaint via applyAccent() so every component
// reading var(--accent*) updates without reload.
function AccentPicker() {
  const [accent, setAccent] = useState<string>(() => readStoredAccent());
  const PRESETS = [
    { hex: '#0ea5e9', name: 'Sky' },
    { hex: '#22c55e', name: 'Green' },
    { hex: '#f59e0b', name: 'Amber' },
    { hex: '#ef4444', name: 'Red' },
    { hex: '#8b5cf6', name: 'Violet' },
    { hex: '#ec4899', name: 'Pink' },
  ];
  function pick(hex: string): void {
    setAccent(hex);
    applyAccent(hex);
    writeStoredAccent(hex);
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
        Accent colour
      </span>
      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.hex}
            type="button"
            onClick={() => pick(p.hex)}
            title={p.name}
            aria-label={`Accent ${p.name}`}
            aria-pressed={accent.toLowerCase() === p.hex.toLowerCase()}
            className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
              accent.toLowerCase() === p.hex.toLowerCase()
                ? 'scale-110 border-text-primary'
                : 'border-border-subtle'
            }`}
            style={{ backgroundColor: p.hex }}
          />
        ))}
        <label className="ml-2 inline-flex items-center gap-2 text-[11px] text-text-muted">
          Custom
          <input
            type="color"
            value={accent}
            onChange={(e) => pick(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded border border-border-subtle bg-transparent"
            aria-label="Custom accent hex"
          />
        </label>
        <button
          type="button"
          onClick={() => pick(DEFAULT_ACCENT)}
          className="ml-1 text-[11px] text-text-muted transition-colors hover:text-text-primary"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ── Security section ────────────────────────────────────────────────────────
// Master key path + rotate-key instructions + encrypted-fields table +
// migration log note. The actual rotate command is a CLI invocation —
// the UI just shows the canonical recipe.
function SecuritySection() {
  const [fields, setFields] = useState<SystemEncryptedFieldsResponse | null>(null);
  const [info, setInfo] = useState<SystemInfo | null>(null);

  useEffect(() => {
    void api.systemEncryptedFields().then(setFields).catch(() => undefined);
    void api.systemInfo().then(setInfo).catch(() => undefined);
  }, []);

  const tableColumns: SettingsTableColumn[] = [
    { id: 'field', label: 'Field' },
    { id: 'surfaces', label: 'Step types', width: '260px' },
    { id: 'status', label: 'Status', width: '110px' },
  ];

  return (
    <>
      <SettingsGroup
        title="Master key"
        desc="Encrypts every sensitive field at rest with AES-256-GCM. Loaded into memory at server start."
      >
        <SettingsRow
          label="Master key path"
          hint="Never commit. Restrict file permissions to your user."
          control={
            <div className="flex items-center gap-2">
              {info ? (
                <MonoPath path={info.masterKeyPath} className="max-w-[300px]" />
              ) : (
                <span className="text-[11.5px] text-text-muted">Loading…</span>
              )}
              {info && <CopyButton value={info.masterKeyPath} />}
            </div>
          }
        />
        <SettingsRow
          label="Rotate master key"
          hint="Stop BuildPilot, run the CLI rotate command, then restart. Old key becomes unusable."
          danger
          control={
            <span className="rounded-md border border-rose-500/40 bg-rose-500/10 px-2 py-1 font-mono text-[11px] text-rose-300">
              buildpilot encryption rotate-key
            </span>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Encrypted fields"
        desc={
          <>
            Every field below is wrapped with the{' '}
            <code className="font-mono text-text-secondary">{fields?.envelope ?? 'enc:1:'}</code>{' '}
            envelope before it reaches disk.
          </>
        }
      >
        {fields ? (
          <SettingsTable columns={tableColumns}>
            {fields.fields.map((f) => (
              <SettingsTableRow
                key={f.field}
                columns={tableColumns}
                cells={[
                  <span className="font-mono text-[11.5px] text-text-primary">{f.field}</span>,
                  <span className="text-[11.5px] text-text-muted">{f.surfaces}</span>,
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">
                    <Lock size={9} /> enc:1:
                  </span>,
                ]}
              />
            ))}
          </SettingsTable>
        ) : (
          <SettingsRow
            label="Loading…"
            control={<span className="text-[11.5px] text-text-muted">Fetching field list</span>}
          />
        )}
      </SettingsGroup>

      <SettingsGroup
        title="Migration log"
        desc="Plaintext → encrypted sweeps that have run on this database."
      >
        <SettingsBanner
          kind="info"
          flush={false}
          title="Migration history is not yet persisted."
          body="The sweep runs at every server start and is idempotent. A dedicated audit-log channel for migrations lands in a follow-up release."
        />
      </SettingsGroup>
    </>
  );
}

// ── Notifications section ───────────────────────────────────────────────────
// Browser notifications + quiet hours + web push. State is purely
// browser-local (localStorage) because the dashboard is the consumer —
// the server has no opinion about how the user wants to be notified.

interface NotifyPrefs {
  enabled: boolean;
  soundOnSuccess: boolean;
  soundOnFailure: boolean;
  quietEnabled: boolean;
  quietFrom: string;
  quietTo: string;
}

const NOTIFY_DEFAULTS: NotifyPrefs = {
  enabled: false,
  soundOnSuccess: true,
  soundOnFailure: true,
  quietEnabled: false,
  quietFrom: '22:00',
  quietTo: '08:00',
};

const NOTIFY_KEY = 'buildpilot.notify.prefs';

function readNotifyPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(NOTIFY_KEY);
    if (!raw) return NOTIFY_DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<NotifyPrefs>;
    return { ...NOTIFY_DEFAULTS, ...parsed };
  } catch {
    return NOTIFY_DEFAULTS;
  }
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState<NotifyPrefs>(() => readNotifyPrefs());
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default',
  );

  useEffect(() => {
    localStorage.setItem(NOTIFY_KEY, JSON.stringify(prefs));
  }, [prefs]);

  function update<K extends keyof NotifyPrefs>(key: K, value: NotifyPrefs[K]): void {
    setPrefs((prev) => ({ ...prev, [key]: value }));
  }

  async function requestPermission(): Promise<void> {
    if (typeof Notification === 'undefined') return;
    const next = await Notification.requestPermission();
    setPermission(next);
    if (next === 'granted') update('enabled', true);
  }

  const hasNotificationAPI = typeof Notification !== 'undefined';

  return (
    <>
      <SettingsGroup title="Browser notifications" desc="Native OS notifications for build events.">
        {!hasNotificationAPI && (
          <SettingsBanner
            kind="danger"
            title="Notifications API not available"
            body="This browser does not expose the Notification API. Try Chrome, Edge, or Firefox."
          />
        )}
        {hasNotificationAPI && permission === 'denied' && (
          <SettingsBanner
            kind="danger"
            title="Notifications blocked"
            body="You denied notification permission in the browser. Re-enable it from your browser's site settings to receive build alerts."
          />
        )}
        {hasNotificationAPI && permission === 'default' && (
          <div className="mx-4 my-3 flex items-start gap-2.5 rounded-md border border-sky-500/25 bg-sky-500/[0.06] px-3.5 py-3">
            <Bell size={13} className="mt-0.5 shrink-0 text-sky-300" />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[12.5px] font-medium text-sky-300">
                Permission required to show notifications
              </span>
              <button
                type="button"
                onClick={requestPermission}
                className="self-start rounded-md bg-sky-500/20 px-2.5 py-1 text-[12px] text-sky-200 hover:bg-sky-500/30"
              >
                Grant permission
              </button>
            </div>
          </div>
        )}
        <SettingsRow
          label="Enable browser notifications"
          hint="Shows a toast whenever a watched build finishes."
          control={
            <Switch
              checked={prefs.enabled && permission === 'granted'}
              onCheckedChange={(v) => update('enabled', v)}
              disabled={!hasNotificationAPI || permission !== 'granted'}
              aria-label="Enable browser notifications"
            />
          }
        />
        <SettingsRow
          label="Sound on build success"
          control={
            <Switch
              checked={prefs.soundOnSuccess}
              onCheckedChange={(v) => update('soundOnSuccess', v)}
              aria-label="Sound on build success"
            />
          }
        />
        <SettingsRow
          label="Sound on build failure"
          control={
            <Switch
              checked={prefs.soundOnFailure}
              onCheckedChange={(v) => update('soundOnFailure', v)}
              aria-label="Sound on build failure"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Quiet hours"
        desc="Suppress sounds outside these hours. Toasts still appear."
      >
        <SettingsRow
          label="Enable quiet hours"
          control={
            <Switch
              checked={prefs.quietEnabled}
              onCheckedChange={(v) => update('quietEnabled', v)}
              aria-label="Enable quiet hours"
            />
          }
        />
        <SettingsRow
          label="From"
          control={
            <InlineInput
              type="time"
              value={prefs.quietFrom}
              onChange={(v) => update('quietFrom', v)}
              width={110}
              mono
              disabled={!prefs.quietEnabled}
              ariaLabel="Quiet hours from"
            />
          }
        />
        <SettingsRow
          label="To"
          control={
            <InlineInput
              type="time"
              value={prefs.quietTo}
              onChange={(v) => update('quietTo', v)}
              width={110}
              mono
              disabled={!prefs.quietEnabled}
              ariaLabel="Quiet hours to"
            />
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title="Web push"
        desc="Push notifications via service worker. Useful on phones (PWA)."
      >
        <SettingsBanner
          kind="info"
          title="Coming in a future release"
          body="Service worker registration is wired up but VAPID-keyed delivery from the server is still pending."
        />
      </SettingsGroup>
    </>
  );
}

// ── Telegram section ────────────────────────────────────────────────────────
// Bot token + chat ID + enable toggle + test message. Ported from the
// existing implementation; the only structural change is the new
// primitives + a dedicated SettingsBanner for transient state.
type TelegramBanner =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'testing' }
  | { kind: 'test-ok' }
  | { kind: 'test-fail'; message: string }
  | { kind: 'error'; message: string };

function TelegramSection() {
  const [loaded, setLoaded] = useState<TelegramConfigPublic | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [banner, setBanner] = useState<TelegramBanner>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const cfg = await api.getTelegramConfig();
        if (cancelled) return;
        setLoaded(cfg);
        setEnabled(cfg.enabled);
      } catch (err) {
        if (cancelled) return;
        setBanner({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(): Promise<void> {
    setBanner({ kind: 'saving' });
    try {
      const next = await api.updateTelegramConfig({
        enabled,
        botToken,
        defaultChatId: chatId,
      });
      setLoaded(next);
      setBotToken('');
      setChatId('');
      setShowToken(false);
      setBanner({ kind: 'saved' });
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function onTest(): Promise<void> {
    setBanner({ kind: 'testing' });
    try {
      const res = await api.testTelegram({
        botToken: botToken || undefined,
        chatId: chatId || undefined,
      });
      if (res.ok) setBanner({ kind: 'test-ok' });
      else setBanner({ kind: 'test-fail', message: res.error ?? 'unknown error' });
    } catch (err) {
      setBanner({
        kind: 'test-fail',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function onClearToken(): Promise<void> {
    setBanner({ kind: 'saving' });
    try {
      const next = await api.updateTelegramConfig({ clearBotToken: true });
      setLoaded(next);
      setBanner({ kind: 'saved' });
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async function onClearChatId(): Promise<void> {
    setBanner({ kind: 'saving' });
    try {
      const next = await api.updateTelegramConfig({ clearChatId: true });
      setLoaded(next);
      setBanner({ kind: 'saved' });
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <SettingsGroup
      title="Telegram bot"
      desc={
        <>
          Send build notifications and approval prompts via Telegram. Bot token + default chat used
          by <code className="font-mono text-text-secondary">telegramNotify</code> steps. The bot
          restarts automatically when you save.
        </>
      }
      trailing={
        <label className="inline-flex items-center gap-2 text-[12.5px] text-text-secondary">
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            aria-label="Enable Telegram"
          />
          <span>Enabled</span>
        </label>
      }
    >
      <SettingsRow
        label="Bot token"
        hint={
          loaded?.hasBotToken
            ? `Stored: ${loaded.botTokenPreview}. Leave blank to keep it.`
            : 'From @BotFather. Stored encrypted (AES-256-GCM).'
        }
        control={
          <div className="flex items-center gap-2">
            <div className="relative">
              <input
                type={showToken ? 'text' : 'password'}
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={loaded?.hasBotToken ? '(unchanged)' : '123456:ABC-DEF...'}
                autoComplete="off"
                spellCheck={false}
                style={{ width: 280 }}
                className="h-7 rounded-btn border border-border bg-bg-elevated px-2.5 pr-7 font-mono text-[12.5px] text-text-primary outline-none transition-colors placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-text-muted hover:text-text-primary"
                title={showToken ? 'Hide' : 'Show'}
              >
                {showToken ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            </div>
            {loaded?.hasBotToken && (
              <button
                type="button"
                onClick={onClearToken}
                className="rounded-md border border-border-subtle px-2 py-1 text-[11.5px] text-text-muted hover:border-rose-500 hover:text-rose-400"
                title="Remove the stored token"
              >
                Clear
              </button>
            )}
          </div>
        }
      />
      <SettingsRow
        label="Default chat ID"
        hint={
          loaded?.hasChatId
            ? `Stored: ${loaded.chatIdPreview}. Leave blank to keep it.`
            : 'Numeric chat ID, or @channelname for public channels. Stored encrypted.'
        }
        control={
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
              placeholder={loaded?.hasChatId ? '(unchanged)' : '-1001234567890 or @my_channel'}
              autoComplete="off"
              spellCheck={false}
              style={{ width: 240 }}
              className="h-7 rounded-btn border border-border bg-bg-elevated px-2.5 font-mono text-[12.5px] text-text-primary outline-none transition-colors placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
            />
            {loaded?.hasChatId && (
              <button
                type="button"
                onClick={onClearChatId}
                className="rounded-md border border-border-subtle px-2 py-1 text-[11.5px] text-text-muted hover:border-rose-500 hover:text-rose-400"
                title="Remove the stored chat ID"
              >
                Clear
              </button>
            )}
          </div>
        }
      />
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
        <TelegramBannerView state={banner} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onTest}
            disabled={banner.kind === 'testing' || banner.kind === 'saving'}
            className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-3 py-1.5 text-[12px] text-text-primary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={11} /> Send test message
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={banner.kind === 'saving'}
            className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {banner.kind === 'saving' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </SettingsGroup>
  );
}

function TelegramBannerView({ state }: { state: TelegramBanner }) {
  if (state.kind === 'idle' || state.kind === 'saving' || state.kind === 'testing') {
    return <span className="text-[11.5px] text-text-muted">&nbsp;</span>;
  }
  if (state.kind === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-emerald-400">
        <Check size={12} /> Saved &amp; bot restarted.
      </span>
    );
  }
  if (state.kind === 'test-ok') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-emerald-400">
        <Check size={12} /> Test message delivered.
      </span>
    );
  }
  if (state.kind === 'test-fail') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11.5px] text-amber-400">
        <AlertCircle size={12} /> Test failed: {state.message}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-rose-400">
      <AlertCircle size={12} /> {state.message}
    </span>
  );
}

// ── Webhooks section ────────────────────────────────────────────────────────
// Static reference: which inbound endpoints exist + how to configure
// the signing secrets via env vars. No CRUD here — webhook secrets are
// per-pipeline and editing happens in the pipeline editor.
function WebhooksSection() {
  return (
    <>
      <SettingsGroup
        title="Inbound webhooks"
        desc="GitHub, GitLab, Gitea, or any generic API can hit these endpoints to trigger pipelines."
      >
        <SettingsRow
          label="GitHub"
          hint={
            <>
              Set <code className="font-mono text-text-secondary">BUILDPILOT_GITHUB_SECRET</code>{' '}
              in your environment before launching the server.
            </>
          }
          control={
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11.5px] text-text-secondary">
                POST /api/webhooks/github/:pipelineId
              </code>
              <CopyButton value="POST /api/webhooks/github/:pipelineId" />
            </div>
          }
        />
        <SettingsRow
          label="GitLab"
          hint={
            <>
              Set <code className="font-mono text-text-secondary">BUILDPILOT_GITLAB_SECRET</code>{' '}
              in your environment.
            </>
          }
          control={
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11.5px] text-text-secondary">
                POST /api/webhooks/gitlab/:pipelineId
              </code>
              <CopyButton value="POST /api/webhooks/gitlab/:pipelineId" />
            </div>
          }
        />
        <SettingsRow
          label="Gitea"
          hint="Uses the same secret env var as GitHub."
          control={
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11.5px] text-text-secondary">
                POST /api/webhooks/gitea/:pipelineId
              </code>
              <CopyButton value="POST /api/webhooks/gitea/:pipelineId" />
            </div>
          }
        />
        <SettingsRow
          label="Generic API"
          hint="Token-authenticated trigger from any tool — pass the per-pipeline token as ?token=…"
          control={
            <div className="flex items-center gap-2">
              <code className="font-mono text-[11.5px] text-text-secondary">
                POST /api/triggers/:pipelineId
              </code>
              <CopyButton value="POST /api/triggers/:pipelineId" />
            </div>
          }
        />
      </SettingsGroup>

      <SettingsGroup
        title=".env example"
        desc="Add these to your shell before launching BuildPilot."
      >
        <SettingsCode
          code={`# BuildPilot webhook secrets
export BUILDPILOT_GITHUB_SECRET="$(openssl rand -hex 32)"
export BUILDPILOT_GITLAB_SECRET="$(openssl rand -hex 32)"
# Per-pipeline trigger token: replace <pipeline_slug> with your pipeline's id
export BUILDPILOT_TRIGGER_TOKEN_<pipeline_slug>="$(openssl rand -hex 32)"`}
        />
      </SettingsGroup>
    </>
  );
}

// ── AI Integrations section ─────────────────────────────────────────────────
// Compact table-row layout per the design — tool / configured path /
// version (live probe) / model / save. We POST the same shape we read
// so empty strings clear the override on the server side.
function AiIntegrationsSection() {
  const [config, setConfig] = useState<AiIntegrationsConfig>({});
  const [probes, setProbes] = useState<AiIntegrationProbeEntry[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    void api.getAiIntegrations().then(setConfig).catch((e) => setError(String(e)));
    runProbe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runProbe(): void {
    setProbing(true);
    api
      .probeAiIntegrations()
      .then((r) => setProbes(r.results))
      .catch(() => setProbes([]))
      .finally(() => setProbing(false));
  }

  const TOOLS: Array<{ key: keyof AiIntegrationsConfig; label: string; modelHint: string }> = [
    { key: 'claude', label: 'claude', modelHint: 'claude-opus-4-7' },
    { key: 'codex', label: 'codex', modelHint: 'gpt-4o' },
    { key: 'aider', label: 'aider', modelHint: 'gpt-4o' },
    { key: 'gemini', label: 'gemini', modelHint: 'gemini-1.5-pro' },
  ];

  function updateTool(key: keyof AiIntegrationsConfig, patch: Partial<AiToolConfig>): void {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setDirty(true);
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    try {
      const next = await api.updateAiIntegrations(config);
      setConfig(next);
      setDirty(false);
      setSavedAt(Date.now());
      runProbe();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const probeByTool = useMemo(() => {
    const map = new Map<string, AiIntegrationProbeEntry>();
    for (const p of probes ?? []) map.set(p.tool, p);
    return map;
  }, [probes]);

  return (
    <SettingsGroup
      title="AI tools"
      desc={
        <>
          Configure the CLIs invoked by the{' '}
          <code className="font-mono text-text-secondary">aiPrompt</code> and AI Auto-Fix steps.
          Empty path = look up the binary on PATH. Empty model = let the CLI pick its default.
        </>
      }
      trailing={
        <button
          type="button"
          onClick={runProbe}
          disabled={probing}
          className="inline-flex items-center gap-1.5 rounded-md border border-border-subtle px-2.5 py-1 text-[11.5px] text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Zap size={11} /> {probing ? 'Probing…' : 'Re-probe versions'}
        </button>
      }
    >
      {TOOLS.map((tool) => {
        const cfg = config[tool.key] ?? {};
        const probe = probeByTool.get(tool.key);
        const missing = !probe?.ok;
        return (
          <div
            key={tool.key}
            className="grid items-center gap-x-3 gap-y-1.5 border-b border-border-subtle px-4 py-3 last:border-b-0"
            style={{ gridTemplateColumns: '110px minmax(0, 1fr) 110px' }}
          >
            <div className="flex items-center gap-2">
              <Sparkles
                size={11}
                className={missing ? 'text-text-faint' : 'text-accent'}
              />
              <span
                className={
                  'font-mono text-[12px] font-medium ' +
                  (missing ? 'text-text-faint' : 'text-text-primary')
                }
              >
                {tool.label}
              </span>
            </div>
            <div className="min-w-0">
              <input
                type="text"
                value={cfg.path ?? ''}
                onChange={(e) => updateTool(tool.key, { path: e.target.value })}
                placeholder={
                  navigator.platform.startsWith('Win')
                    ? `C:\\Program Files\\${tool.key}\\${tool.key}.exe`
                    : `/usr/local/bin/${tool.key}`
                }
                aria-label={`${tool.label} path`}
                className="h-7 w-full rounded-btn border border-border bg-bg-elevated px-2.5 font-mono text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            </div>
            <div className="text-right">
              {probe?.ok ? (
                <span className="font-mono text-[11.5px] text-emerald-300">v{probe.version}</span>
              ) : (
                <span
                  className="font-mono text-[11.5px] text-text-faint"
                  title={probe?.error ?? 'not probed yet'}
                >
                  {probing ? '…' : '—'}
                </span>
              )}
            </div>
            <div className="col-start-2 col-end-3 text-[11px] text-text-muted">Default model</div>
            <div className="col-start-2 col-end-4">
              <input
                type="text"
                value={cfg.model ?? ''}
                onChange={(e) => updateTool(tool.key, { model: e.target.value })}
                placeholder={tool.modelHint}
                aria-label={`${tool.label} default model`}
                className="h-7 w-full rounded-btn border border-border bg-bg-elevated px-2.5 font-mono text-[12px] text-text-primary outline-none transition-colors placeholder:text-text-faint focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
              />
            </div>
            {probe && !probe.ok && probe.error && (
              <div className="col-span-3 text-[11px] text-rose-300/80">
                Probe failed: {probe.error}
              </div>
            )}
          </div>
        );
      })}
      {error && (
        <div className="border-t border-border-subtle px-4 py-3 text-[12px] text-rose-300">
          {error}
        </div>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border-subtle px-4 py-3">
        <span className="text-[11.5px] text-text-muted">
          {savedAt && !dirty
            ? 'Saved. Path validation pins basenames + blocks argv injection.'
            : 'Empty fields fall through to the CLI defaults.'}
        </span>
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-accent px-3 py-1.5 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </SettingsGroup>
  );
}

// ── Retention section ───────────────────────────────────────────────────────
// Read-only summary today; live editing PUTs to /api/config/retention
// in a follow-up. Surface every retention dimension we know about so
// the operator can see at a glance what's being pruned.
function RetentionSection() {
  return (
    <SettingsGroup
      title="Retention"
      desc={
        <>
          How long BuildPilot keeps build rows, log entries, and artifacts on disk. Configured in{' '}
          <code className="font-mono text-text-secondary">~/.buildpilot/config.json</code>; restart
          to apply.
        </>
      }
    >
      <SettingsRow
        label="Builds"
        hint="Build metadata + step records (SQLite)."
        control={
          <span className="inline-flex items-center gap-2">
            <InlineInput value="0" width={80} mono disabled ariaLabel="Build retention days" />
            <span className="text-[11.5px] text-text-muted">days · 0 = keep forever</span>
          </span>
        }
      />
      <SettingsRow
        label="Artifacts"
        hint="Files referenced from build_artifacts."
        control={
          <span className="inline-flex items-center gap-2">
            <InlineInput value="0" width={80} mono disabled ariaLabel="Artifact retention days" />
            <span className="text-[11.5px] text-text-muted">days</span>
          </span>
        }
      />
      <SettingsRow
        label="Logs"
        hint="JSON log entries in build_entries (5000-row cap per build is always on)."
        control={
          <span className="inline-flex items-center gap-2">
            <InlineInput value="0" width={80} mono disabled ariaLabel="Log retention days" />
            <span className="text-[11.5px] text-text-muted">days</span>
          </span>
        }
      />
      <SettingsRow
        label="Successful builds only"
        hint="When enabled, the sweep skips failed builds so you keep a longer red-build trail."
        control={<Switch checked={false} disabled aria-label="Successful builds only (read only)" />}
      />
      <SettingsBanner
        kind="info"
        title="Retention is read-only in the dashboard today."
        body="Edit ~/.buildpilot/config.json under the `retention` key and restart the server. Live editing lands in a follow-up release."
      />
    </SettingsGroup>
  );
}

// ── Lanes & Concurrency section ─────────────────────────────────────────────
// Table layout with name / cap / active-now (derived from the queue) /
// delete. Inline rename + max-concurrency edit are preserved from the
// previous implementation.
type LanesBanner =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'in-use'; laneName: string; pipelineCount: number };

function LanesSection() {
  const lanes = useStore((s) => s.lanes);
  const pipelines = useStore((s) => s.pipelines);
  const loadLanes = useStore((s) => s.loadLanes);
  const [banner, setBanner] = useState<LanesBanner>({ kind: 'idle' });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMax, setNewMax] = useState('1');
  const [activeByLane, setActiveByLane] = useState<Map<string, number>>(new Map());

  // Poll the queue every 3s for active-now numbers per lane. Matches
  // the queue page's poll cadence.
  useEffect(() => {
    let mounted = true;
    const fetchQueue = async (): Promise<void> => {
      try {
        const q = await api.getQueue();
        if (!mounted) return;
        const map = new Map<string, number>();
        for (const l of q.lanes) map.set(l.lane.id, l.running.length);
        setActiveByLane(map);
      } catch {
        // ignore — keeps last known value
      }
    };
    void fetchQueue();
    const id = setInterval(() => void fetchQueue(), 3000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const usageByLane = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pipelines) {
      map.set(p.laneId, (map.get(p.laneId) ?? 0) + 1);
    }
    return map;
  }, [pipelines]);

  async function onCreate(): Promise<void> {
    const name = newName.trim();
    const max = Number.parseInt(newMax, 10);
    if (!name) {
      setBanner({ kind: 'error', message: 'Lane name cannot be empty' });
      return;
    }
    if (!Number.isFinite(max) || max < 1) {
      setBanner({ kind: 'error', message: 'Max concurrency must be at least 1' });
      return;
    }
    setAdding(true);
    try {
      await api.createLane({ name, maxConcurrency: max });
      await loadLanes();
      setNewName('');
      setNewMax('1');
      setBanner({ kind: 'idle' });
    } catch (err) {
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setAdding(false);
    }
  }

  async function onDelete(lane: Lane): Promise<void> {
    if (lane.id === 'default') return;
    if (!window.confirm(`Delete lane "${lane.name}"?`)) return;
    try {
      await api.deleteLane(lane.id);
      await loadLanes();
      setBanner({ kind: 'idle' });
    } catch (err) {
      if (err instanceof LaneInUseError) {
        setBanner({
          kind: 'in-use',
          laneName: lane.name,
          pipelineCount: err.pipelineCount,
        });
        await loadLanes();
        return;
      }
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const tableColumns: SettingsTableColumn[] = [
    { id: 'name', label: 'Lane' },
    { id: 'cap', label: 'Max concurrency', width: '170px' },
    { id: 'active', label: 'Active now', width: '120px' },
    { id: 'usage', label: 'Pipelines', width: '110px', align: 'right' },
    { id: 'actions', label: '', width: '90px', align: 'right' },
  ];

  return (
    <SettingsGroup
      title="Lanes"
      desc="Pin pipelines to a lane and bound parallelism per lane. Pipelines run concurrently if their lane has capacity."
    >
      {banner.kind === 'in-use' && (
        <SettingsBanner
          kind="danger"
          title={
            <>
              Cannot delete lane <strong>{banner.laneName}</strong>
            </>
          }
          body={
            <>
              Still used by {banner.pipelineCount} pipeline
              {banner.pipelineCount === 1 ? '' : 's'}. Reassign them first.
            </>
          }
        />
      )}
      {banner.kind === 'error' && (
        <SettingsBanner kind="danger" title="Error" body={banner.message} />
      )}
      <SettingsTable columns={tableColumns}>
        {lanes.length === 0 ? (
          <SettingsTableRow
            columns={tableColumns}
            cells={[
              <span className="text-[11.5px] text-text-faint">No lanes yet. Add one below.</span>,
              null,
              null,
              null,
              null,
            ]}
          />
        ) : (
          lanes.map((lane) => (
            <LaneTableRow
              key={lane.id}
              lane={lane}
              columns={tableColumns}
              usageCount={usageByLane.get(lane.id) ?? 0}
              activeNow={activeByLane.get(lane.id) ?? 0}
              onError={(message) => setBanner({ kind: 'error', message })}
              onDelete={() => void onDelete(lane)}
            />
          ))
        )}
      </SettingsTable>
      <div className="flex flex-wrap items-end gap-3 border-t border-border-subtle px-4 py-3">
        <label className="flex flex-1 min-w-[200px] flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Lane name
          </span>
          <InlineInput
            value={newName}
            onChange={setNewName}
            width={220}
            placeholder="e.g. mac-builder-1"
            ariaLabel="New lane name"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Max concurrency
          </span>
          <InlineInput
            type="number"
            value={newMax}
            onChange={setNewMax}
            width={110}
            mono
            ariaLabel="New lane max concurrency"
          />
        </label>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={adding}
          className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent px-3 text-[12px] font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={11} /> {adding ? 'Adding…' : 'Add lane'}
        </button>
      </div>
    </SettingsGroup>
  );
}

function LaneTableRow({
  lane,
  columns,
  usageCount,
  activeNow,
  onError,
  onDelete,
}: {
  lane: Lane;
  columns: SettingsTableColumn[];
  usageCount: number;
  activeNow: number;
  onError: (message: string) => void;
  onDelete: () => void;
}) {
  const loadLanes = useStore((s) => s.loadLanes);
  const [name, setName] = useState(lane.name);
  const [max, setMax] = useState(String(lane.maxConcurrency));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(lane.name);
    setMax(String(lane.maxConcurrency));
  }, [lane.name, lane.maxConcurrency]);

  const trimmedName = name.trim();
  const parsedMax = Number.parseInt(max, 10);
  const maxIsValid = Number.isFinite(parsedMax) && parsedMax >= 1 && parsedMax <= 64;
  const dirty =
    trimmedName.length > 0 &&
    maxIsValid &&
    (trimmedName !== lane.name || parsedMax !== lane.maxConcurrency);
  const isDefault = lane.id === 'default';
  const saturated = activeNow >= lane.maxConcurrency && activeNow > 0;

  async function onSave(): Promise<void> {
    if (!dirty) return;
    setSaving(true);
    try {
      const patch: { name?: string; maxConcurrency?: number } = {};
      if (trimmedName !== lane.name) patch.name = trimmedName;
      if (parsedMax !== lane.maxConcurrency) patch.maxConcurrency = parsedMax;
      await api.updateLane(lane.id, patch);
      await loadLanes();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SettingsTableRow
      columns={columns}
      cells={[
        <div className="flex items-center gap-2">
          <Layers size={11} className="text-text-faint shrink-0" />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void onSave()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && dirty) void onSave();
            }}
            spellCheck={false}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-[12px] text-text-primary hover:border-border-subtle focus:border-accent focus:bg-bg-elevated focus:outline-none"
          />
          {isDefault && (
            <span className="rounded bg-bg-elevated px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-text-muted">
              default
            </span>
          )}
        </div>,
        <input
          type="number"
          min={1}
          max={64}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={() => void onSave()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) void onSave();
          }}
          className="h-7 w-20 rounded-btn border border-border bg-bg-elevated px-2 text-center font-mono text-[12px] text-text-primary outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--accent-soft)]"
        />,
        <span
          className={
            'font-mono text-[12px] ' +
            (saturated ? 'text-status-running' : 'text-text-secondary')
          }
        >
          {activeNow} / {lane.maxConcurrency}
        </span>,
        <span className="font-mono text-[11.5px] text-text-muted">
          {usageCount} pipeline{usageCount === 1 ? '' : 's'}
        </span>,
        <div className="flex items-center justify-end gap-1">
          {saving && <span className="text-[10px] text-text-muted">saving…</span>}
          <button
            type="button"
            onClick={onDelete}
            disabled={isDefault}
            title={isDefault ? 'Default lane cannot be deleted' : `Delete ${lane.name}`}
            className="rounded-md border border-border-subtle p-1 text-text-muted transition-colors hover:border-rose-500 hover:text-rose-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={11} />
          </button>
        </div>,
      ]}
    />
  );
}

// ── Soon (placeholder) section ──────────────────────────────────────────────
function SoonSection({ title }: { title: string }) {
  return (
    <SettingsGroup
      title={title}
      desc="This section is part of a future release. The nav entry is intentionally disabled in the sidebar."
    >
      <div className="px-4 py-6 text-center text-[12.5px] text-text-muted">
        Coming soon.
      </div>
    </SettingsGroup>
  );
}

// ── About section ───────────────────────────────────────────────────────────
function AboutSection() {
  const [info, setInfo] = useState<SystemInfo | null>(null);
  const [telemetry, setTelemetry] = useState<boolean>(() => {
    try {
      return localStorage.getItem('buildpilot.telemetry') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    void api.systemInfo().then(setInfo).catch(() => undefined);
  }, []);

  function setTelemetryEnabled(next: boolean): void {
    setTelemetry(next);
    try {
      localStorage.setItem('buildpilot.telemetry', String(next));
    } catch {
      // ignore
    }
  }

  return (
    <>
      <SettingsGroup title="BuildPilot" desc="Local-first CI/CD for cross-platform builders.">
        <SettingsRow
          label="Version"
          control={
            <span className="font-mono text-[12px] text-text-primary">
              {info?.appVersion ?? '—'}
            </span>
          }
        />
        <SettingsRow
          label="Node runtime"
          control={
            <span className="font-mono text-[12px] text-text-primary">
              {info?.nodeVersion ?? '—'}
            </span>
          }
        />
        <SettingsRow
          label="Database"
          control={
            <span className="font-mono text-[12px] text-text-primary">
              {info ? `SQLite ${info.sqliteVersion} (better-sqlite3)` : '—'}
            </span>
          }
        />
        <SettingsRow
          label="License"
          control={<span className="text-[12px] text-text-primary">{info?.license ?? '—'}</span>}
        />
      </SettingsGroup>

      <SettingsGroup
        title="Telemetry"
        desc="BuildPilot is fully offline. No data leaves your machine — ever."
      >
        <SettingsRow
          label="Anonymous diagnostics"
          hint="OFF by default. Even when on, only anonymised crash stacks would be sent. Currently a placeholder — no telemetry endpoint exists yet."
          control={
            <Switch
              checked={telemetry}
              onCheckedChange={setTelemetryEnabled}
              aria-label="Anonymous diagnostics"
            />
          }
        />
        <SettingsBanner
          kind="ok"
          title="No external connections active."
          body={
            info ? (
              <>
                BuildPilot server is bound to{' '}
                <code className="font-mono">
                  {info.host}:{info.port}
                </code>
                . Only git remotes, configured webhooks, and SSH hosts make outbound traffic.
              </>
            ) : (
              'BuildPilot server is bound to a single interface. Only git remotes, configured webhooks, and SSH hosts make outbound traffic.'
            )
          }
        />
      </SettingsGroup>
    </>
  );
}
