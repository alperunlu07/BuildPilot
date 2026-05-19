import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { useStore } from '../store/store';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex min-w-[1.5rem] items-center justify-center rounded border border-slate-700 bg-slate-900 px-1.5 py-0.5 font-mono text-[11px] text-slate-200 shadow-inner">
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
        className="w-full max-w-md rounded-lg border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-100">{t('shortcuts.title')}</h2>
          <button
            type="button"
            onClick={close}
            className="focusable rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
        <ul className="space-y-1.5 p-4 text-sm">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-3">
              <span className="text-slate-300">{r.label}</span>
              <span className="flex items-center gap-1">
                {r.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    {i > 0 && <span className="text-slate-400">then</span>}
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
