import { useEffect, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

// Responsive overhaul Faz 0 — shared modal wrapper.
//
// Every existing dialog hardcoded its width (w-[420px]..w-[480px]) which
// caused overflow on viewports < ~500px. This primitive centralises the
// responsive sizing rule:
//
//   - On phones: fill the viewport minus a 12px inset on each side, cap
//     height to the visible viewport (using dynamic-vh so iOS Safari's
//     URL bar doesn't push content under the chrome).
//   - From the `sm` breakpoint up: switch to the size preset (sm/md/lg)
//     and centre as a fixed-width card.
//
// Callers should NOT add their own w-[...] class; the wrapper owns sizing.
// Pass `size` to choose which desktop width applies.
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'sm:w-[420px]',
  md: 'sm:w-[480px]',
  lg: 'sm:w-[640px]',
  xl: 'sm:w-[860px]',
};

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  // Optional aria-label. When omitted the consumer should pass a labelled
  // heading inside `children` so screen readers still announce the dialog.
  ariaLabel?: string;
  // Renders the surrounding role="dialog" container's own className. The
  // background overlay is always rendered.
  size?: DialogSize;
  className?: string;
  // Set true for full-bleed body content (e.g. ArtifactPreviewModal with
  // its own padded chrome). Default applies p-5.
  unpadded?: boolean;
  children: ReactNode;
}

export function Dialog({
  open,
  onClose,
  ariaLabel,
  size = 'md',
  className,
  unpadded = false,
  children,
}: DialogProps) {
  // Close on Escape — mirrors the pattern every existing dialog implemented
  // ad-hoc. Centralising it here keeps behaviour consistent.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll while the dialog is open so the page underneath
  // doesn't drift on mobile when the user scrolls inside the dialog.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // Mobile: fill width minus inset (the parent already has p-3),
          // cap height to dynamic-vh and allow internal scroll.
          'w-full max-h-[calc(100dvh-24px)] overflow-y-auto',
          // From sm up: switch to a fixed width per the size preset.
          SIZE_CLASSES[size],
          // Visuals.
          'rounded-lg border border-border-subtle bg-bg-panel shadow-xl',
          !unpadded && 'p-5',
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
