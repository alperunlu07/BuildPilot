import { Ban, Check, Loader2, X, Circle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BuildStatus } from '@buildpilot/shared-types';

// Cluster 10.F — pair every status pill / dot / sparkline cell with an icon
// (or at minimum an aria-label) so screen-readers and colorblind users have
// a non-color cue. Sparklines stay icon-less because each cell is a 1-2px
// rectangle — they get the `title`/`aria-label` from `statusLabel` instead.

export type AccessibleStatus = BuildStatus;
// "Step runtime" uses a smaller alphabet that maps onto the build alphabet.
export type StepRuntimeStatus = 'running' | 'success' | 'failed' | 'skipped';

const BUILD_ICON: Record<AccessibleStatus, LucideIcon> = {
  pending: Circle,
  running: Loader2,
  success: Check,
  failed: X,
  cancelled: Ban,
};

const STEP_ICON: Record<StepRuntimeStatus, LucideIcon> = {
  running: Loader2,
  success: Check,
  failed: X,
  skipped: Ban,
};

export function statusIcon(status: AccessibleStatus): LucideIcon {
  return BUILD_ICON[status];
}

export function stepStatusIcon(status: StepRuntimeStatus): LucideIcon {
  return STEP_ICON[status];
}

export function statusLabel(status: AccessibleStatus): string {
  switch (status) {
    case 'pending':
      return 'Pending';
    case 'running':
      return 'Running';
    case 'success':
      return 'Succeeded';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
  }
}

// `Loader2` is the lucide spinner — paired with `animate-spin` it pulses.
// We wrap with `motion-safe:` so it freezes for users with
// `prefers-reduced-motion`. Returned as a class string so callers can mix
// it into their existing badge utilities without forking the JSX.
export function statusIconAnimationClass(status: AccessibleStatus | StepRuntimeStatus): string {
  return status === 'running' ? 'motion-safe:animate-spin' : '';
}
