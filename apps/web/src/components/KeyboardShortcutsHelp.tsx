import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useStore } from '../store/store';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-border-subtle bg-bg-panel px-1.5 py-0.5 font-mono text-[11px] text-text-primary shadow-inner">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsHelp() {
  const open = useStore((s) => s.shortcutsHelpOpen);
  const close = useStore((s) => s.closeShortcutsHelp);
  const { t } = useTranslation();

  if (!open) return null;

  const rows: { label: string; keys: string[] }[] = [
    { label: t('shortcuts.openPalette'), keys: ['Cmd/Ctrl', 'K'] },
    { label: t('shortcuts.goHome'), keys: ['g', 'h'] },
    { label: t('shortcuts.goProjects'), keys: ['g', 'p'] },
    { label: t('shortcuts.goBuilds'), keys: ['g', 'b'] },
    { label: t('shortcuts.goSettings'), keys: ['g', 's'] },
    { label: t('shortcuts.newPipeline'), keys: ['n'] },
    { label: t('shortcuts.focusSearch'), keys: ['/'] },
    { label: t('shortcuts.closeDialog'), keys: ['Esc'] },
    { label: t('shortcuts.help'), keys: ['?'] },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border-subtle bg-bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border-subtle px-4 py-3">
          <h2 className="text-sm font-semibold text-text-primary">{t('shortcuts.title')}</h2>
          <button
            type="button"
            onClick={close}
            className="focusable rounded p-1 text-text-muted hover:bg-bg-elevated hover:text-text-primary"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <ul className="space-y-1.5 p-4 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3">
              <span className="text-text-secondary">{r.label}</span>
              <span className="flex items-center gap-1">
                {r.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-text-muted">then</span>}
                    <Kbd>{k}</Kbd>
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
