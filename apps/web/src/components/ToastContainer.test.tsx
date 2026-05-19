import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ToastContainer } from './ToastContainer';
import { useStore } from '../store/store';

describe('ToastContainer', () => {
  beforeEach(() => {
    useStore.setState({
      toasts: [
        {
          id: 't1',
          projectId: 'p1',
          pipelineId: 'pl1',
          branch: 'main',
          createdAt: Date.now(),
          commits: [
            {
              sha: 'a'.repeat(40),
              shortSha: 'aaaaaaa',
              parents: [],
              author: 'tester',
              email: 't@example.com',
              date: 0,
              subject: 'fix: typo',
              body: '',
            },
          ],
        },
      ],
      // @ts-expect-error — fields beyond the renderer's use are skipped here.
      projects: [{ id: 'p1', name: 'Demo Project', path: '/' }],
      // @ts-expect-error — same
      pipelines: [{ id: 'pl1', name: 'Release', projectId: 'p1' }],
    });
  });

  it('renders a toast with project + branch', () => {
    render(<ToastContainer />);
    expect(screen.getByText('Demo Project')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('fix: typo')).toBeInTheDocument();
  });

  it('clicking dismiss removes the toast from the store', async () => {
    const { container } = render(<ToastContainer />);
    await userEvent.click(screen.getByLabelText(/Dismiss new-commit toast/i));
    expect(useStore.getState().toasts).toHaveLength(0);
    // After re-render the container empties out.
    expect(container.querySelector('[role]')).toBeNull();
  });
});
