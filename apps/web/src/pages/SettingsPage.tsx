import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Layers,
  Lock,
  Palette,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  AiIntegrationsConfig,
  AiToolConfig,
  Lane,
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

// Banner state for the Telegram form. We use the local-only `idle` state to
// suppress stale toasts when the user is mid-edit.
type Banner =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'testing' }
  | { kind: 'test-ok' }
  | { kind: 'test-fail'; message: string }
  | { kind: 'error'; message: string };

export function SettingsPage() {
  const [loaded, setLoaded] = useState<TelegramConfigPublic | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [banner, setBanner] = useState<Banner>({ kind: 'idle' });

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
      // Empty fields fall through to "keep existing" semantics on the server.
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
        // Prefer the in-form values if the user typed something; otherwise the
        // server falls back to the stored config.
        botToken: botToken || undefined,
        chatId: chatId || undefined,
      });
      if (res.ok) {
        setBanner({ kind: 'test-ok' });
      } else {
        setBanner({ kind: 'test-fail', message: res.error });
      }
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
    // UI v2 Faz 10.1 — 2-column settings layout. Sticky nav on the left
    // scrolls to each section via anchor links. The right column keeps
    // the legacy card-stack rendering; only the chrome around it
    // changes.
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: '220px minmax(0, 1fr)' }}>
      <aside className="border-r border-border-subtle bg-bg-panel/50 overflow-y-auto">
        <div className="sticky top-0 px-4 py-5">
          <h1 className="text-base font-semibold text-text-primary tracking-tight">
            Settings
          </h1>
          <p className="mt-1 text-[11px] text-text-muted leading-relaxed">
            Server-wide configuration. Secrets encrypted in{' '}
            <code className="font-mono text-text-secondary">~/.buildpilot/config.json</code>
            .
          </p>
          <nav className="mt-4 flex flex-col gap-px" aria-label="Settings sections">
            <SettingsNavLink href="#appearance" label="Appearance" />
            <SettingsNavLink href="#lanes" label="Lanes & Concurrency" />
            <SettingsNavLink href="#telegram" label="Telegram" />
            <SettingsNavLink href="#ai-integrations" label="AI Integrations" />
            <SettingsNavLink href="#security" label="Security" />
            <SettingsNavLink href="#retention" label="Retention" />
            <SettingsNavLink href="#vault" label="Vault" />
            <SettingsNavLink href="#users" label="Users & Access" />
            <SettingsNavLink href="#about" label="About" />
          </nav>
        </div>
      </aside>
      <div className="overflow-y-auto px-6 py-6 max-w-3xl">
      <section id="appearance" className="scroll-mt-4">
        <AppearanceSection />
      </section>

      <section id="lanes" className="scroll-mt-4">
        <LanesSection />
      </section>

      <section
        id="telegram"
        className="scroll-mt-4 mt-6 rounded-lg border border-border-subtle bg-bg-panel/60 p-5"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
              <Send size={16} className="text-accent" /> Telegram
            </h2>
            <p className="mt-1 text-xs text-text-muted">
              Bot token + default chat used by <code>telegramNotify</code> steps and
              branch-advance approval prompts. The bot restarts automatically when you
              save.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-text-secondary">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 accent-sky-500"
            />
            Enabled
          </label>
        </div>

        <div className="space-y-4">
          <Field
            label="Bot token"
            hint={
              loaded?.hasBotToken
                ? `Stored: ${loaded.botTokenPreview}. Leave blank to keep it.`
                : 'Get one from @BotFather. Stored encrypted (AES-256-GCM).'
            }
          >
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Lock
                  size={13}
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type={showToken ? 'text' : 'password'}
                  value={botToken}
                  onChange={(e) => setBotToken(e.target.value)}
                  placeholder={
                    loaded?.hasBotToken ? '(unchanged)' : '123456:ABC-DEF...'
                  }
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full rounded-md border border-border-subtle bg-bg-base px-7 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                  title={showToken ? 'Hide' : 'Show'}
                >
                  {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {loaded?.hasBotToken && (
                <button
                  type="button"
                  onClick={onClearToken}
                  className="rounded-md border border-border-subtle px-2 py-1 text-xs text-text-muted hover:border-rose-500 hover:text-rose-400"
                  title="Remove the stored token"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>

          <Field
            label="Default chat ID"
            hint={
              loaded?.hasChatId
                ? `Stored: ${loaded.chatIdPreview}. Leave blank to keep it.`
                : 'Numeric chat ID, or @channelname for public channels. Stored encrypted.'
            }
          >
            <div className="flex gap-2">
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder={loaded?.hasChatId ? '(unchanged)' : '-1001234567890 or @my_channel'}
                autoComplete="off"
                spellCheck={false}
                className="flex-1 rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
              />
              {loaded?.hasChatId && (
                <button
                  type="button"
                  onClick={onClearChatId}
                  className="rounded-md border border-border-subtle px-2 py-1 text-xs text-text-muted hover:border-rose-500 hover:text-rose-400"
                  title="Remove the stored chat ID"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-border-subtle pt-4">
          <BannerView state={banner} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onTest}
              disabled={banner.kind === 'testing' || banner.kind === 'saving'}
              className="rounded-md border border-border-subtle px-3 py-1.5 text-sm text-text-primary hover:border-accent hover:text-accent-hover disabled:opacity-50"
            >
              Send test message
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={banner.kind === 'saving'}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {banner.kind === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>

      <section id="ai-integrations" className="scroll-mt-4 mt-6">
        <AiIntegrationsSection />
      </section>

      <section id="security" className="scroll-mt-4 mt-6">
        <SecuritySection />
      </section>

      <section id="retention" className="scroll-mt-4 mt-6">
        <RetentionSection />
      </section>

      <section
        id="vault"
        className="scroll-mt-4 mt-6 rounded-lg border border-border-subtle bg-bg-panel/60 p-5"
      >
        <h2 className="text-base font-semibold text-text-primary">Vault</h2>
        <p className="mt-1 text-xs text-text-muted">
          Encrypted secret + file storage referenced from pipeline steps via{' '}
          <code className="font-mono text-text-secondary">{'${{ secrets.X }}'}</code>
          {' '}and{' '}
          <code className="font-mono text-text-secondary">{'${{ files.X }}'}</code>
          .
        </p>
        <p className="mt-3 text-[11px] text-text-faint">
          Manage entries on the{' '}
          <a href="/secrets" className="text-accent hover:underline">
            /secrets
          </a>{' '}
          and{' '}
          <a href="/vault-files" className="text-accent hover:underline">
            /vault-files
          </a>{' '}
          pages. An inline mini-manager is planned for a follow-up PR.
        </p>
      </section>

      <section
        id="users"
        className="scroll-mt-4 mt-6 rounded-lg border border-border-subtle bg-bg-panel/60 p-5"
      >
        <h2 className="text-base font-semibold text-text-primary">Users &amp; Access</h2>
        <p className="mt-1 text-xs text-text-muted">
          Local user accounts, roles, API tokens, and audit log.
        </p>
        <p className="mt-3 text-[11px] text-text-faint">
          Manage on{' '}
          <a href="/users" className="text-accent hover:underline">
            /users
          </a>
          ,{' '}
          <a href="/api-tokens" className="text-accent hover:underline">
            /api-tokens
          </a>
          , and{' '}
          <a href="/audit" className="text-accent hover:underline">
            /audit
          </a>
          . An inline overview card lands in a follow-up PR.
        </p>
      </section>

      <section
        id="about"
        className="scroll-mt-4 mt-6 rounded-lg border border-border-subtle bg-bg-panel/60 p-5"
      >
        <div className="mb-2">
          <h2 className="text-base font-semibold text-text-primary">About</h2>
          <p className="mt-1 text-xs text-text-muted">
            BuildPilot is a local-first CI/CD runner. No external connections
            unless you wire one in (Slack / Discord / Telegram / VCS check-runs).
          </p>
        </div>
        <ul className="text-[12.5px] text-text-secondary space-y-1 mt-3">
          <li>
            <span className="text-text-muted">Config file:</span>{' '}
            <code className="font-mono text-text-primary">~/.buildpilot/config.json</code>
          </li>
          <li>
            <span className="text-text-muted">Database:</span>{' '}
            <code className="font-mono text-text-primary">~/.buildpilot/buildpilot.db</code>
          </li>
          <li>
            <span className="text-text-muted">Artifacts:</span>{' '}
            <code className="font-mono text-text-primary">~/.buildpilot/artifacts/</code>
          </li>
        </ul>
      </section>
      </div>
    </div>
  );
}

// UI v2 Faz 10.1 — sticky nav link helper. Plain anchor link so the
// browser's hash navigation drives the section scroll; the scroll-mt-4
// utility on each <section> keeps the heading clear of the top edge.
function SettingsNavLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="rounded-btn px-2 py-1 text-[12px] text-text-secondary hover:bg-bg-hover hover:text-text-primary transition-colors"
    >
      {label}
    </a>
  );
}

function AppearanceSection() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const density = useStore((s) => s.density);
  const setDensity = useStore((s) => s.setDensity);
  const language = useStore((s) => s.language);
  const setLanguage = useStore((s) => s.setLanguage);
  const { t } = useTranslation();

  function changeLanguage(lang: string) {
    setLanguage(lang);
    void i18n.changeLanguage(lang);
  }

  return (
    <section className="mb-6 rounded-lg border border-border-subtle bg-bg-panel/60 p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <Palette size={16} className="text-accent" /> Appearance
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Theme, density, and language. Stored in this browser only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('theme.title')}
          </div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeChoice)}
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="system">{t('theme.system')}</option>
            <option value="dark">{t('theme.dark')}</option>
            <option value="light">{t('theme.light')}</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('density.title')}
          </div>
          <select
            value={density}
            onChange={(e) => setDensity(e.target.value as Density)}
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="comfortable">{t('density.comfortable')}</option>
            <option value="compact">{t('density.compact')}</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
            {t('language.title')}
          </div>
          <select
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-sm text-text-primary focus:border-accent focus:outline-none"
          >
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>
      </div>

      <AccentPicker />
    </section>
  );
}

// UI v2 Faz 12 — accent colour picker. Applies live via applyAccent()
// so every component reading var(--accent*) repaints without a reload.
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
  function pick(hex: string) {
    setAccent(hex);
    applyAccent(hex);
    writeStoredAccent(hex);
  }
  return (
    <div className="mt-4 pt-4 border-t border-border-subtle">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-text-muted">
        Accent colour
      </div>
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
                ? 'border-text-primary scale-110'
                : 'border-border-subtle'
            }`}
            style={{ backgroundColor: p.hex }}
          />
        ))}
        <label className="ml-2 inline-flex items-center gap-2 text-[12px] text-text-muted">
          Custom
          <input
            type="color"
            value={accent}
            onChange={(e) => pick(e.target.value)}
            className="h-7 w-7 rounded cursor-pointer border border-border-subtle bg-transparent"
            aria-label="Custom accent hex"
          />
        </label>
        <button
          type="button"
          onClick={() => pick(DEFAULT_ACCENT)}
          className="ml-2 text-[11px] text-text-muted hover:text-text-primary transition-colors"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
        {label}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-text-muted">{hint}</div>}
    </div>
  );
}

function BannerView({ state }: { state: Banner }) {
  if (state.kind === 'idle' || state.kind === 'saving' || state.kind === 'testing') {
    return <div className="text-xs text-text-muted">&nbsp;</div>;
  }
  if (state.kind === 'saved') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400">
        <CheckCircle2 size={13} /> Saved & bot restarted.
      </div>
    );
  }
  if (state.kind === 'test-ok') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-emerald-400">
        <CheckCircle2 size={13} /> Test message delivered.
      </div>
    );
  }
  if (state.kind === 'test-fail') {
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-400">
        <AlertCircle size={13} /> Test failed: {state.message}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-rose-400">
      <AlertCircle size={13} /> {state.message}
    </div>
  );
}

// ── Execution Lanes (WP6) ────────────────────────────────────────────────────
// Lanes serialize pipeline runs that share hardware. This section lets the
// operator rename, retune (max concurrency), add, or delete lanes. Pipeline
// usage is computed client-side from the already-loaded pipelines list so we
// don't need a dedicated /api/lanes/usage endpoint.
type LaneBanner =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'in-use'; laneName: string; pipelineCount: number };

function LanesSection() {
  const lanes = useStore((s) => s.lanes);
  const pipelines = useStore((s) => s.pipelines);
  const loadLanes = useStore((s) => s.loadLanes);
  const [banner, setBanner] = useState<LaneBanner>({ kind: 'idle' });
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMax, setNewMax] = useState('1');

  // Count pipelines per lane once so each row doesn't re-scan the list.
  const usageByLane = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of pipelines) {
      map.set(p.laneId, (map.get(p.laneId) ?? 0) + 1);
    }
    return map;
  }, [pipelines]);

  async function onCreate() {
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

  async function onDelete(lane: Lane) {
    if (lane.id === 'default') return; // server enforces 403 too
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
        // Still refresh: the user may want to see updated usage.
        await loadLanes();
        return;
      }
      setBanner({
        kind: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-panel/60 p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <Layers size={16} className="text-accent" /> Execution Lanes
        </h2>
        <p className="mt-1 text-xs text-text-muted">
          Lanes serialize pipeline runs that share hardware. Each lane has its own
          concurrency budget.
        </p>
      </div>

      {banner.kind === 'in-use' && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-700/60 bg-amber-900/20 px-3 py-2 text-xs text-amber-200">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>
            Cannot delete lane <strong>{banner.laneName}</strong> — still used by{' '}
            {banner.pipelineCount} pipeline{banner.pipelineCount === 1 ? '' : 's'}.
            Reassign them first.
          </span>
        </div>
      )}
      {banner.kind === 'error' && (
        <div className="mb-3 flex items-start gap-2 rounded-md border border-rose-700/60 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          <span>{banner.message}</span>
        </div>
      )}

      <div className="divide-y divide-border-subtle rounded-md border border-border-subtle bg-bg-base/40">
        {lanes.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-text-faint">
            No lanes yet. Add one below.
          </div>
        ) : (
          lanes.map((lane) => (
            <LaneRow
              key={lane.id}
              lane={lane}
              usageCount={usageByLane.get(lane.id) ?? 0}
              onError={(message) => setBanner({ kind: 'error', message })}
              onDelete={() => void onDelete(lane)}
            />
          ))
        )}
      </div>

      <div className="mt-4 flex items-end gap-2">
        <div className="flex-1">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
            Lane name
          </div>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. mac-builder-1"
            spellCheck={false}
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-xs text-text-primary placeholder:text-text-faint focus:border-accent focus:outline-none"
          />
        </div>
        <div className="w-32">
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-text-muted">
            Max concurrency
          </div>
          <input
            type="number"
            min={1}
            max={64}
            value={newMax}
            onChange={(e) => setNewMax(e.target.value)}
            className="w-full rounded-md border border-border-subtle bg-bg-base px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => void onCreate()}
          disabled={adding}
          className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          <Plus size={13} /> {adding ? 'Adding…' : 'Add lane'}
        </button>
      </div>
    </section>
  );
}

function LaneRow({
  lane,
  usageCount,
  onError,
  onDelete,
}: {
  lane: Lane;
  usageCount: number;
  onError: (message: string) => void;
  onDelete: () => void;
}) {
  const loadLanes = useStore((s) => s.loadLanes);
  const [name, setName] = useState(lane.name);
  const [max, setMax] = useState(String(lane.maxConcurrency));
  const [saving, setSaving] = useState(false);

  // Re-sync local edit state when the parent re-fetches (e.g. after another
  // mutation). Without this, a successful PATCH elsewhere would leave stale
  // values in the input.
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

  async function onSave() {
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
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="flex-1 min-w-0">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) void onSave();
          }}
          spellCheck={false}
          className="w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm text-text-primary hover:border-border-subtle focus:border-accent focus:bg-bg-base focus:outline-none"
        />
        <div className="px-1.5 text-[11px] text-text-faint">
          Used by {usageCount} pipeline{usageCount === 1 ? '' : 's'}
          {isDefault && ' · default lane'}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] uppercase tracking-wider text-text-faint">Max</span>
        <input
          type="number"
          min={1}
          max={64}
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && dirty) void onSave();
          }}
          className="w-16 rounded-md border border-border-subtle bg-bg-base px-2 py-1 text-center text-xs text-text-primary focus:border-accent focus:outline-none"
        />
      </div>
      <button
        type="button"
        onClick={() => void onSave()}
        disabled={!dirty || saving}
        className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-bg-elevated disabled:text-text-faint"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onDelete}
        disabled={isDefault}
        title={isDefault ? 'Default lane cannot be deleted' : `Delete ${lane.name}`}
        className="rounded-md border border-border-subtle p-1.5 text-text-muted hover:border-rose-500 hover:text-rose-400 disabled:cursor-not-allowed disabled:border-border-subtle disabled:text-text-faint disabled:hover:border-border-subtle disabled:hover:text-text-faint"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// UI v2 Faz 10.3 — AI Integrations. Per-tool path + model overrides for
// the four built-in AI CLIs (claude / codex / aider / gemini). Backed by
// GET/PUT /api/config/ai-integrations.
function AiIntegrationsSection() {
  const [config, setConfig] = useState<AiIntegrationsConfig>({});
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    api.getAiIntegrations().then(setConfig).catch((e) => setError(String(e)));
  }, []);

  const TOOLS: Array<{ key: keyof AiIntegrationsConfig; label: string; modelHint: string }> = [
    { key: 'claude', label: 'Claude (claude-code)', modelHint: 'claude-opus-4-7' },
    { key: 'codex', label: 'Codex CLI', modelHint: 'gpt-4o' },
    { key: 'aider', label: 'Aider', modelHint: 'gpt-4o' },
    { key: 'gemini', label: 'Gemini CLI', modelHint: 'gemini-1.5-pro' },
  ];

  function updateTool(key: keyof AiIntegrationsConfig, patch: Partial<AiToolConfig>) {
    setConfig((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const next = await api.updateAiIntegrations(config);
      setConfig(next);
      setDirty(false);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-panel/60 p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text-primary">AI Integrations</h2>
          <p className="mt-1 text-xs text-text-muted">
            Override the binary path + default model for each AI CLI used by the{' '}
            <code className="font-mono text-text-secondary">aiPrompt</code> step.
            Empty = look up on PATH + let the CLI pick its own default.
          </p>
        </div>
        {savedAt && !dirty && (
          <span className="text-[11px] text-status-success">Saved</span>
        )}
      </div>
      <div className="space-y-3">
        {TOOLS.map((tool) => {
          const cfg = config[tool.key] ?? {};
          return (
            <div
              key={tool.key}
              className="rounded-md border border-border-subtle bg-bg-base p-3"
            >
              <div className="mb-2 text-[12.5px] font-medium text-text-primary">
                {tool.label}
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <label className="block text-[11px] text-text-muted">
                  Path override
                  <input
                    type="text"
                    value={cfg.path ?? ''}
                    onChange={(e) => updateTool(tool.key, { path: e.target.value })}
                    placeholder={
                      // Cross-platform — the server validator accepts either
                      // a POSIX or Windows absolute path, so the placeholder
                      // hints both forms.
                      navigator.platform.startsWith('Win')
                        ? `C:\\Program Files\\${tool.key}\\${tool.key}.exe`
                        : `/usr/local/bin/${tool.key}`
                    }
                    className="mt-0.5 w-full rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-[12px] font-mono text-text-primary placeholder:text-text-faint focus:border-accent focus:outline-none transition-colors"
                  />
                </label>
                <label className="block text-[11px] text-text-muted">
                  Default model
                  <input
                    type="text"
                    value={cfg.model ?? ''}
                    onChange={(e) => updateTool(tool.key, { model: e.target.value })}
                    placeholder={tool.modelHint}
                    className="mt-0.5 w-full rounded-md border border-border-subtle bg-bg-elevated px-2 py-1 text-[12px] font-mono text-text-primary placeholder:text-text-faint focus:border-accent focus:outline-none transition-colors"
                  />
                </label>
              </div>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="mt-3 rounded border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-[12px] text-rose-300">
          {error}
        </div>
      )}
      <div className="mt-4 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// UI v2 Faz 10.4 — Security. Master key visibility + a short summary of
// what gets encrypted at rest. The master key itself never leaves the
// server; this panel just shows whether it's been initialised and where
// to rotate it.
function SecuritySection() {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-panel/60 p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold text-text-primary">
        <Lock size={16} className="text-amber-400" /> Security
      </h2>
      <p className="mt-1 text-xs text-text-muted">
        Sensitive config is encrypted at rest with a master key derived from{' '}
        <code className="font-mono text-text-secondary">~/.buildpilot/config.json</code>
        's owner. The key never leaves the server.
      </p>
      <div className="mt-4 rounded-md border border-border-subtle bg-bg-base overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-border-subtle bg-bg-elevated text-[10px] uppercase tracking-wider text-text-muted">
              <th className="text-left px-3 py-1.5">Field</th>
              <th className="text-left px-3 py-1.5">Encrypted</th>
            </tr>
          </thead>
          <tbody className="text-text-secondary">
            <tr className="border-b border-border-subtle">
              <td className="px-3 py-1.5 font-mono">telegram.botToken</td>
              <td className="px-3 py-1.5 text-status-success">yes</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="px-3 py-1.5 font-mono">secrets.*</td>
              <td className="px-3 py-1.5 text-status-success">yes</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="px-3 py-1.5 font-mono">vaultFiles.*</td>
              <td className="px-3 py-1.5 text-status-success">yes</td>
            </tr>
            <tr className="border-b border-border-subtle">
              <td className="px-3 py-1.5 font-mono">vcsCredentials.*</td>
              <td className="px-3 py-1.5 text-status-success">yes</td>
            </tr>
            <tr>
              <td className="px-3 py-1.5 font-mono">slack.webhookUrl / discord.webhookUrl</td>
              <td className="px-3 py-1.5 text-status-success">yes</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] text-text-faint">
        To rotate the master key, stop BuildPilot, run{' '}
        <code className="font-mono text-text-secondary">buildpilot encryption rotate-key</code>
        , and restart. All encrypted fields are re-wrapped in place.
      </p>
    </div>
  );
}

// UI v2 Faz 10.5 — Retention. Hard-coded read-only view of the
// retention config; live editing wires to PUT /api/config/retention in
// a follow-up PR (no backend yet for the dashboard mutator).
function RetentionSection() {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-panel/60 p-5">
      <h2 className="text-base font-semibold text-text-primary">Retention</h2>
      <p className="mt-1 text-xs text-text-muted">
        How long BuildPilot keeps build rows, log entries, and artifacts on disk.
        Configured in{' '}
        <code className="font-mono text-text-secondary">~/.buildpilot/config.json</code>
        ; restart to apply.
      </p>
      <ul className="mt-3 text-[12.5px] text-text-secondary space-y-1.5">
        <li>
          <span className="text-text-muted">Build rows:</span>{' '}
          retained indefinitely by default; the{' '}
          <code className="font-mono text-text-secondary">pruneOldBuilds</code> sweep
          fires nightly when{' '}
          <code className="font-mono text-text-secondary">retention.buildDays</code> is
          set.
        </li>
        <li>
          <span className="text-text-muted">Log entries:</span>{' '}
          capped at 5000 in-memory per build; full log lives in{' '}
          <code className="font-mono text-text-secondary">~/.buildpilot/buildpilot.db</code>
          .
        </li>
        <li>
          <span className="text-text-muted">Artifacts:</span>{' '}
          on-disk in{' '}
          <code className="font-mono text-text-secondary">~/.buildpilot/artifacts/</code>
          ; swept alongside their build row.
        </li>
      </ul>
    </div>
  );
}
