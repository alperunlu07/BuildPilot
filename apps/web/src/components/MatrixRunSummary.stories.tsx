import type { Meta, StoryObj } from '@storybook/react';
import type { Build, BuildStatus } from '@buildpilot/shared-types';
import { MatrixRunSummary } from './MatrixRunSummary';

// Helper — fabricate a Build row with the right matrix metadata so we can
// build the 2-D grid without going through the runner.
function build(
  id: string,
  status: BuildStatus,
  matrixValues: Record<string, string> | null,
  parentBuildId: string | null = 'parent-1',
): Build {
  return {
    id,
    pipelineId: 'pl-1',
    projectId: 'p-1',
    triggerSha: 'abc1234',
    triggerBranch: 'main',
    status,
    startedAt: Date.UTC(2025, 0, 1, 12, 0, 0),
    finishedAt:
      status === 'pending' || status === 'running'
        ? null
        : Date.UTC(2025, 0, 1, 12, 5, 0),
    log: '',
    parentBuildId,
    matrixValues,
    matrixLabel: matrixValues
      ? Object.entries(matrixValues)
          .map(([k, v]) => `${k}=${v}`)
          .join(', ')
      : null,
    laneId: 'default',
  };
}

const PARENT = build('parent-1', 'running', null, null);

const meta: Meta<typeof MatrixRunSummary> = {
  title: 'Build/MatrixRunSummary',
  component: MatrixRunSummary,
  parameters: { layout: 'fullscreen' },
  args: {
    parent: PARENT,
    onOpenChild: () => {},
    onRerunFailed: () => {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 900, background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MatrixRunSummary>;

export const StillRunning: Story = {
  args: {
    children: [
      build('c1', 'success', { xcode: '15', scheme: 'Free' }),
      build('c2', 'running', { xcode: '15', scheme: 'Pro' }),
      build('c3', 'pending', { xcode: '16', scheme: 'Free' }),
      build('c4', 'pending', { xcode: '16', scheme: 'Pro' }),
    ],
  },
};

export const AllPass: Story = {
  args: {
    parent: { ...PARENT, status: 'success' },
    children: [
      build('c1', 'success', { xcode: '15', scheme: 'Free' }),
      build('c2', 'success', { xcode: '15', scheme: 'Pro' }),
      build('c3', 'success', { xcode: '16', scheme: 'Free' }),
      build('c4', 'success', { xcode: '16', scheme: 'Pro' }),
    ],
  },
};

export const PartialFail: Story = {
  args: {
    parent: { ...PARENT, status: 'failed' },
    children: [
      build('c1', 'success', { xcode: '15', scheme: 'Free' }),
      build('c2', 'failed', { xcode: '15', scheme: 'Pro' }),
      build('c3', 'success', { xcode: '16', scheme: 'Free' }),
      build('c4', 'cancelled', { xcode: '16', scheme: 'Pro' }),
    ],
  },
};

// 1-axis matrix collapses to a flat grid rather than a 2-D table.
export const SingleAxis: Story = {
  args: {
    parent: { ...PARENT, status: 'success' },
    children: [
      build('c1', 'success', { node: '18' }),
      build('c2', 'success', { node: '20' }),
      build('c3', 'failed', { node: '22' }),
    ],
  },
};
