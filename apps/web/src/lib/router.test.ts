import { describe, expect, it } from 'vitest';
import { pathToView, viewToPath, viewsEqual } from './router';
import type { View } from '../store/store';

describe('router', () => {
  describe('viewToPath / pathToView round-trip', () => {
    const cases: View[] = [
      { type: 'home' },
      { type: 'projects' },
      { type: 'pipeline', id: 'pl-9' },
      { type: 'builds' },
      { type: 'build', id: 'build-1' },
      { type: 'settings' },
      { type: 'diskUsage' },
      { type: 'hosts' },
      { type: 'testReport', buildId: 'b-7' },
      { type: 'trends' },
      { type: 'trends', pipelineId: 'p-1' },
      { type: 'flakyTests', pipelineId: 'p-2' },
      { type: 'login' },
      { type: 'users' },
      { type: 'account' },
      { type: 'audit' },
      { type: 'apiTokens' },
      { type: 'secrets' },
      { type: 'secrets', name: 'AWS_KEY' },
      { type: 'vaultFiles' },
      { type: 'vcsCredentials' },
      { type: 'approvals' },
    ];
    for (const v of cases) {
      it(`${v.type} round-trips through viewToPath/pathToView`, () => {
        const path = viewToPath(v);
        const reparsed = pathToView(path);
        expect(viewsEqual(v, reparsed)).toBe(true);
      });
    }
  });

  it('decodes URL-encoded pipeline ids', () => {
    const path = viewToPath({ type: 'pipeline', id: 'space/path' });
    expect(path).toBe('/pipelines/space%2Fpath');
    const back = pathToView(path);
    expect(back).toEqual({ type: 'pipeline', id: 'space/path' });
  });

  it('falls back to projects list for legacy /projects/:id URLs', () => {
    // Faz 4 — `project` view type removed. Old shareable links to a
    // project detail page now land users on the projects list.
    expect(pathToView('/projects/anything')).toEqual({ type: 'projects' });
  });

  it('strips trailing slashes', () => {
    expect(pathToView('/projects/')).toEqual({ type: 'projects' });
  });

  it('falls back to home for unknown paths', () => {
    expect(pathToView('/totally-unknown')).toEqual({ type: 'home' });
  });

  it('parses secrets query name', () => {
    expect(pathToView('/secrets?name=API_KEY')).toEqual({
      type: 'secrets',
      name: 'API_KEY',
    });
  });

  it('test report route wins over plain build', () => {
    expect(pathToView('/builds/abc/tests')).toEqual({
      type: 'testReport',
      buildId: 'abc',
    });
  });
});
