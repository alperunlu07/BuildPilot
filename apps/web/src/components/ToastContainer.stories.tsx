import type { Meta, StoryObj } from '@storybook/react';
import type { CommitToast } from '../store/store';
import type { Pipeline, ProjectSummary } from '@buildpilot/shared-types';
import { ToastContainer } from './ToastContainer';
import { useStore } from '../store/store';

// ToastContainer reads new-commit toasts from the Zustand store. We seed
// the state directly so the component renders without any API or SSE
// activity in the background.

const PROJECTS: ProjectSummary[] = [
  {
    id: 'p1',
    name: 'buildpilot',
    path: '/Users/sample/buildpilot',
    defaultBranch: 'main',
    createdAt: Date.now(),
    watchedBranches: ['main'],
    lastBuildSha: null,
    lastBuildAt: null,
  },
];

const PIPELINES: Pipeline[] = [
  {
    id: 'pl1',
    projectId: 'p1',
    name: 'CI · web',
    watch: { branch: 'main', intervalSec: 60, autoTrigger: 'off' },
    nodes: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastBuiltSha: null,
    matrix: null,
  laneId: 'default',
  priority: 100,
  },
];

function seed(toasts: CommitToast[]): void {
  useStore.setState({
    projects: PROJECTS,
    pipelines: PIPELINES,
    toasts,
  });
}

const SINGLE: CommitToast = {
  id: 'toast-1',
  projectId: 'p1',
  pipelineId: 'pl1',
  branch: 'main',
  createdAt: Date.now(),
  commits: [
    {
      sha: 'abc1234deadbeef',
      shortSha: 'abc1234',
      parents: ['00000000'],
      author: 'Alice',
      email: 'alice@example.com',
      date: Date.now(),
      subject: 'feat: add storybook stories for component library',
      body: '',
    },
  ],
};

const meta: Meta<typeof ToastContainer> = {
  title: 'Notifications/ToastContainer',
  component: ToastContainer,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ width: 480, height: 480, background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ToastContainer>;

export const SingleNewCommit: Story = {
  render: () => {
    seed([SINGLE]);
    return <ToastContainer />;
  },
};

export const MultipleCommits: Story = {
  render: () => {
    seed([
      {
        ...SINGLE,
        commits: Array.from({ length: 6 }).map((_, i) => ({
          sha: `c${i}xxxxxxxxxxxxxxxxx`,
          shortSha: `c${i}xxx`,
          parents: [],
          author: 'Alice',
          email: 'alice@example.com',
          date: Date.now() - i * 5000,
          subject: `chore: commit ${i + 1}`,
          body: '',
        })),
      },
    ]);
    return <ToastContainer />;
  },
};

export const ManyCommitsTruncated: Story = {
  render: () => {
    seed([
      {
        ...SINGLE,
        commits: Array.from({ length: 14 }).map((_, i) => ({
          sha: `c${i}xxxxxxxxxxxxxxxxx`,
          shortSha: `c${i}xxx`,
          parents: [],
          author: 'Alice',
          email: 'alice@example.com',
          date: Date.now() - i * 5000,
          subject: `chore: commit ${i + 1}`,
          body: '',
        })),
      },
    ]);
    return <ToastContainer />;
  },
};

// No toasts → component returns null. Documented as the empty state.
export const Empty: Story = {
  render: () => {
    seed([]);
    return <ToastContainer />;
  },
};
