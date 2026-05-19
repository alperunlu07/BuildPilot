import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BuildLogEntry } from '@buildpilot/shared-types';
import { FailureSummaryCard } from './FailureSummaryCard';

function mk(
  seq: number,
  level: BuildLogEntry['level'],
  message: string,
  nodeId: string | null = 'node-A',
): BuildLogEntry {
  return { seq, ts: seq * 1000, level, nodeId, stepType: 'shell', message };
}

describe('FailureSummaryCard', () => {
  it('renders nothing when there is no failure entry', () => {
    const { container } = render(
      <FailureSummaryCard entries={[mk(1, 'stdout', 'hi')]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('picks the last failure entry and shows tail lines for its node', () => {
    const entries: BuildLogEntry[] = [
      mk(1, 'stdout', 'starting build'),
      mk(2, 'stdout', 'compiling main.swift'),
      mk(3, 'stdout', 'compiling util.swift'),
      mk(4, 'stderr', 'warning: deprecated API'),
      mk(5, 'failure', 'error: cannot find member', 'node-A'),
      mk(6, 'system', 'pipeline halted', null),
    ];
    render(<FailureSummaryCard entries={entries} />);

    // Failed step section appears.
    expect(screen.getByText(/Failed step/i)).toBeInTheDocument();
    // Failure message appears twice (banner + tail) — both occurrences are
    // the same string, so use getAllByText.
    expect(screen.getAllByText('error: cannot find member').length).toBeGreaterThan(0);
    // The last 5 node-A entries are shown — including the failure line itself.
    expect(screen.getByText('compiling main.swift')).toBeInTheDocument();
    expect(screen.getByText('warning: deprecated API')).toBeInTheDocument();
  });

  it('fires the retry callback with the failed nodeId', async () => {
    const onRetry = vi.fn();
    render(
      <FailureSummaryCard
        entries={[mk(1, 'failure', 'oops', 'node-B')]}
        onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /Retry/i }));
    expect(onRetry).toHaveBeenCalledWith('node-B');
  });
});
