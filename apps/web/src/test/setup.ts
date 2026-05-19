import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// jsdom lacks `matchMedia` — a couple of components (theme detection, the
// breakpoint hook) reference it during render. Provide a stable polyfill
// so those tests can mount without crashing.
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// IntersectionObserver — required by LogTable / virtualised lists.
if (typeof window !== 'undefined' && !('IntersectionObserver' in window)) {
  class IO {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds: ReadonlyArray<number> = [];
  }
  // @ts-expect-error — jsdom shim
  window.IntersectionObserver = IO;
}

// ResizeObserver — React Flow + several panels reference this on mount.
if (typeof window !== 'undefined' && !('ResizeObserver' in window)) {
  class RO {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  // @ts-expect-error — jsdom shim
  window.ResizeObserver = RO;
}

// jsdom doesn't implement scrollIntoView; cmdk calls it on the active item.
if (typeof window !== 'undefined' && !Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = function scrollIntoView(): void {
    /* no-op for tests */
  };
}

afterEach(() => {
  cleanup();
});
