import type { Meta, StoryObj } from '@storybook/react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { StepNode } from './StepNode';

// StepNode is a React Flow custom node — it can't render standalone because
// it calls `useReactFlow()` and renders <Handle>. Each story spins up a
// minimal React Flow canvas with one node so the renderer wiring stays
// real but the rest of the editor (sidebar, palette, etc.) is excluded.

const nodeTypes = {
  shell: StepNode,
  checkout: StepNode,
  artifact: StepNode,
};

interface StoryArgs {
  type: string;
  data: Record<string, unknown>;
}

function makeNode(type: string, data: Record<string, unknown>): Node {
  return {
    id: 'demo',
    type,
    position: { x: 80, y: 60 },
    data,
  };
}

const meta: Meta<StoryArgs> = {
  title: 'Pipeline/StepNode',
  parameters: {
    layout: 'fullscreen',
  },
  render: ({ type, data }) => (
    <div style={{ width: 360, height: 220, background: '#020617' }}>
      <ReactFlowProvider>
        <ReactFlow
          nodes={[makeNode(type, data)]}
          edges={[]}
          nodeTypes={nodeTypes}
          fitView
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          nodesDraggable={false}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background />
        </ReactFlow>
      </ReactFlowProvider>
    </div>
  ),
};
export default meta;

type Story = StoryObj<StoryArgs>;

// Resting state — no runtime status, all required fields filled in.
export const Idle: Story = {
  args: {
    type: 'shell',
    data: { command: 'pnpm install && pnpm test' },
  },
};

export const Running: Story = {
  args: {
    type: 'shell',
    data: {
      command: 'pnpm build',
      runtimeStatus: 'running',
      runtimeStartedAt: Date.now() - 4200,
    },
  },
};

export const Success: Story = {
  args: {
    type: 'shell',
    data: {
      command: 'pnpm test',
      runtimeStatus: 'success',
      runtimeStartedAt: Date.now() - 12_400,
      runtimeFinishedAt: Date.now() - 200,
    },
  },
};

export const Failed: Story = {
  args: {
    type: 'shell',
    data: {
      command: 'pnpm test',
      runtimeStatus: 'failed',
      runtimeStartedAt: Date.now() - 8_400,
      runtimeFinishedAt: Date.now() - 50,
    },
  },
};

// Skipped / disabled — pipeline UI shows the node greyed out with a
// "skipped" pill so the user knows downstream edges propagate the state.
export const Disabled: Story = {
  args: {
    type: 'shell',
    data: {
      command: 'pnpm build',
      disabled: true,
    },
  },
};

// When a required field is empty, the node renders a red AlertCircle
// badge — used to flag invalid steps before the user attempts to save.
export const MissingFieldBadge: Story = {
  args: {
    type: 'shell',
    // The `shell` step's `command` field is required; leaving it blank
    // surfaces the warning badge.
    data: {},
  },
};
