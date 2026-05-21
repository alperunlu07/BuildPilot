import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';

// ConfirmDialog has no store dependency — it's a pure presentation component
// driven by `open` + callbacks. We render it always-open in stories and
// wrap each example in a small fixed background so the modal has somewhere
// to sit on the Storybook canvas.
const meta: Meta<typeof ConfirmDialog> = {
  title: 'Dialogs/ConfirmDialog',
  component: ConfirmDialog,
  parameters: {
    layout: 'fullscreen',
  },
  args: {
    open: true,
    onConfirm: () => {},
    onCancel: () => {},
  },
};
export default meta;

type Story = StoryObj<typeof ConfirmDialog>;

export const Default: Story = {
  args: {
    title: 'Confirm action',
    body: 'Are you sure you want to proceed?',
    confirmLabel: 'Proceed',
  },
};

export const Destructive: Story = {
  args: {
    title: 'Remove pipeline',
    body: 'This will remove the pipeline and stop all watchers.\nThis action cannot be undone.',
    confirmLabel: 'Remove',
    variant: 'destructive',
  },
};

export const TypedConfirmation: Story = {
  args: {
    title: 'Delete project "buildpilot"',
    body: 'Removing a project also clears its build history, secrets, and watchers.',
    confirmLabel: 'I understand, delete it',
    variant: 'destructive',
    typedConfirmation: 'buildpilot',
  },
};

// Responsive overhaul Faz 5 — same destructive story pre-set to the
// iPhone SE viewport so reviewers can verify the dialog fluidly fills
// the screen on a 375px viewport without horizontal overflow.
export const PhonePortrait: Story = {
  args: {
    title: 'Remove pipeline',
    body: 'This will remove the pipeline and stop all watchers.\nThis action cannot be undone.',
    confirmLabel: 'Remove',
    variant: 'destructive',
  },
  parameters: {
    viewport: { defaultViewport: 'iphoneSE' },
  },
};

// Interactive story — confirms can flip the dialog closed so reviewers can
// see the open + closed states from the same canvas.
export const Interactive: Story = {
  render: (args) => {
    const Demo = () => {
      const [open, setOpen] = useState(args.open ?? true);
      return (
        <div style={{ minHeight: 240 }}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Open dialog
          </button>
          <ConfirmDialog
            {...args}
            open={open}
            onCancel={() => setOpen(false)}
            onConfirm={() => setOpen(false)}
          />
        </div>
      );
    };
    return <Demo />;
  },
  args: {
    title: 'Reset all settings',
    body: 'All UI preferences will return to their defaults.',
    confirmLabel: 'Reset',
  },
};
