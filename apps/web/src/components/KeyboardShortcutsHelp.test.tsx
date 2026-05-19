import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useStore } from '../store/store';
import '../lib/i18n';

describe('KeyboardShortcutsHelp', () => {
  beforeEach(() => {
    useStore.setState({ shortcutsHelpOpen: true });
  });

  it('renders the dialog when the store flag is true', () => {
    render(<KeyboardShortcutsHelp />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('clicking the backdrop calls closeShortcutsHelp', async () => {
    render(<KeyboardShortcutsHelp />);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(dialog);
    expect(useStore.getState().shortcutsHelpOpen).toBe(false);
  });

  it('clicking the close button calls closeShortcutsHelp', async () => {
    useStore.setState({ shortcutsHelpOpen: true });
    render(<KeyboardShortcutsHelp />);
    await userEvent.click(screen.getByLabelText('Close'));
    expect(useStore.getState().shortcutsHelpOpen).toBe(false);
  });

  it('renders nothing when the store flag is false', () => {
    useStore.setState({ shortcutsHelpOpen: false });
    const { container } = render(<KeyboardShortcutsHelp />);
    expect(container).toBeEmptyDOMElement();
  });
});
