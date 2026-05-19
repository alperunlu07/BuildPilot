import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CronBuilder } from './CronBuilder';

describe('CronBuilder', () => {
  it('shows an inline error for an invalid expression', async () => {
    const onChange = vi.fn();
    render(<CronBuilder value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('0 9 * * *');
    await userEvent.type(input, 'not-a-cron');
    expect(screen.getByText(/Invalid cron/i)).toBeInTheDocument();
  });

  it('describes a valid expression and surfaces the human form', async () => {
    const onChange = vi.fn();
    render(<CronBuilder value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('0 9 * * *');
    await userEvent.type(input, '0 9 * * *');
    // The description for "0 9 * * *" includes the literal "09:00" — both
    // in the live description and in preset labels.
    expect(screen.getAllByText(/09:00/).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/at minute 0, at 09:00/)).toBeInTheDocument();
    // Last keystroke fires onChange with the final string.
    expect(onChange).toHaveBeenLastCalledWith('0 9 * * *');
  });

  it('clicking a preset rewrites the raw input', async () => {
    const onChange = vi.fn();
    render(<CronBuilder value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: 'Every hour' }));
    const input = screen.getByPlaceholderText('0 9 * * *') as HTMLInputElement;
    expect(input.value).toBe('0 * * * *');
    expect(onChange).toHaveBeenCalledWith('0 * * * *');
  });
});
