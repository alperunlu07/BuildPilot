import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

// UI v2 primitive — ports .prop-tab. Underline-only style (no background
// fill on the active tab). Controlled, because every consumer in the v2
// design owns its own active-tab state.
export interface TabItem<T extends string> {
  id: T;
  label: string;
  // Optional badge count (e.g. "3" for "Failed (3)"). Renders as a small
  // muted chip after the label.
  count?: number;
  // Optional leading icon — most often a lucide glyph at 14px.
  icon?: ReactNode;
}

export interface TabsProps<T extends string> {
  items: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (next: T) => void;
  // When true, the row scrolls horizontally instead of wrapping. Used by
  // the Build Detail screen where 7 tabs would otherwise wrap on narrow
  // viewports.
  scrollable?: boolean;
  className?: string;
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  scrollable = false,
  className,
}: TabsProps<T>): JSX.Element {
  return (
    <div
      role="tablist"
      className={cn(
        'flex items-center border-b border-border-subtle',
        scrollable && 'overflow-x-auto scrollbar-thin',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 h-9 text-[12.5px] font-medium',
              'border-b-2 -mb-px transition-colors duration-150 whitespace-nowrap',
              active
                ? 'text-accent border-accent'
                : 'text-text-muted border-transparent hover:text-text-primary',
            )}
          >
            {item.icon}
            <span>{item.label}</span>
            {typeof item.count === 'number' && (
              <span
                className={cn(
                  'inline-flex items-center justify-center px-1.5 h-4 rounded text-[10.5px] font-medium',
                  active
                    ? 'bg-accent-soft text-accent'
                    : 'bg-bg-elevated text-text-muted',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
