import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import type { PrSummary } from '@buildpilot/shared-types';
import { PrSummaryCard } from './PrSummaryCard';

// PrSummaryCard calls `api.buildPrContext(buildId)` on mount, which fetches
// `/api/builds/:id/pr-context`. We swap window.fetch for a deterministic
// payload per-story.
interface MockResponse {
  prs: PrSummary[];
  provider: string | null;
  repo: string | null;
  error?: number;
}

function useFetchMock(resp: MockResponse): void {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/pr-context')) {
        if (resp.error) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: 'mocked failure' }), {
              status: resp.error,
            }),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              sha: 'abc1234',
              provider: resp.provider,
              repo: resp.repo,
              prs: resp.prs,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
        );
      }
      return Promise.resolve(new Response('{}', { status: 200 }));
    }) as typeof window.fetch;
    return () => {
      window.fetch = original;
    };
  }, [resp]);
}

function Demo(props: MockResponse) {
  useFetchMock(props);
  return (
    <div style={{ width: 760, background: '#020617' }} className="dark">
      <PrSummaryCard buildId="story-build" />
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'Build/PrSummaryCard',
  component: Demo,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Demo>;

const SAMPLE_PR: PrSummary = {
  number: 42,
  title: 'feat(storybook): add component library stories',
  state: 'open',
  url: 'https://github.com/example/repo/pull/42',
  authorLogin: 'octocat',
  headBranch: 'feature/storybook',
  baseBranch: 'main',
  labels: ['ui', 'phase-12'],
  linkedIssues: [37, 38],
};

export const WithOpenPr: Story = {
  args: {
    prs: [SAMPLE_PR],
    provider: 'github',
    repo: 'example/repo',
  },
};

export const WithMergedPr: Story = {
  args: {
    prs: [
      { ...SAMPLE_PR, state: 'merged', title: 'fix: roll back broken icon set' },
    ],
    provider: 'github',
    repo: 'example/repo',
  },
};

export const MultiplePrs: Story = {
  args: {
    prs: [
      SAMPLE_PR,
      {
        ...SAMPLE_PR,
        number: 43,
        title: 'chore: bump deps',
        state: 'closed',
        labels: ['chore'],
        linkedIssues: [],
      },
    ],
    provider: 'github',
    repo: 'example/repo',
  },
};

// "No PR for this commit" hint — provider is set but the list is empty.
export const NoPrForCommit: Story = {
  args: { prs: [], provider: 'gitlab', repo: 'group/project' },
};

// Project has no VCS link configured — component returns null. Documented
// here so reviewers know that's intentional.
export const NotConfigured: Story = {
  args: { prs: [], provider: null, repo: null },
};
