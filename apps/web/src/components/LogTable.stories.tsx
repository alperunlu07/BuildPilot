import type { Meta, StoryObj } from '@storybook/react';
import type { BuildLogEntry } from '@buildpilot/shared-types';
import { LogTable } from './LogTable';

// LogTable virtualizes via react-window, which needs a measured height.
// We wrap every story in a fixed-height container so the FixedSizeList
// can mount and render rows.

function entry(
  seq: number,
  level: BuildLogEntry['level'],
  message: string,
  nodeId: string | null = 'node-shell',
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

const POPULATED: BuildLogEntry[] = [
  entry(1, 'system', 'Build started · sha=abc1234 branch=main', null),
  entry(2, 'info', 'Step shell starting'),
  entry(3, 'stdout', '$ pnpm install'),
  entry(4, 'stdout', 'Packages: +124'),
  entry(5, 'stdout', '+++++++++++++++++++++'),
  entry(6, 'stdout', 'Done in 4.1s'),
  entry(7, 'info', 'Step shell starting'),
  entry(8, 'stdout', '$ pnpm test'),
  entry(9, 'stderr', 'WARN deprecated foo@1.0.0'),
  entry(10, 'stdout', 'Test Suites: 3 passed, 3 total'),
  entry(11, 'success', 'shell finished in 12.3s'),
  entry(12, 'failure', 'No tests matching pattern src/**/*.bug.test.ts'),
  entry(13, 'system', 'Build finished · status=failed', null),
];

// ANSI sample exercises the renderer's SGR code path. Each \x1b[...m turns
// a colour on/off; LogTable's AnsiMessage component should colour each
// span separately.
const ANSI: BuildLogEntry[] = [
  entry(1, 'stdout', '\x1b[32m✓\x1b[0m passed checkout'),
  entry(2, 'stdout', '\x1b[31m✗\x1b[0m failed lint'),
  entry(3, 'stdout', '\x1b[33mWARN\x1b[0m: bundle size is over budget'),
  entry(4, 'stdout', '\x1b[36mINFO\x1b[0m: compiled in \x1b[1m2.4s\x1b[0m'),
  entry(5, 'stdout', '\x1b[35mTRACE\x1b[0m: \x1b[34mhandler\x1b[0m \x1b[37mreturned 200\x1b[0m'),
];

const meta: Meta<typeof LogTable> = {
  title: 'Build/LogTable',
  component: LogTable,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => (
      <div style={{ width: 720, height: 420, background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof LogTable>;

export const Empty: Story = {
  args: {
    entries: [],
    emptyMessage: 'Waiting for output…',
  },
};

export const Populated: Story = {
  args: {
    entries: POPULATED,
    follow: false,
  },
};

export const WithAnsiColors: Story = {
  args: {
    entries: ANSI,
    follow: false,
  },
};
