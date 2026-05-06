import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // 'destructive' colors the confirm button red.
  variant?: 'default' | 'destructive';
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
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] rounded-lg border border-slate-700 bg-slate-900 p-5 shadow-xl"
      >
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle
            size={16}
            className={variant === 'destructive' ? 'text-rose-400' : 'text-amber-400'}
          />
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        </div>
        <p className="mb-5 whitespace-pre-line text-[13px] leading-relaxed text-slate-300">
          {body}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-3 py-1.5 text-sm text-slate-400 hover:text-slate-200"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={
              variant === 'destructive'
                ? 'rounded-md bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-500'
                : 'rounded-md bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-500'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
