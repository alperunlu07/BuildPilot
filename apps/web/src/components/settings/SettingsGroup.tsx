import type { ReactNode } from 'react';

// Ports docs/designs/extras.css `.settings-group` + `.settings-group-head`
// + `.settings-group-body`. The head sits above a bordered, rounded
// surface — every section is built from one or more groups so the page
// reads as a stack of contained config blocks.
export interface SettingsGroupProps {
  title: string;
  desc?: ReactNode;
  // Optional right-aligned control rendered next to the title (e.g. an
  // "Enabled" switch for the whole group).
  trailing?: ReactNode;
  children: ReactNode;
}

export function SettingsGroup({ title, desc, trailing, children }: SettingsGroupProps) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold tracking-tight text-text-primary">{title}</h3>
          {desc && <p className="mt-1 text-xs text-text-muted leading-relaxed">{desc}</p>}
        </div>
        {trailing && <div className="shrink-0">{trailing}</div>}
      </div>
      <div className="overflow-hidden rounded-lg border border-border-subtle bg-bg-panel">
        {children}
      </div>
    </section>
  );
}
