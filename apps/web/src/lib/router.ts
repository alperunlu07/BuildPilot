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
    case 'hosts':
      return '/hosts';
    case 'testReport':
      return `/builds/${encodeURIComponent(view.buildId)}/tests`;
    case 'trends':
      return view.pipelineId
        ? `/trends?pipelineId=${encodeURIComponent(view.pipelineId)}`
        : '/trends';
    case 'flakyTests':
      return view.pipelineId
        ? `/flaky-tests?pipelineId=${encodeURIComponent(view.pipelineId)}`
        : '/flaky-tests';
    case 'login':
      return '/login';
    case 'users':
      return '/users';
    case 'account':
      return '/account';
    case 'audit':
      return '/audit';
    case 'apiTokens':
      return '/api-tokens';
    case 'secrets':
      return view.name
        ? `/secrets?name=${encodeURIComponent(view.name)}`
        : '/secrets';
    case 'vaultFiles':
      return '/vault-files';
    case 'vcsCredentials':
      return '/vcs-credentials';
    case 'approvals':
      return '/approvals';
    case 'queue':
      return '/queue';
  }
}

export function pathToView(path: string): View {
  const [pathOnly, queryString = ''] = path.split('#')[0]!.split('?');
  const clean = pathOnly!.replace(/\/+$/, '') || '/';
  const qs = new URLSearchParams(queryString ?? '');
  if (clean === '/' || clean === '') return { type: 'home' };
  if (clean === '/projects') return { type: 'projects' };
  if (clean === '/builds') return { type: 'builds' };
  if (clean === '/settings') return { type: 'settings' };
  if (clean === '/disk-usage') return { type: 'diskUsage' };
  if (clean === '/hosts') return { type: 'hosts' };
  if (clean === '/vcs-credentials') return { type: 'vcsCredentials' };
  if (clean === '/flaky-tests') {
    const pid = qs.get('pipelineId');
    return pid ? { type: 'flakyTests', pipelineId: pid } : { type: 'flakyTests' };
  }
  if (clean === '/trends') {
    const pid = qs.get('pipelineId');
    return pid ? { type: 'trends', pipelineId: pid } : { type: 'trends' };
  }
  if (clean === '/login') return { type: 'login' };
  if (clean === '/users') return { type: 'users' };
  if (clean === '/account') return { type: 'account' };
  if (clean === '/audit') return { type: 'audit' };
  if (clean === '/api-tokens') return { type: 'apiTokens' };
  if (clean === '/secrets') {
    const name = qs.get('name');
    return name ? { type: 'secrets', name } : { type: 'secrets' };
  }
  if (clean === '/vault-files') return { type: 'vaultFiles' };
  if (clean === '/approvals') return { type: 'approvals' };
  if (clean === '/queue') return { type: 'queue' };

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
  if (a.type === 'trends' && b.type === 'trends') return a.pipelineId === b.pipelineId;
  if (a.type === 'flakyTests' && b.type === 'flakyTests') return a.pipelineId === b.pipelineId;
  if (a.type === 'secrets' && b.type === 'secrets') return a.name === b.name;
  return true;
}
