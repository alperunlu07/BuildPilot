import type { View } from '../store/store';

// Map between the Zustand `view` discriminated union and a URL path. Kept as
// a tiny helper rather than dropping wouter <Route> components in App.tsx
// because most existing pages already consume `view` directly from the store.

export function viewToPath(view: View): string {
  switch (view.type) {
    case 'home':
      return '/';
    case 'projects':
      return '/projects';
    case 'project':
      return `/projects/${encodeURIComponent(view.id)}`;
    case 'pipeline':
      return `/pipelines/${encodeURIComponent(view.id)}`;
    case 'builds':
      return '/builds';
    case 'build':
      return `/builds/${encodeURIComponent(view.id)}`;
    case 'settings':
      return '/settings';
    case 'diskUsage':
      return '/disk-usage';
    case 'testReport':
      return `/builds/${encodeURIComponent(view.buildId)}/tests`;
  }
}

export function pathToView(path: string): View {
  const clean = path.split('?')[0]!.split('#')[0]!.replace(/\/+$/, '') || '/';
  if (clean === '/' || clean === '') return { type: 'home' };
  if (clean === '/projects') return { type: 'projects' };
  if (clean === '/builds') return { type: 'builds' };
  if (clean === '/settings') return { type: 'settings' };
  if (clean === '/disk-usage') return { type: 'diskUsage' };

  const projectMatch = clean.match(/^\/projects\/([^/]+)$/);
  if (projectMatch) return { type: 'project', id: decodeURIComponent(projectMatch[1]!) };
  const pipelineMatch = clean.match(/^\/pipelines\/([^/]+)$/);
  if (pipelineMatch) return { type: 'pipeline', id: decodeURIComponent(pipelineMatch[1]!) };
  // `/builds/:id/tests` must be checked before the generic /builds/:id.
  const testReportMatch = clean.match(/^\/builds\/([^/]+)\/tests$/);
  if (testReportMatch)
    return { type: 'testReport', buildId: decodeURIComponent(testReportMatch[1]!) };
  const buildMatch = clean.match(/^\/builds\/([^/]+)$/);
  if (buildMatch) return { type: 'build', id: decodeURIComponent(buildMatch[1]!) };
  return { type: 'home' };
}

export function viewsEqual(a: View, b: View): boolean {
  if (a.type !== b.type) return false;
  if (
    (a.type === 'project' && b.type === 'project') ||
    (a.type === 'pipeline' && b.type === 'pipeline') ||
    (a.type === 'build' && b.type === 'build')
  ) {
    return a.id === b.id;
  }
  if (a.type === 'testReport' && b.type === 'testReport') return a.buildId === b.buildId;
  return true;
}
