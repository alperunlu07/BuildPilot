import { ChevronRight } from 'lucide-react';
import { useStore } from '../store/store';
import { useTranslation } from 'react-i18next';

export function Breadcrumb() {
  const view = useStore((s) => s.view);
  const projects = useStore((s) => s.projects);
  const pipelines = useStore((s) => s.pipelines);
  const builds = useStore((s) => s.builds);
  const setView = useStore((s) => s.setView);
  const { t } = useTranslation();

  // Home renders its own header; skip the breadcrumb on the landing view to
  // keep the dashboard above-the-fold density.
  if (view.type === 'home') return null;

  type Crumb = { label: string; onClick?: () => void };
  const crumbs: Crumb[] = [{ label: t('breadcrumbs.home'), onClick: () => setView({ type: 'home' }) }];

  switch (view.type) {
    case 'projects':
      crumbs.push({ label: t('breadcrumbs.projects') });
      break;
    case 'project': {
      const p = projects.find((x) => x.id === view.id);
      crumbs.push({ label: t('breadcrumbs.projects'), onClick: () => setView({ type: 'projects' }) });
      crumbs.push({ label: p ? p.name : `${t('breadcrumbs.project')} ${view.id.slice(0, 7)}` });
      break;
    }
    case 'pipeline': {
      const pl = pipelines.find((x) => x.id === view.id);
      const proj = pl ? projects.find((p) => p.id === pl.projectId) : undefined;
      if (proj) {
        crumbs.push({ label: proj.name, onClick: () => setView({ type: 'project', id: proj.id }) });
      }
      crumbs.push({ label: pl ? pl.name : `${t('breadcrumbs.pipeline')} ${view.id.slice(0, 7)}` });
      break;
    }
    case 'builds':
      crumbs.push({ label: t('breadcrumbs.builds') });
      break;
    case 'build': {
      const b = builds.find((x) => x.id === view.id);
      const pl = b ? pipelines.find((x) => x.id === b.pipelineId) : undefined;
      const proj = pl ? projects.find((p) => p.id === pl.projectId) : undefined;
      crumbs.push({ label: t('breadcrumbs.builds'), onClick: () => setView({ type: 'builds' }) });
      if (proj) crumbs.push({ label: proj.name, onClick: () => setView({ type: 'project', id: proj.id }) });
      if (pl) crumbs.push({ label: pl.name, onClick: () => setView({ type: 'pipeline', id: pl.id }) });
      crumbs.push({ label: `#${view.id.slice(0, 7)}` });
      break;
    }
    case 'settings':
      crumbs.push({ label: t('breadcrumbs.settings') });
      break;
    case 'diskUsage':
      crumbs.push({ label: t('breadcrumbs.diskUsage') });
      break;
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex items-center gap-1 border-b border-slate-800 bg-slate-900/60 px-4 py-2 text-xs text-slate-400"
    >
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={11} className="text-slate-600" />}
          {c.onClick ? (
            <button
              type="button"
              onClick={c.onClick}
              className="rounded px-1 py-0.5 hover:bg-slate-800 hover:text-slate-200"
            >
              {c.label}
            </button>
          ) : (
            <span className="px-1 py-0.5 text-slate-200">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
