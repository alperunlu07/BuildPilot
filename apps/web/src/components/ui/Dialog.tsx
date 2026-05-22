import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { lockBodyScroll } from '../../lib/bodyScrollLock';
import { pushEscHandler } from '../../lib/escStack';

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
//
// Faz 5 review follow-up:
//   - body-scroll-lock goes through the refcounted lockBodyScroll() so
//     stacked dialogs don't clobber each other's prior-state snapshot.
//   - Esc/backdrop handlers route through refs so callers passing inline
//     arrows don't churn the listener on every parent re-render.
//   - Focus trap + focus restoration: keyboard Tab cycles inside the
//     dialog while open; focus returns to the previously-focused
//     element on close.
//   - Initial-focus: the first focusable descendant gets focus on open
//     (matches the WAI-ARIA Authoring Practices for modal dialogs).
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
  // ARIA role. Defaults to "dialog"; pass "alertdialog" for confirmation
  // prompts that need to interrupt the user (ConfirmDialog pattern).
  role?: 'dialog' | 'alertdialog';
  size?: DialogSize;
  // Class applied to the inner panel (sizing/visuals). Use for adding
  // custom padding or background overrides per-consumer.
  className?: string;
  // Class applied to the fixed-inset overlay. Use only when stacking
  // demands (e.g. z-[60] over another modal at z-50).
  overlayClassName?: string;
  // Set true for full-bleed body content (e.g. ArtifactPreviewModal with
  // its own padded chrome). Default applies p-5.
  unpadded?: boolean;
  children: ReactNode;
}

// Tab-focusable descendants for the trap. Excludes negative tabindex,
// disabled controls, and elements rendered inside aria-hidden subtrees
// (handled implicitly because we query only inside the dialog).
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({
  open,
  onClose,
  ariaLabel,
  role = 'dialog',
  size = 'md',
  className,
  overlayClassName,
  unpadded = false,
  children,
}: DialogProps) {
  // onClose ref so the Esc / backdrop listeners don't tear down whenever
  // the parent re-renders with a new inline arrow.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Track the element that had focus when the dialog opened so we can
  // hand focus back on close (WCAG 2.4.3 focus order).
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // Esc dismisses — go through the top-of-stack registry so stacked
  // dialogs (e.g. ConfirmDialog z-[60] over AddProjectDialog z-50)
  // dismiss only the topmost on a single Escape press, instead of
  // every registered handler firing in attach order.
  useEffect(() => {
    if (!open) return;
    return pushEscHandler(() => onCloseRef.current());
  }, [open]);

  // Body-scroll lock via refcount.
  useEffect(() => {
    if (!open) return;
    return lockBodyScroll();
  }, [open]);

  // Focus management — capture the prior focus, move focus into the
  // dialog after mount, and restore on close. Callers can opt-in to a
  // specific initial target by marking it with `data-autofocus`; the
  // wrapper falls back to the first VISIBLE focusable (matching the
  // Tab handler's filter below), and finally the panel itself.
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = (document.activeElement as HTMLElement) ?? null;
    // Defer to next tick so the panel and its children are in the DOM.
    const id = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const autoFocus = panel.querySelector<HTMLElement>('[data-autofocus]');
      const firstVisible = autoFocus
        ? null
        : Array.from(
            panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
          ).find((el) => {
            if (el.getClientRects().length === 0) return false;
            return getComputedStyle(el).visibility !== 'hidden';
          });
      (autoFocus ?? firstVisible ?? panel).focus();
    }, 0);
    return () => {
      window.clearTimeout(id);
      previouslyFocused.current?.focus?.();
    };
  }, [open]);

  // Focus trap — intercept Tab inside the dialog and wrap focus around
  // the focusable descendants instead of escaping into the page behind.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      // Visibility filter — accept anything with at least one client
      // rect and not explicitly `visibility:hidden`. The previous
      // `offsetParent !== null` check missed `position: fixed` and any
      // descendant of a `display: contents` ancestor.
      const focusables = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => {
        if (el.getClientRects().length === 0) return false;
        return getComputedStyle(el).visibility !== 'hidden';
      });
      const active = document.activeElement as HTMLElement | null;
      // Containment branch — if focus ever leaks outside the panel
      // (e.g. the initial-focus path landed on the panel itself and
      // the next Tab tries to move into the page behind), force it
      // back to the first focusable child. Without this, focus
      // escapes the dialog and Tab cycles through background controls
      // — WCAG 2.4.3 violation.
      if (!panel.contains(active)) {
        e.preventDefault();
        (focusables[0] ?? panel).focus();
        return;
      }
      if (focusables.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = focusables[0]!;
      const last = focusables[focusables.length - 1]!;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open]);

  if (!open) return null;

  return (
    <div
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      className={cn(
        'fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4',
        overlayClassName,
      )}
      onClick={() => onCloseRef.current()}
    >
      <div
        ref={panelRef}
        // tabIndex=-1 so the panel itself can receive focus as a
        // fallback when no focusable descendants exist.
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={cn(
          // Mobile: fill width minus inset (the parent already has p-3),
          // cap height to dynamic-vh and allow internal scroll.
          'w-full max-h-[calc(100dvh-24px)] overflow-y-auto outline-none',
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
