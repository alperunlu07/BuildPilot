import type { Meta, StoryObj } from '@storybook/react';
import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp';
import { useStore } from '../store/store';

// KeyboardShortcutsHelp is gated on `state.shortcutsHelpOpen` from the
// store. Flip it on per-story so the modal renders without needing the
// keyboard listener wired up.

const meta: Meta<typeof KeyboardShortcutsHelp> = {
  title: 'Dialogs/KeyboardShortcutsHelp',
  component: KeyboardShortcutsHelp,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof KeyboardShortcutsHelp>;

export const Open: Story = {
  render: () => {
    useStore.setState({ shortcutsHelpOpen: true });
    return <KeyboardShortcutsHelp />;
  },
};

// Closed state returns null; documented so reviewers can flip back without
// confusion about an "empty" story.
export const Closed: Story = {
  render: () => {
    useStore.setState({ shortcutsHelpOpen: false });
    return <KeyboardShortcutsHelp />;
  },
};
