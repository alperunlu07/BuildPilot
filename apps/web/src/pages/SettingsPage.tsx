import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock, Palette, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TelegramConfigPublic } from '@buildpilot/shared-types';
import { api } from '../lib/api';
import { useStore } from '../store/store';
import type { Density, ThemeChoice } from '../lib/theme';
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
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-100">Settings</h1>
        <p className="mt-1 text-sm text-slate-400">
          Server-wide configuration. Secrets are stored encrypted at rest in{' '}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">
            ~/.buildpilot/config.json
          </code>
          .
        </p>
      </div>

      <AppearanceSection />

      <section className="rounded-lg border border-slate-800 bg-slate-900/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
              <Send size={16} className="text-sky-400" /> Telegram
            </h2>
            <p className="mt-1 text-xs text-slate-400">
              Bot token + default chat used by <code>telegramNotify</code> steps and
              branch-advance approval prompts. The bot restarts automatically when you
              save.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
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
                  className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
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
                  className="w-full rounded-md border border-slate-700 bg-slate-950 px-7 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300"
                  title={showToken ? 'Hide' : 'Show'}
                >
                  {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
              {loaded?.hasBotToken && (
                <button
                  type="button"
                  onClick={onClearToken}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-rose-500 hover:text-rose-400"
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
                className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-100 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
              />
              {loaded?.hasChatId && (
                <button
                  type="button"
                  onClick={onClearChatId}
                  className="rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-400 hover:border-rose-500 hover:text-rose-400"
                  title="Remove the stored chat ID"
                >
                  Clear
                </button>
              )}
            </div>
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-between border-t border-slate-800 pt-4">
          <BannerView state={banner} />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onTest}
              disabled={banner.kind === 'testing' || banner.kind === 'saving'}
              className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:border-sky-500 hover:text-sky-300 disabled:opacity-50"
            >
              Send test message
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={banner.kind === 'saving'}
              className="rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {banner.kind === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    </div>
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
    <section className="mb-6 rounded-lg border border-slate-800 bg-slate-900/40 p-5">
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-100">
          <Palette size={16} className="text-sky-400" /> Appearance
        </h2>
        <p className="mt-1 text-xs text-slate-400">
          Theme, density, and language. Stored in this browser only.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
            {t('theme.title')}
          </div>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value as ThemeChoice)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="system">{t('theme.system')}</option>
            <option value="dark">{t('theme.dark')}</option>
            <option value="light">{t('theme.light')}</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
            {t('density.title')}
          </div>
          <select
            value={density}
            onChange={(e) => setDensity(e.target.value as Density)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="comfortable">{t('density.comfortable')}</option>
            <option value="compact">{t('density.compact')}</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
            {t('language.title')}
          </div>
          <select
            value={language}
            onChange={(e) => changeLanguage(e.target.value)}
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm text-slate-100 focus:border-sky-500 focus:outline-none"
          >
            <option value="en">English</option>
            <option value="tr">Türkçe</option>
          </select>
        </div>
      </div>
    </section>
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
      <div className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
        {label}
      </div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-slate-400">{hint}</div>}
    </div>
  );
}

function BannerView({ state }: { state: Banner }) {
  if (state.kind === 'idle' || state.kind === 'saving' || state.kind === 'testing') {
    return <div className="text-xs text-slate-400">&nbsp;</div>;
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
