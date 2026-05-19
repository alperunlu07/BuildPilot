import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import type { Matrix } from '@buildpilot/shared-types';
import { MatrixEditor } from './MatrixEditor';

// Pure controlled editor — bind to local state so reviewers can add /
// remove axes and watch the cross-product preview update.
function Demo({ initial }: { initial: Matrix | null }) {
  const [value, setValue] = useState<Matrix | null>(initial);
  return (
    <div style={{ width: 640, padding: 12 }} className="dark">
      <MatrixEditor value={value} onChange={setValue} />
    </div>
  );
}

const meta: Meta<typeof Demo> = {
  title: 'Forms/MatrixEditor',
  component: Demo,
  parameters: { layout: 'fullscreen' },
};
export default meta;

type Story = StoryObj<typeof Demo>;

export const Empty: Story = {
  args: { initial: null },
};

export const SingleAxis: Story = {
  args: {
    initial: { axes: { xcode: ['15', '16'] } },
  },
};

export const CrossProduct: Story = {
  args: {
    initial: { axes: { xcode: ['15', '16'], scheme: ['Free', 'Pro'] } },
  },
};

export const LargeMatrix: Story = {
  args: {
    initial: {
      axes: {
        xcode: ['14', '15', '16'],
        scheme: ['Free', 'Pro', 'Enterprise'],
        platform: ['ios', 'macos', 'tvos'],
      },
    },
  },
};
