import { useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // 'destructive' colors the confirm button red.
  variant?: 'default' | 'destructive';
  // When set, the user must type this exact value into a confirmation input
  // before the confirm button enables. Use for irreversible actions like
  // project removal or bulk prune.
  typedConfirmation?: string;
  onConfirm(): void;
  onCancel(): void;
}

// Inline modal replacement for window.confirm — some browser profiles
// (popup blockers, enterprise policy) suppress native dialogs entirely
// which makes destructive actions silently fail. This dialog renders
// inside the React tree so it's always visible.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
  variant = 'default',
  typedConfirmation,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTyped('');
      // Defer focus so the input is mounted before we call .focus()
      const id = window.setTimeout(() => inputRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
  }, [open]);

  if (!open) return null;
  const needsType = typedConfirmation !== undefined && typedConfirmation.length > 0;
  const canConfirm = !needsType || typed === typedConfirmation;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-bp-surface-0/70 backdrop-blur-sm"
      onClick={onCancel}
      role="presentation"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] rounded-lg border border-bp-surface-3 bg-bp-surface-1 p-5 shadow-xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
      >
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle
            size={16}
            className={variant === 'destructive' ? 'text-bp-error' : 'text-bp-warning'}
          />
          <h3 id="confirm-dialog-title" className="text-sm font-semibold text-bp-text-primary">{title}</h3>
        </div>
        <p className="mb-3 whitespace-pre-line text-[13px] leading-relaxed text-bp-text-secondary">
          {body}
        </p>
        {needsType && (
          <div className="mb-4">
            <p className="mb-1 text-[12px] text-bp-text-muted">
              Type{' '}
              <code className="rounded bg-bp-surface-2 px-1 py-0.5 font-mono text-bp-text-primary">
                {typedConfirmation}
              </code>{' '}
              to confirm:
            </p>
            <input
              ref={inputRef}
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canConfirm) onConfirm();
              }}
              autoComplete="off"
              spellCheck={false}
              className="focusable w-full rounded-md border border-bp-surface-3 bg-bp-surface-0 px-2 py-1.5 font-mono text-sm text-bp-text-primary focus:border-rose-500 focus:outline-none"
            />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="focusable touch-target rounded-md px-3 py-1.5 text-sm text-bp-text-muted hover:text-bp-text-primary"
            aria-label={`${cancelLabel} and close dialog`}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={onConfirm}
            className={
              variant === 'destructive'
                ? 'focusable rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500 disabled:cursor-not-allowed disabled:bg-rose-900/40 disabled:text-rose-300/40'
                : 'focusable rounded-md bg-bp-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-sky-900/40 disabled:text-accent-hover/40'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
