import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { BuildLogEntry } from '@buildpilot/shared-types';
import { StepGantt } from './StepGantt';

function mk(
  seq: number,
  ts: number,
  level: BuildLogEntry['level'],
  nodeId: string,
): BuildLogEntry {
  return { seq, ts, level, nodeId, stepType: 'shell', message: '' };
}

describe('StepGantt', () => {
  it('renders one bar per distinct nodeId, in start-time order', () => {
    const entries = [
      mk(1, 1000, 'info', 'a'),
      mk(2, 1500, 'success', 'a'),
      mk(3, 2000, 'info', 'b'),
      mk(4, 4000, 'failure', 'b'),
    ];
    render(<StepGantt entries={entries} startedAt={0} finishedAt={5000} />);
    // 2 bars rendered — each is a button. There's no other button in the
    // gantt panel besides the per-span bars.
    const bars = screen.getAllByRole('button');
    expect(bars).toHaveLength(2);
    // First bar precedes the second in DOM order.
    expect(bars[0]!.getAttribute('aria-label')).toMatch(/success/);
    expect(bars[1]!.getAttribute('aria-label')).toMatch(/failed/);
  });

  it('renders nothing when there are no entries with a nodeId', () => {
    const { container } = render(<StepGantt entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
