import type { Meta, StoryObj } from '@storybook/react';
import type { BuildLogEntry } from '@buildpilot/shared-types';
import { FailureSummaryCard } from './FailureSummaryCard';

function entry(
  seq: number,
  level: BuildLogEntry['level'],
  message: string,
  nodeId: string | null = 'node-test',
): BuildLogEntry {
  return {
    seq,
    ts: Date.UTC(2025, 0, 1, 12, 0, seq),
    level,
    nodeId,
    stepType: nodeId ? 'shell' : null,
    message,
  };
}

const LOG_WITH_FAILURE: BuildLogEntry[] = [
  entry(1, 'info', 'Step starting'),
  entry(2, 'stdout', '$ pnpm test'),
  entry(3, 'stdout', '  Test Suites: 4 passed'),
  entry(4, 'stderr', 'WARN deprecated foo@1.0.0'),
  entry(5, 'stdout', '  FAIL src/server.test.ts'),
  entry(6, 'failure', "ReferenceError: handler is not defined"),
];

const LOG_WITH_AI_FIX: BuildLogEntry[] = [
  entry(1, 'info', 'Step starting'),
  entry(2, 'stdout', '$ pnpm test'),
  entry(3, 'stdout', '  FAIL — TypeError: cannot read property of undefined'),
  entry(4, 'system', 'Invoking AI fix for failing step'),
  entry(5, 'system', 'AI fix patched 2 lines in src/handler.ts'),
  entry(6, 'system', 'Retry after AI fix'),
  entry(7, 'failure', 'AI fix retry also failed — manual intervention required'),
];

const meta: Meta<typeof FailureSummaryCard> = {
  title: 'Build/FailureSummaryCard',
  component: FailureSummaryCard,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 800, background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FailureSummaryCard>;

export const SingleFailure: Story = {
  args: {
    entries: LOG_WITH_FAILURE,
    nodeLabel: () => 'test · pnpm test',
    onRetry: () => {},
  },
};

export const WithAiAutoFix: Story = {
  args: {
    entries: LOG_WITH_AI_FIX,
    nodeLabel: () => 'test · pnpm test',
    onRetry: () => {},
  },
};

// When no failure entries are present the component returns null. We still
// register this story to document the empty case — Storybook will render
// nothing, which is intentional.
export const NoFailure: Story = {
  args: {
    entries: [entry(1, 'success', 'all good')],
  },
};
