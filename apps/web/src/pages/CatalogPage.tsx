import { useMemo, useState } from 'react';
import {
  Apple,
  ArrowDownToLine,
  BadgeCheck,
  Ban,
  Box,
  Boxes,
  Bug,
  Check,
  CloudUpload,
  CodeXml,
  FileCog,
  Frame,
  Gamepad2,
  Gauge,
  GitBranch,
  GitMerge,
  Globe,
  Hash,
  KeyRound,
  ListChecks,
  MessageCircle,
  MessageSquare,
  Microscope,
  Package,
  PenTool,
  Percent,
  PlaneTakeoff,
  Plus,
  ScrollText,
  Search,
  Send,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stamp,
  Terminal,
  Upload,
  Wand2,
  Wrench,
  AlignLeft,
  Camera,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  STEP_CATEGORIES,
  STEP_DEFINITIONS,
  STEP_TYPES,
  getStepCategory,
  type StepCategory,
} from '@buildpilot/step-registry';
import type { StepType } from '@buildpilot/shared-types';
import { useStore } from '../store/store';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';

// UI v2 Faz 8 — Step Catalog. Reference of every registered step type
// (83+), browseable by category + searchable, with a detail panel that
// shows the field schema + a sample JSON snippet. Click "Insert into
// pipeline" to hand the user back to the editor with the step pre-
// selected on the palette.

const ICONS: Record<string, LucideIcon> = {
  GitBranch,
  GitMerge,
  ArrowDownToLine,
  Terminal,
  Gamepad2,
  Globe,
  MessageSquare,
  MessageCircle,
  Sparkles,
  Package,
  Send,
  Server,
  Apple,
  CloudUpload,
  Upload,
  PlaneTakeoff,
  KeyRound,
  BadgeCheck,
  ShieldAlert,
  ShieldCheck,
  Stamp,
  Wand2,
  Wrench,
  Box,
  Boxes,
  Bug,
  ListChecks,
  Plus,
  Hash,
  ScrollText,
  FileCog,
  CodeXml,
  AlignLeft,
  Microscope,
  Search,
  Percent,
  Gauge,
  PenTool,
  Camera,
  Frame,
};

const CATEGORY_LABEL: Record<StepCategory, string> = {
  git: 'Git',
  build: 'Build',
  workflow: 'Workflow',
  notify: 'Notify',
  upload: 'Upload',
  remote: 'Remote',
  iosBuild: 'iOS Build',
  iosSigning: 'iOS Signing',
  iosDistribute: 'iOS Distribute',
  iosVersioning: 'iOS Versioning',
  iosQuality: 'iOS Quality',
  iosScreenshots: 'iOS Screenshots',
  iosTest: 'iOS Test',
  iosVerify: 'iOS Verify',
  android: 'Android',
  ccd: 'Unity CCD',
  steam: 'Steam',
};

export function CatalogPage() {
  const pipelines = useStore((s) => s.pipelines);
  const setView = useStore((s) => s.setView);

  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<StepCategory | 'all'>('all');
  const [selectedType, setSelectedType] = useState<StepType | null>(null);

  // Build a map of step type → how many pipelines reference it. This
  // approximates "Used in N pipelines" by inspecting saved nodes. Useful
  // when a step is rarely / never used.
  const usageByType = useMemo(() => {
    const m = new Map<StepType, number>();
    for (const pl of pipelines) {
      const seen = new Set<StepType>();
      const nodes = (pl as unknown as { nodes?: { type?: string }[] }).nodes ?? [];
      for (const n of nodes) {
        if (n.type && n.type in STEP_DEFINITIONS) {
          seen.add(n.type as StepType);
        }
      }
      for (const t of seen) m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  }, [pipelines]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (type: StepType): boolean => {
      const def = STEP_DEFINITIONS[type];
      if (!def) return false;
      if (q !== '') {
        const hay = `${def.label} ${def.description} ${type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (activeCategory !== 'all') {
        if (getStepCategory(type) !== activeCategory) return false;
      }
      return true;
    };
    return STEP_TYPES.filter(matches);
  }, [query, activeCategory]);

  const selectedDef = selectedType ? STEP_DEFINITIONS[selectedType] : null;
  const selectedCategory = selectedType ? getStepCategory(selectedType) : null;

  function insertIntoEditor(type: StepType) {
    // Pragmatic: navigate to the first pipeline and rely on the palette
    // search to surface the step. A future enhancement could pre-fill
    // the editor's palette search via URL state.
    const first = pipelines[0];
    if (first) {
      try {
        sessionStorage.setItem('buildpilot.catalog.pendingInsert', type);
      } catch {
        /* ignore */
      }
      setView({ type: 'pipeline', id: first.id });
    }
  }

  return (
    <div className="grid h-full min-h-0" style={{ gridTemplateColumns: 'minmax(0, 1fr) 380px' }}>
      {/* Left — catalog grid */}
      <div className="overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-6">
        <div className="mb-5">
          <h1 className="text-xl font-semibold text-text-primary tracking-tight">
            Step Catalog
          </h1>
          <p className="mt-1 text-[12.5px] text-text-muted">
            Every step type BuildPilot knows about. Use it as a reference, or click "Insert"
            to drop one onto your pipeline.
          </p>
        </div>

        {/* Category chip filter */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <button
            type="button"
            onClick={() => setActiveCategory('all')}
            className={chipClass(activeCategory === 'all')}
          >
            All
            <span className="ml-1 font-mono text-text-faint">{STEP_TYPES.length}</span>
          </button>
          {STEP_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setActiveCategory(cat.key)}
              className={chipClass(activeCategory === cat.key)}
            >
              {cat.label}
              <span className="ml-1 font-mono text-text-faint">{cat.types.length}</span>
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative mb-4">
          <Search
            size={12}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-faint pointer-events-none"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search steps (label, type, description)"
            className="pl-7"
          />
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <Card className="border-dashed p-8 text-center text-[12.5px] text-text-muted">
            No steps match "{query}" in {activeCategory === 'all' ? 'any category' : CATEGORY_LABEL[activeCategory as StepCategory]}.
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {filtered.map((type) => {
              const def = STEP_DEFINITIONS[type];
              const Icon = ICONS[def.icon] ?? Terminal;
              const usage = usageByType.get(type) ?? 0;
              const cat = getStepCategory(type);
              const isSelected = selectedType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  className={`group text-left rounded-card border bg-bg-panel p-3 transition-colors ${
                    isSelected
                      ? 'border-accent bg-accent-soft/30'
                      : 'border-border-subtle hover:border-border'
                  }`}
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <span
                      className="inline-flex h-7 w-7 items-center justify-center rounded shrink-0"
                      style={{ backgroundColor: `${def.color}22`, color: def.color }}
                    >
                      <Icon size={13} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="text-[12.5px] font-medium text-text-primary truncate">
                          {def.label}
                        </span>
                      </div>
                      <div className="text-[10.5px] font-mono text-text-faint truncate">
                        {type}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11.5px] text-text-muted line-clamp-2">
                    {def.description}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10.5px]">
                    <Badge variant="neutral">{CATEGORY_LABEL[cat]}</Badge>
                    {usage > 0 ? (
                      <span className="text-text-muted">used in {usage} pipeline{usage === 1 ? '' : 's'}</span>
                    ) : (
                      <span className="text-text-faint">unused</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right — detail panel (sticky) */}
      <aside className="overflow-y-auto border-l border-border-subtle bg-bg-panel">
        {!selectedDef || !selectedType ? (
          <div className="p-6 text-[12.5px] text-text-muted text-center">
            Select a step from the grid to see its fields, sample JSON, and where it's used.
          </div>
        ) : (
          <>
            <div className="px-5 py-4 border-b border-border-subtle">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {selectedCategory && (
                      <Badge variant="neutral">{CATEGORY_LABEL[selectedCategory]}</Badge>
                    )}
                  </div>
                  <h2 className="mt-2 text-[16px] font-semibold text-text-primary tracking-tight">
                    {selectedDef.label}
                  </h2>
                  <div className="mt-0.5 font-mono text-[11px] text-text-faint">
                    {selectedType}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedType(null)}
                  className="rounded-btn p-1 text-text-muted hover:bg-bg-hover hover:text-text-primary"
                  aria-label="Close detail panel"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mt-3 text-[12.5px] text-text-muted leading-relaxed">
                {selectedDef.description}
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4 w-full"
                onClick={() => insertIntoEditor(selectedType)}
                leftIcon={<Plus size={13} />}
                disabled={pipelines.length === 0}
              >
                {pipelines.length === 0 ? 'No pipelines yet' : 'Insert into pipeline'}
              </Button>
            </div>

            {/* Fields */}
            <div className="px-5 py-4 border-b border-border-subtle">
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2">
                Fields ({selectedDef.fields.length})
              </div>
              {selectedDef.fields.length === 0 ? (
                <div className="text-[12px] text-text-faint italic">
                  No configurable fields.
                </div>
              ) : (
                <table className="w-full text-[11.5px]">
                  <thead>
                    <tr className="text-text-faint">
                      <th className="text-left font-medium pb-1.5">Key</th>
                      <th className="text-left font-medium pb-1.5">Type</th>
                      <th className="text-right font-medium pb-1.5">Required</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedDef.fields.map((f) => (
                      <tr key={f.name} className="border-t border-border-subtle">
                        <td className="py-1.5">
                          <div className="font-mono text-text-primary">{f.name}</div>
                          <div className="text-[10.5px] text-text-muted">{f.label}</div>
                        </td>
                        <td className="py-1.5 font-mono text-text-muted">{f.type}</td>
                        <td className="py-1.5 text-right">
                          {f.required ? (
                            <Check size={12} className="text-status-success inline" />
                          ) : (
                            <Ban size={12} className="text-text-faint inline" />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Sample JSON */}
            <div className="px-5 py-4">
              <div className="text-[10px] uppercase tracking-wider text-text-muted font-semibold mb-2">
                Sample data
              </div>
              <pre className="rounded-btn bg-bg-base border border-border-subtle p-3 text-[11px] font-mono text-text-secondary overflow-x-auto whitespace-pre">
{generateSampleJson(selectedType)}
              </pre>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function chipClass(active: boolean): string {
  return `inline-flex items-center px-2.5 h-6 rounded-pill text-[11.5px] border transition-colors ${
    active
      ? 'bg-accent-soft border-accent text-accent'
      : 'bg-bg-panel border-border-subtle text-text-muted hover:text-text-primary hover:border-border'
  }`;
}

function generateSampleJson(type: StepType): string {
  const def = STEP_DEFINITIONS[type];
  if (!def) return '{}';
  const sample: Record<string, unknown> = { type };
  for (const f of def.fields) {
    switch (f.type) {
      case 'text':
      case 'branchSelect':
      case 'textarea':
        sample[f.name] = f.placeholder ?? 'example';
        break;
      case 'number':
        sample[f.name] = f.defaultValue ?? 0;
        break;
      case 'select':
        sample[f.name] = f.options?.[0] ?? f.defaultValue ?? 'option';
        break;
      case 'hostSelect':
        sample[f.name] = 'host-id';
        break;
      default:
        sample[f.name] = null;
    }
  }
  return JSON.stringify(sample, null, 2);
}
