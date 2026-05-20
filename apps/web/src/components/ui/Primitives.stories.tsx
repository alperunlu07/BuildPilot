import type { Meta, StoryObj } from '@storybook/react';
import { Plus, Save, Trash2 } from 'lucide-react';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { FilterPill } from './FilterPill';
import { Input } from './Input';
import { Kbd } from './Kbd';
import { Select } from './Select';
import { Sparkline } from './Sparkline';
import { StatusDot } from './StatusDot';
import { Switch } from './Switch';
import { Tabs } from './Tabs';

// UI v2 Faz 2 — primitive component stories. One file (`Primitives.*`)
// per Storybook entry per primitive feels redundant for components this
// small; we group them under a `UI v2 / Primitives` namespace so the
// sidebar stays scannable.

// ── Button ───────────────────────────────────────────────────────────────

const buttonMeta: Meta<typeof Button> = {
  title: 'UI v2 / Primitives / Button',
  component: Button,
  parameters: { layout: 'centered' },
};
export default buttonMeta;

export const ButtonVariants: StoryObj<typeof Button> = {
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="primary">Primary</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="danger">Danger</Button>
      <Button variant="primary" leftIcon={<Plus size={12} />}>
        With icon
      </Button>
      <Button variant="primary" loading>
        Loading
      </Button>
      <Button variant="primary" disabled>
        Disabled
      </Button>
    </div>
  ),
};

export const ButtonSizes: StoryObj<typeof Button> = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="primary">
        Small
      </Button>
      <Button size="md" variant="primary">
        Medium
      </Button>
      <Button size="lg" variant="primary">
        Large
      </Button>
      <Button size="icon" variant="secondary" aria-label="Save">
        <Save size={13} />
      </Button>
    </div>
  ),
};

// ── Badge ────────────────────────────────────────────────────────────────

export const BadgeVariants: StoryObj = {
  name: 'Badge — variants',
  render: () => (
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="success">success</Badge>
      <Badge variant="failed">failed</Badge>
      <Badge variant="running">running</Badge>
      <Badge variant="pending">pending</Badge>
      <Badge variant="accent">accent</Badge>
      <Badge variant="warn">warn</Badge>
      <Badge variant="neutral">neutral</Badge>
    </div>
  ),
};

// ── StatusDot ────────────────────────────────────────────────────────────

export const StatusDotVariants: StoryObj = {
  name: 'StatusDot — every variant',
  render: () => (
    <div className="flex items-center gap-4 text-[12px]">
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="success" /> success
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="failed" /> failed
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="running" /> running (pulses)
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="pending" /> pending
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="cancel" /> cancel
      </span>
      <span className="inline-flex items-center gap-1.5">
        <StatusDot variant="skipped" /> skipped
      </span>
    </div>
  ),
};

// ── Card ─────────────────────────────────────────────────────────────────

export const CardVariants: StoryObj = {
  name: 'Card — static + interactive',
  render: () => (
    <div className="grid grid-cols-2 gap-3 max-w-2xl">
      <Card className="p-4">
        <div className="font-medium text-text-primary">Static card</div>
        <p className="mt-1 text-[12px] text-text-muted">
          Plain panel surface. No hover state.
        </p>
      </Card>
      <Card interactive className="p-4" onClick={() => undefined}>
        <div className="font-medium text-text-primary">Interactive card</div>
        <p className="mt-1 text-[12px] text-text-muted">
          Hover for the lift + border shift.
        </p>
      </Card>
    </div>
  ),
};

// ── Input / Select / Switch ──────────────────────────────────────────────

export const FormPrimitives: StoryObj = {
  name: 'Input / Select / Switch',
  render: () => (
    <div className="space-y-3 max-w-xs">
      <label className="block text-[12px] text-text-secondary">
        Input
        <Input placeholder="e.g. claude-opus-4-7" className="mt-1" />
      </label>
      <label className="block text-[12px] text-text-secondary">
        Select
        <Select className="mt-1">
          <option>main</option>
          <option>develop</option>
          <option>feature/x</option>
        </Select>
      </label>
      <Switch checked={true} label="Telegram approvals" />
      <Switch checked={false} label="Rolling builds" />
    </div>
  ),
};

// ── Tabs ─────────────────────────────────────────────────────────────────

export const TabsExample: StoryObj = {
  name: 'Tabs — underline + counts',
  render: () => (
    <Tabs
      value="overview"
      onChange={() => undefined}
      items={[
        { id: 'overview', label: 'Overview' },
        { id: 'logs', label: 'Logs', count: 1247 },
        { id: 'tests', label: 'Tests', count: 42 },
        { id: 'annotations', label: 'Annotations' },
      ]}
    />
  ),
};

// ── FilterPill ───────────────────────────────────────────────────────────

export const FilterPillExample: StoryObj = {
  name: 'FilterPill — active vs idle',
  render: () => (
    <div className="flex items-center gap-2">
      <FilterPill label="Status:" value="Running" active />
      <FilterPill label="Project:" value="all" />
      <FilterPill label="Branch:" value="main" active />
    </div>
  ),
};

// ── Kbd ──────────────────────────────────────────────────────────────────

export const KbdExample: StoryObj = {
  name: 'Kbd — keyboard glyphs',
  render: () => (
    <div className="flex items-center gap-2 text-[12px] text-text-muted">
      Open the palette with <Kbd>⌘K</Kbd>. Confirm with <Kbd>Enter</Kbd>.
    </div>
  ),
};

// ── Sparkline ────────────────────────────────────────────────────────────

export const SparklineExample: StoryObj = {
  name: 'Sparkline — 30-bar status strip',
  render: () => {
    const bars = [
      'success', 'success', 'failed', 'success', 'success',
      'success', 'success', 'cancel', 'success', 'success',
      'success', 'success', 'success', 'failed', 'success',
      'success', 'success', 'success', 'success', 'success',
      'success', 'failed', 'success', 'success', 'success',
      'success', 'success', 'success', 'success', 'running',
    ].map((status) => ({ status: status as 'success' | 'failed' | 'cancel' | 'running' }));
    return (
      <div className="space-y-3 max-w-md">
        <Sparkline bars={bars} slots={30} height={28} />
        <Sparkline bars={bars.slice(0, 15)} slots={30} height={22} />
        <Sparkline bars={[]} slots={30} height={28} />
      </div>
    );
  },
};

// ── Trash button (compositional smoke test) ──────────────────────────────

export const ButtonComposition: StoryObj = {
  name: 'Compositions — Button + Badge + StatusDot',
  render: () => (
    <Card className="p-4 max-w-md">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <StatusDot variant="running" />
          <span className="font-medium text-text-primary truncate">
            ios-release-pipeline
          </span>
          <Badge variant="running">running</Badge>
        </div>
        <Button size="sm" variant="danger" aria-label="Cancel build">
          <Trash2 size={11} className="mr-1" /> Cancel
        </Button>
      </div>
    </Card>
  ),
};
