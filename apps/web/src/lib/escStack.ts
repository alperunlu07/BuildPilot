// Responsive overhaul — top-of-stack Escape handler registry.
//
// Multiple dialogs can be open simultaneously (e.g. ConfirmDialog at
// z-[60] over an AddProjectDialog at z-50). If each dialog installs its
// own `window.addEventListener('keydown', ...)`, a single Escape press
// fires every handler in attach order — closing both modals at once.
// The user pressed Esc to cancel the destructive confirmation, but the
// underlying form is lost too.
//
// This module centralises the dispatch: one window listener, a LIFO
// stack of registered handlers, only the top responds. The convention
// matches the WAI-ARIA Authoring Practices for nested modal dialogs.

let escStack: Array<() => void> = [];
let listenerAttached = false;

function ensureListener(): void {
  if (listenerAttached || typeof window === 'undefined') return;
  listenerAttached = true;
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const top = escStack[escStack.length - 1];
    if (top) top();
  });
}

// Push a handler onto the stack. Returns a release function — call it
// in the effect cleanup. Releases match by identity so out-of-order
// releases don't corrupt the stack.
export function pushEscHandler(handler: () => void): () => void {
  ensureListener();
  escStack.push(handler);
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    escStack = escStack.filter((h) => h !== handler);
  };
}
