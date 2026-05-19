import type { Meta, StoryObj } from '@storybook/react';
import type { Build, Pipeline, ProjectSummary } from '@buildpilot/shared-types';
import { CommandPalette } from './CommandPalette';
import { useStore } from '../store/store';

// CommandPalette is gated on `state.paletteOpen` from the Zustand store
// and reads projects / pipelines / builds for fuzzy results. We seed all
// of that before each story so the open dialog renders deterministic
// content.
function seed({
  projects = [],
  pipelines = [],
  builds = [],
  recents = [],
}: {
  projects?: ProjectSummary[];
  pipelines?: Pipeline[];
  builds?: Build[];
  recents?: Array<{ kind: 'project' | 'pipeline' | 'build'; id: string; label: string; at: number }>;
}): void {
  useStore.setState({
    paletteOpen: true,
    projects,
    pipelines,
    builds,
    recents,
  });
}

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
  {
    id: 'p2',
    name: 'unity-game',
    path: '/Users/sample/unity-game',
    defaultBranch: 'develop',
    createdAt: Date.now(),
    watchedBranches: ['develop'],
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
  },
];

const meta: Meta<typeof CommandPalette> = {
  title: 'Navigation/CommandPalette',
  component: CommandPalette,
  parameters: { layout: 'fullscreen' },
  args: {
    onAddProject: () => {},
    onManageHosts: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof CommandPalette>;

export const EmptyQuery: Story = {
  render: (args) => {
    seed({ projects: PROJECTS, pipelines: PIPELINES });
    return <CommandPalette {...args} />;
  },
};

export const WithRecents: Story = {
  render: (args) => {
    seed({
      projects: PROJECTS,
      pipelines: PIPELINES,
      recents: [
        { kind: 'project', id: 'p1', label: 'buildpilot', at: Date.now() },
        { kind: 'pipeline', id: 'pl1', label: 'CI · web', at: Date.now() - 1000 },
        { kind: 'build', id: 'b1', label: '#b1 main', at: Date.now() - 2000 },
      ],
    });
    return <CommandPalette {...args} />;
  },
};

export const NoProjects: Story = {
  render: (args) => {
    seed({});
    return <CommandPalette {...args} />;
  },
};
