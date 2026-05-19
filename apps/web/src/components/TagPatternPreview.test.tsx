import { describe, expect, it, vi, beforeEach } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock the API so the component doesn't try to hit fetch().
vi.mock('../lib/api', () => ({
  api: {
    projectTags: vi.fn(async () => [
      { tag: 'v1.0.0', sha: 'aaaaaaa1234' },
      { tag: 'v1.1.0', sha: 'bbbbbbb1234' },
      { tag: 'release-candidate', sha: 'ccccccc1234' },
    ]),
  },
}));

import { TagPatternPreview } from './TagPatternPreview';

function Wrapped({ initial = '' }: { initial?: string }) {
  const [v, setV] = useState(initial);
  return <TagPatternPreview projectId="p1" value={v} onChange={setV} />;
}

describe('TagPatternPreview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders match indicators that update when the pattern changes', async () => {
    render(<Wrapped />);

    await waitFor(() => {
      expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    });

    // With no pattern, "X of N tags match" header is not visible.
    expect(screen.queryByText(/of 3 tags? match/)).not.toBeInTheDocument();

    const input = screen.getByPlaceholderText('v*.*.*');
    await userEvent.type(input, 'v*');

    // Now the match indicator should show 2 of 3.
    await waitFor(() => {
      expect(screen.getByText('2 of 3 tags match')).toBeInTheDocument();
    });
  });
});
