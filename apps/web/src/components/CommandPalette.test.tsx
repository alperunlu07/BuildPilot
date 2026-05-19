import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandPalette } from './CommandPalette';
import { useStore } from '../store/store';
import '../lib/i18n';

describe('CommandPalette', () => {
  beforeEach(() => {
    useStore.setState({
      paletteOpen: true,
      projects: [
        // @ts-expect-error — partial Project
        { id: 'pj-game', name: 'My Game', path: '/repo/game' },
        // @ts-expect-error — partial Project
        { id: 'pj-web', name: 'Web App', path: '/repo/web' },
      ],
      pipelines: [
        // @ts-expect-error — partial Pipeline
        { id: 'pl1', name: 'iOS Release', projectId: 'pj-game' },
        // @ts-expect-error — partial Pipeline
        { id: 'pl2', name: 'Lint and Deploy', projectId: 'pj-web' },
      ],
      builds: [],
      recents: [],
    });
  });

  it('shows projects, pipelines, and global actions by default', () => {
    render(<CommandPalette onAddProject={() => {}} onManageHosts={() => {}} />);
    // Project + pipeline labels appear in multiple groups (Projects list +
    // Pipelines list + Run pipeline list), so use getAllByText.
    expect(screen.getAllByText('My Game').length).toBeGreaterThan(0);
    expect(screen.getAllByText('iOS Release').length).toBeGreaterThan(0);
    // At least one Settings reference shows up among actions.
    expect(screen.getAllByText(/Settings/i).length).toBeGreaterThan(0);
  });

  it('filters results by query as the user types', async () => {
    render(<CommandPalette onAddProject={() => {}} onManageHosts={() => {}} />);
    const input = screen.getByPlaceholderText(/search/i);
    await userEvent.type(input, 'iOS Release');

    // Pipelines containing "iOS Release" remain visible. The unrelated
    // "Lint and Deploy" pipeline gets filtered out.
    expect(screen.getAllByText('iOS Release').length).toBeGreaterThan(0);
    expect(screen.queryByText('Lint and Deploy')).not.toBeInTheDocument();
  });

  it('selecting an action closes the palette and updates the view', async () => {
    render(<CommandPalette onAddProject={() => {}} onManageHosts={() => {}} />);
    const input = screen.getByPlaceholderText(/search/i);
    // Filter down to a single action so the next Enter is unambiguous.
    await userEvent.type(input, 'go home');
    await userEvent.keyboard('{Enter}');
    expect(useStore.getState().paletteOpen).toBe(false);
    expect(useStore.getState().view).toEqual({ type: 'home' });
  });
});
