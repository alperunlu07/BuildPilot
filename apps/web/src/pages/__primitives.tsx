import { useState } from 'react';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Card } from '../components/ui/Card';
import { FilterPill } from '../components/ui/FilterPill';
import { Input } from '../components/ui/Input';
import { Kbd } from '../components/ui/Kbd';
import { Select } from '../components/ui/Select';
import { Sparkline, type SparklineBar } from '../components/ui/Sparkline';
import { StatusDot } from '../components/ui/StatusDot';
import { Switch } from '../components/ui/Switch';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { applyDensity, applyTheme } from '../lib/theme';

// Dev-only catalog page showing every Faz 2 primitive in every variant.
// Useful for visually verifying that a token change (Faz 12 polish) or a
// theme/density toggle still renders correctly across the whole set.
//
// Route the App lazily so production bundles don't pay the cost.

const TAB_ITEMS: ReadonlyArray<TabItem<'logs' | 'steps' | 'artifacts'>> = [
  { id: 'logs', label: 'Logs' },
  { id: 'steps', label: 'Steps', count: 12 },
  { id: 'artifacts', label: 'Artifacts', count: 3 },
];

const SAMPLE_BARS: SparklineBar[] = Array.from({ length: 24 }, (_, i) => ({
  status:
    i % 7 === 0
      ? 'failed'
      : i % 11 === 0
        ? 'running'
        : i % 5 === 0
          ? 'skipped'
          : 'success',
  tooltip: `Build #${i + 1}`,
}));

export function PrimitivesPage(): JSX.Element {
  const [tab, setTab] = useState<'logs' | 'steps' | 'artifacts'>('logs');
  const [switchOn, setSwitchOn] = useState(true);
  const [filterActive, setFilterActive] = useState(false);

  return (
    <div className="p-6 space-y-8 max-w-5xl">
      <header className="space-y-2">
        <h1 className="text-xl font-semibold text-text-primary">UI v2 Primitives</h1>
        <p className="text-[12.5px] text-text-muted">
          Visual catalog. Toggle theme / density to inspect.
        </p>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => applyTheme('dark')}>Dark</Button>
          <Button size="sm" onClick={() => applyTheme('light')}>Light</Button>
          <span className="w-px h-4 bg-border-subtle mx-1" />
          <Button size="sm" onClick={() => applyDensity('comfortable')}>Comfortable</Button>
          <Button size="sm" onClick={() => applyDensity('compact')}>Compact</Button>
        </div>
      </header>

      <Section title="Button">
        <Row>
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" loading>Loading</Button>
          <Button variant="secondary" disabled>Disabled</Button>
        </Row>
        <Row>
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="icon-only">
            <span className="text-[14px]">+</span>
          </Button>
        </Row>
      </Section>

      <Section title="Badge">
        <Row>
          <Badge variant="success">Success</Badge>
          <Badge variant="failed">Failed</Badge>
          <Badge variant="running">Running</Badge>
          <Badge variant="pending">Pending</Badge>
          <Badge variant="accent">Accent</Badge>
          <Badge variant="warn">Warn</Badge>
          <Badge variant="neutral">Neutral</Badge>
        </Row>
      </Section>

      <Section title="StatusDot">
        <Row>
          <Dot label="success" />
          <Dot label="failed" />
          <Dot label="running" />
          <Dot label="pending" />
          <Dot label="cancel" />
          <Dot label="skipped" />
        </Row>
      </Section>

      <Section title="Card">
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-4">
            <div className="text-[12.5px] text-text-secondary">Default card</div>
            <div className="text-[10.5px] text-text-muted mt-1">Static surface</div>
          </Card>
          <Card interactive className="p-4">
            <div className="text-[12.5px] text-text-secondary">Interactive</div>
            <div className="text-[10.5px] text-text-muted mt-1">Hover me</div>
          </Card>
          <Card className="p-4 space-y-2">
            <div className="text-[12.5px] text-text-secondary">With sparkline</div>
            <Sparkline bars={SAMPLE_BARS} />
          </Card>
        </div>
      </Section>

      <Section title="Form primitives">
        <div className="grid grid-cols-3 gap-3 max-w-2xl">
          <Input placeholder="Plain input" />
          <Input placeholder="Invalid" invalid defaultValue="bad" />
          <Select defaultValue="">
            <option value="">Pick one…</option>
            <option value="a">Alpha</option>
            <option value="b">Beta</option>
          </Select>
        </div>
        <Row>
          <Switch checked={switchOn} onCheckedChange={setSwitchOn} label="Watch builds" />
          <Switch checked={!switchOn} onCheckedChange={(v) => setSwitchOn(!v)} label="Strict mode" />
          <Switch checked disabled label="Disabled (on)" />
        </Row>
      </Section>

      <Section title="Tabs">
        <Tabs items={TAB_ITEMS} value={tab} onChange={setTab} />
        <div className="mt-3 text-[12.5px] text-text-muted">
          Active tab: <code className="font-mono">{tab}</code>
        </div>
      </Section>

      <Section title="FilterPill">
        <Row>
          <FilterPill label="Status:" value="Running" />
          <FilterPill
            label="Branch:"
            value={filterActive ? 'main' : undefined}
            active={filterActive}
            onClick={() => setFilterActive((v) => !v)}
          />
          <FilterPill label="Lane:" />
        </Row>
      </Section>

      <Section title="Kbd">
        <Row>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
          <span className="text-[12.5px] text-text-muted">+</span>
          <Kbd>Enter</Kbd>
          <span className="text-[12.5px] text-text-muted">·</span>
          <Kbd>?</Kbd>
        </Row>
      </Section>

      <Section title="Sparkline">
        <div className="w-64">
          <Sparkline bars={SAMPLE_BARS} />
        </div>
        <div className="w-96">
          <Sparkline
            bars={Array.from({ length: 8 }, (_, i) => ({
              status: i % 2 === 0 ? 'success' : 'pending',
            }))}
            slots={30}
            height={28}
          />
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <section className="space-y-3">
      <h2 className="text-[11px] uppercase tracking-wider text-text-muted font-semibold">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Row({ children }: { children: React.ReactNode }): JSX.Element {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

function Dot({ label }: { label: 'success' | 'failed' | 'running' | 'pending' | 'cancel' | 'skipped' }): JSX.Element {
  return (
    <div className="inline-flex items-center gap-2">
      <StatusDot variant={label} />
      <span className="text-[12.5px] text-text-secondary capitalize">{label}</span>
    </div>
  );
}
