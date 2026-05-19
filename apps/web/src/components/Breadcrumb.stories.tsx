import type { Meta, StoryObj } from '@storybook/react';
import type { Build, Pipeline, ProjectSummary } from '@buildpilot/shared-types';
import { Breadcrumb } from './Breadcrumb';
import { useStore } from '../store/store';

// Breadcrumb derives its label trail from the current `view` plus the
// projects / pipelines / builds collections in the store. Each story seeds
// a different view so reviewers can see how the trail unfolds.

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
  },
];

const BUILDS: Build[] = [
  {
    id: 'b-deadbeef-cafe',
    pipelineId: 'pl1',
    projectId: 'p1',
    triggerSha: 'abc1234',
    triggerBranch: 'main',
    status: 'success',
    startedAt: Date.now() - 1000,
    finishedAt: Date.now(),
    log: '',
    parentBuildId: null,
    matrixValues: null,
    matrixLabel: null,
  },
];

function seed(view: ReturnType<typeof useStore.getState>['view']): void {
  useStore.setState({
    projects: PROJECTS,
    pipelines: PIPELINES,
    builds: BUILDS,
    view,
  });
}

const meta: Meta<typeof Breadcrumb> = {
  title: 'Navigation/Breadcrumb',
  component: Breadcrumb,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ width: 720, background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Breadcrumb>;

export const Projects: Story = {
  render: () => {
    seed({ type: 'projects' });
    return <Breadcrumb />;
  },
};

export const ProjectView: Story = {
  render: () => {
    seed({ type: 'project', id: 'p1' });
    return <Breadcrumb />;
  },
};

export const PipelineView: Story = {
  render: () => {
    seed({ type: 'pipeline', id: 'pl1' });
    return <Breadcrumb />;
  },
};

export const BuildView: Story = {
  render: () => {
    seed({ type: 'build', id: 'b-deadbeef-cafe' });
    return <Breadcrumb />;
  },
};

export const WithMobileMenu: Story = {
  render: () => {
    seed({ type: 'pipeline', id: 'pl1' });
    return <Breadcrumb onOpenMobileNav={() => {}} />;
  },
};
