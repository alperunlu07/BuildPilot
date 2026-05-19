import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LogSearchBar, type SavedLogFilter } from './LogSearchBar';

function Harness({
  initialQuery = '',
  initialRegex = false,
  initialPresets = [] as SavedLogFilter[],
}: {
  initialQuery?: string;
  initialRegex?: boolean;
  initialPresets?: SavedLogFilter[];
}) {
  const [query, setQuery] = useState(initialQuery);
  const [regex, setRegex] = useState(initialRegex);
  const [presets, setPresets] = useState<SavedLogFilter[]>(initialPresets);
  return (
    <LogSearchBar
      query={query}
      onQueryChange={setQuery}
      regex={regex}
      onRegexChange={setRegex}
      presets={presets}
      onApplyPreset={(p) => {
        setQuery(p.query);
        setRegex(p.regex);
      }}
      onSavePreset={(name) => {
        setPresets((cur) => [
          ...cur,
          { id: `id-${cur.length}`, name, query, regex },
        ]);
      }}
      onDeletePreset={(id) => setPresets((cur) => cur.filter((p) => p.id !== id))}
    />
  );
}

describe('LogSearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('toggling regex mode flips the placeholder', async () => {
    render(<Harness />);
    expect(screen.getByPlaceholderText('Filter messages…')).toBeInTheDocument();
    await userEvent.click(screen.getByTitle(/Enable regex mode/i));
    expect(screen.getByPlaceholderText(/Regex \(e\.g\./i)).toBeInTheDocument();
  });

  it('saved-preset save round-trip', async () => {
    render(<Harness />);
    const input = screen.getByPlaceholderText('Filter messages…');
    await userEvent.type(input, 'error');

    await userEvent.click(screen.getByRole('button', { name: /Presets/ }));
    const nameInput = screen.getByPlaceholderText('Save current as…');
    await userEvent.type(nameInput, 'My errors');
    await userEvent.click(screen.getByRole('button', { name: /Save/ }));

    // Saved preset appears.
    expect(screen.getByText('My errors')).toBeInTheDocument();
  });
});
