import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { CronBuilder } from './CronBuilder';

// Two-way bound editor — render a small wrapper that holds the controlled
// value in component state so reviewers can interact with the form / raw
// expression and see live updates.
function CronDemo({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <div style={{ width: 560, padding: 12 }} className="dark">
      <CronBuilder value={value} onChange={setValue} />
      <div className="mt-3 text-[11px] text-slate-400">
        Bound value: <code className="rounded bg-slate-800 px-1.5 py-0.5">{value || '(empty)'}</code>
      </div>
    </div>
  );
}

const meta: Meta<typeof CronDemo> = {
  title: 'Forms/CronBuilder',
  component: CronDemo,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof CronDemo>;

export const Daily: Story = {
  args: { initial: '0 9 * * *' },
};

export const EveryFourHours: Story = {
  args: { initial: '0 */4 * * *' },
};

export const Weekly: Story = {
  args: { initial: '0 9 * * 1' },
};

export const InvalidExpression: Story = {
  args: { initial: 'not a cron' },
};

export const Empty: Story = {
  args: { initial: '' },
};
