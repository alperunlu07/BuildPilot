// Responsive overhaul follow-up — refcounted body-scroll lock.
//
// Multiple dialogs/drawers can be open at once (e.g. ConfirmDialog at
// z-[60] on top of an AddProjectDialog at z-50). The naive
// `body.style.overflow = 'hidden'` + restore-on-close pattern clobbers
// itself in stacked scenarios:
//
//   - Open A: prev='', body='hidden'
//   - Open B: prev='hidden', body='hidden'
//   - Close A first: restores '' → body becomes scrollable while B is
//     still visible.
//
// This module solves it by keeping a single shared refcount and storing
// the ORIGINAL overflow value only on the first lock. Callers `lockBodyScroll()`
// and call the returned function to release; the body only unlocks when
// the refcount reaches zero.

let lockCount = 0;
let originalOverflow: string | null = null;

export function lockBodyScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (lockCount === 0) {
    originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  lockCount += 1;
  let released = false;
  return function release() {
    if (released) return;
    released = true;
    lockCount = Math.max(0, lockCount - 1);
    if (lockCount === 0) {
      document.body.style.overflow = originalOverflow ?? '';
      originalOverflow = null;
    }
  };
}
