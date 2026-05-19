import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Breadcrumb } from './Breadcrumb';
import { useStore } from '../store/store';
import '../lib/i18n';

function resetStore(): void {
  useStore.setState({
    view: { type: 'projects' },
    projects: [
      // @ts-expect-error — store rejects unknown extra fields, but for our
      // test purposes we only need the id/name/path subset.
      { id: 'pj-1', name: 'My Game', path: '/repo/my-game' },
    ],
    pipelines: [],
    builds: [],
  });
}

describe('Breadcrumb', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders a Home → Projects trail and Home is clickable', async () => {
    render(<Breadcrumb />);
    const home = screen.getByRole('button', { name: /home/i });
    expect(home).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();

    await userEvent.click(home);
    expect(useStore.getState().view).toEqual({ type: 'home' });
  });

  it('clicking the project segment in a build view navigates to that project', async () => {
    useStore.setState({
      view: { type: 'build', id: 'b1' },
      // @ts-expect-error — see resetStore
      projects: [{ id: 'pj-1', name: 'My Game', path: '/' }],
      // @ts-expect-error — see above
      pipelines: [{ id: 'pl-1', name: 'Release', projectId: 'pj-1' }],
      // @ts-expect-error — see above
      builds: [{ id: 'b1', pipelineId: 'pl-1', status: 'success' }],
    });
    render(<Breadcrumb />);
    const projectButton = screen.getByRole('button', { name: 'My Game' });
    await userEvent.click(projectButton);
    expect(useStore.getState().view).toEqual({ type: 'project', id: 'pj-1' });
  });
});
