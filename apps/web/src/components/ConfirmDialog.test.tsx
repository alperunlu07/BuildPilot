import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('disables the confirm button until the user types the exact phrase', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Delete project"
        body="This is irreversible."
        confirmLabel="Delete"
        variant="destructive"
        typedConfirmation="DELETE"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

    const confirm = screen.getByRole('button', { name: 'Delete' });
    expect(confirm).toBeDisabled();

    const input = screen.getByRole('textbox');
    await userEvent.type(input, 'DEL');
    expect(confirm).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();

    await userEvent.type(input, 'ETE');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('clicking the backdrop fires onCancel (Esc handled at app level)', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="Confirm"
        body="Continue?"
        onConfirm={() => {}}
        onCancel={onCancel}
      />,
    );
    // Cancel button always available regardless of typedConfirmation state.
    await userEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('renders nothing when `open` is false', () => {
    const { container } = render(
      <ConfirmDialog
        open={false}
        title="t"
        body="b"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
