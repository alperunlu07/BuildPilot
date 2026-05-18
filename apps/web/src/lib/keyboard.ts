import { useEffect } from 'react';
import { useStore, type View } from '../store/store';

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

function isMetaCombo(e: KeyboardEvent): boolean {
  return (e.metaKey || e.ctrlKey) && !e.altKey;
}

// Global keyboard shortcut handler. Implements:
//   Cmd/Ctrl+K  — toggle palette
//   ?           — open shortcuts help
//   /           — focus first input/search in the page (best-effort)
//   Esc         — close dialogs / palette / shortcuts help
//   g h/p/b/s   — navigate (chord)
//   n           — open new pipeline dialog (in project context)
export function useGlobalShortcuts(opts: {
  onNewPipeline?: () => void;
}): void {
  const setView = useStore((s) => s.setView);
  const togglePalette = useStore((s) => s.togglePalette);
  const closePalette = useStore((s) => s.closePalette);
  const openShortcutsHelp = useStore((s) => s.openShortcutsHelp);
  const closeShortcutsHelp = useStore((s) => s.closeShortcutsHelp);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const shortcutsHelpOpen = useStore((s) => s.shortcutsHelpOpen);
  const confirmation = useStore((s) => s.confirmation);
  const closeConfirmation = useStore((s) => s.closeConfirmation);

  useEffect(() => {
    let pendingG = false;
    let pendingGTimer: ReturnType<typeof setTimeout> | null = null;

    function go(view: View): void {
      setView(view);
    }

    function onKey(e: KeyboardEvent): void {
      // Always-on: Cmd/Ctrl+K toggles the palette regardless of focus.
      if (isMetaCombo(e) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        togglePalette();
        return;
      }

      // Esc closes overlays (palette > shortcuts > confirmation).
      if (e.key === 'Escape') {
        if (paletteOpen) {
          closePalette();
          return;
        }
        if (shortcutsHelpOpen) {
          closeShortcutsHelp();
          return;
        }
        if (confirmation) {
          closeConfirmation();
          return;
        }
      }

      // Beyond this point, ignore shortcuts while editing text.
      if (isEditable(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '?') {
        e.preventDefault();
        openShortcutsHelp();
        return;
      }

      if (e.key === '/') {
        const search = document.querySelector<HTMLInputElement>(
          'input[type="search"], input[data-global-search]',
        );
        if (search) {
          e.preventDefault();
          search.focus();
          search.select();
        }
        return;
      }

      if (e.key === 'n' || e.key === 'N') {
        if (opts.onNewPipeline) {
          e.preventDefault();
          opts.onNewPipeline();
        }
        return;
      }

      if (pendingG) {
        pendingG = false;
        if (pendingGTimer) {
          clearTimeout(pendingGTimer);
          pendingGTimer = null;
        }
        if (e.key === 'h') {
          e.preventDefault();
          go({ type: 'home' });
          return;
        }
        if (e.key === 'p') {
          e.preventDefault();
          go({ type: 'projects' });
          return;
        }
        if (e.key === 'b') {
          e.preventDefault();
          go({ type: 'builds' });
          return;
        }
        if (e.key === 's') {
          e.preventDefault();
          go({ type: 'settings' });
          return;
        }
        return;
      }

      if (e.key === 'g' || e.key === 'G') {
        pendingG = true;
        pendingGTimer = setTimeout(() => {
          pendingG = false;
        }, 1000);
      }
    }

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (pendingGTimer) clearTimeout(pendingGTimer);
    };
  }, [
    setView,
    togglePalette,
    closePalette,
    openShortcutsHelp,
    closeShortcutsHelp,
    paletteOpen,
    shortcutsHelpOpen,
    confirmation,
    closeConfirmation,
    opts,
  ]);
}
