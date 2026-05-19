import type { Meta, StoryObj } from '@storybook/react';
import { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { useStore } from '../store/store';
import type { Pipeline, ProjectSummary } from '@buildpilot/shared-types';

// Sidebar pulls everything from the Zustand store. Rather than wire up the
// real API, each story uses `useStore.setState({...})` inside a tiny render
// shim to seed deterministic data per case. We reset to a minimal known
// state on mount so stories don't bleed into one another when reviewers
// click between them.
function seedStore(patch: Partial<ReturnType<typeof useStore.getState>>): void {
  // Wipe localStorage keys the Sidebar reads at mount time so collapsed /
  // width preferences from the previous story don't carry over.
  try {
    localStorage.removeItem('buildpilot.sidebar.collapsed');
    localStorage.removeItem('buildpilot.sidebar.width');
  } catch {
    /* ignore */
  }
  useStore.setState({
    projects: [],
    pipelines: [],
    builds: [],
    favorites: { projectIds: [], pipelineIds: [] },
    recents: [],
    view: { type: 'home' },
    theme: 'dark',
    ...patch,
  });
}

const SAMPLE_PROJECTS: ProjectSummary[] = [
  {
    id: 'p1',
    name: 'buildpilot',
    path: '/Users/sample/buildpilot',
    defaultBranch: 'main',
    createdAt: Date.now(),
    watchedBranches: ['main'],
    lastBuildSha: 'abc1234',
    lastBuildAt: Date.now(),
  },
  {
    id: 'p2',
    name: 'unity-game',
    path: '/Users/sample/unity-game',
    defaultBranch: 'develop',
    createdAt: Date.now(),
    watchedBranches: ['develop', 'release/*'],
    lastBuildSha: 'def5678',
    lastBuildAt: Date.now(),
  },
];

const SAMPLE_PIPELINES: Pipeline[] = [
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
  },
  {
    id: 'pl2',
    projectId: 'p2',
    name: 'iOS Build',
    watch: { branch: 'develop', intervalSec: 120, autoTrigger: 'pullAndBuild' },
    nodes: [],
    edges: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastBuiltSha: null,
    matrix: null,
  },
];

const meta: Meta<typeof Sidebar> = {
  title: 'Navigation/Sidebar',
  component: Sidebar,
  parameters: {
    // Sidebar is full-height — use a fixed wrapper so the canvas gives it
    // room to breathe.
    layout: 'fullscreen',
  },
  args: {
    onAddProject: () => {},
    onShowChangelog: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ display: 'flex', height: '600px', background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Sidebar>;

export const EmptyState: Story = {
  render: (args) => {
    // Empty projects list — shows the "click + to add" hint.
    seedStore({});
    return <Sidebar {...args} />;
  },
};

export const WithProjects: Story = {
  render: (args) => {
    seedStore({
      projects: SAMPLE_PROJECTS,
      pipelines: SAMPLE_PIPELINES,
    });
    return <Sidebar {...args} />;
  },
};

export const WithFavorites: Story = {
  render: (args) => {
    seedStore({
      projects: SAMPLE_PROJECTS,
      pipelines: SAMPLE_PIPELINES,
      favorites: { projectIds: ['p1'], pipelineIds: ['pl2'] },
      recents: [
        { kind: 'build', id: 'b-001', label: '#b-001 main', at: Date.now() },
        { kind: 'pipeline', id: 'pl2', label: 'iOS Build', at: Date.now() },
      ],
    });
    return <Sidebar {...args} />;
  },
};

export const Collapsed: Story = {
  render: (args) => {
    // The collapsed state lives in localStorage — set it before render so
    // the component's useState initialiser picks it up.
    try {
      localStorage.setItem('buildpilot.sidebar.collapsed', '1');
    } catch {
      /* ignore */
    }
    useStore.setState({
      projects: SAMPLE_PROJECTS,
      pipelines: SAMPLE_PIPELINES,
      favorites: { projectIds: [], pipelineIds: [] },
      recents: [],
      view: { type: 'home' },
      theme: 'dark',
    });
    return <Sidebar {...args} />;
  },
};

export const MobileDrawer: Story = {
  parameters: {
    viewport: { defaultViewport: 'mobile1' },
  },
  args: {
    mobileOpen: true,
    onMobileClose: () => {},
  },
  render: (args) => {
    seedStore({
      projects: SAMPLE_PROJECTS,
      pipelines: SAMPLE_PIPELINES,
    });
    // Drop a state-reset on unmount so subsequent stories don't see the
    // mobile-only configuration linger.
    const Inner = () => {
      useEffect(() => () => seedStore({}), []);
      return <Sidebar {...args} />;
    };
    return <Inner />;
  },
};
