import type { Meta, StoryObj } from '@storybook/react';
import { useEffect, useState } from 'react';
import { TagPatternPreview } from './TagPatternPreview';

// TagPatternPreview hits `/api/projects/:id/tags` on mount. We swap
// `window.fetch` for a deterministic mock so the story renders predictable
// data in Storybook (no backend). Each story restores the original fetch
// on unmount so other stories aren't poisoned.
function useFetchMock(tags: Array<{ tag: string; sha: string }>): void {
  useEffect(() => {
    const original = window.fetch;
    window.fetch = ((input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('/tags')) {
        return Promise.resolve(
          new Response(JSON.stringify(tags), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      // Default empty 200 for anything else the component might fetch.
      return Promise.resolve(new Response('[]', { status: 200 }));
    }) as typeof window.fetch;
    return () => {
      window.fetch = original;
    };
  }, [tags]);
}

function Demo({
  tags,
  initialPattern,
}: {
  tags: Array<{ tag: string; sha: string }>;
  initialPattern: string;
}) {
  useFetchMock(tags);
  const [value, setValue] = useState(initialPattern);
  return (
    <div style={{ width: 480, padding: 12 }} className="dark">
      <TagPatternPreview projectId="story-project" value={value} onChange={setValue} />
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'Forms/TagPatternPreview',
  component: Demo,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Demo>;

const SEMVER_TAGS = [
  { tag: 'v2.10.0', sha: '0a1b2c3d4e5f' },
  { tag: 'v2.9.4', sha: '1a2b3c4d5e6f' },
  { tag: 'v2.9.3', sha: '2a3b4c5d6e7f' },
  { tag: 'v2.8.0', sha: '3a4b5c6d7e8f' },
  { tag: 'beta-2025-01', sha: '4a5b6c7d8e9f' },
  { tag: 'nightly-2024-12-30', sha: '5a6b7c8d9e0f' },
];

export const SemverMatch: Story = {
  args: { tags: SEMVER_TAGS, initialPattern: 'v*.*.*' },
};

export const NoMatches: Story = {
  args: { tags: SEMVER_TAGS, initialPattern: 'release-*' },
};

export const EmptyPattern: Story = {
  args: { tags: SEMVER_TAGS, initialPattern: '' },
};

export const NoTagsInRepo: Story = {
  args: { tags: [], initialPattern: 'v*' },
};
