import type { Meta, StoryObj } from '@storybook/react';
import type { BuildApproval } from '@buildpilot/shared-types';
import { ApprovalCard } from './ApprovalCard';

// ApprovalCard hits `api.decideApproval` when buttons are clicked. We keep
// stories purely visual (readOnly = false but no live click handlers
// expected to round-trip). Reviewers can still tab through the buttons.

function approval(overrides: Partial<BuildApproval>): BuildApproval {
  return {
    id: 'app-1',
    buildId: 'build-1',
    pipelineId: 'pl-1',
    projectId: 'p-1',
    nodeId: 'node-approve',
    message:
      '## Promote to production\n\nThe staging smoke tests passed. Promote build `abc1234` to **production**?',
    inputsSpec: [],
    requiredApprovers: 1,
    requiredRoles: [],
    timeoutMinutes: 60,
    requestedAt: Date.now() - 60_000,
    decision: null,
    decidedBy: null,
    decidedAt: null,
    inputsValues: null,
    approvers: [],
    ...overrides,
  };
}

const meta: Meta<typeof ApprovalCard> = {
  title: 'Build/ApprovalCard',
  component: ApprovalCard,
  parameters: { layout: 'fullscreen' },
  decorators: [
    (Story) => (
      <div style={{ width: 780, background: '#020617' }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof ApprovalCard>;

export const PendingSingleApprover: Story = {
  args: {
    approval: approval({}),
  },
};

export const PendingWithInputs: Story = {
  args: {
    approval: approval({
      message: '### Deploy hotfix\n\nDeploy hotfix to **prod**? Specify a release tag.',
      inputsSpec: [
        { name: 'tag', label: 'Release tag', type: 'text', required: true },
        {
          name: 'env',
          label: 'Environment',
          type: 'select',
          options: ['prod-us', 'prod-eu', 'prod-ap'],
          required: true,
        },
        { name: 'paged', label: 'I have paged on-call', type: 'checkbox', required: true },
      ],
    }),
  },
};

export const PendingMultiApprover: Story = {
  args: {
    approval: approval({
      message: '## Release v2.10.0\n\nNeeds two senior approvals before tagging.',
      requiredApprovers: 2,
      requiredRoles: ['admin'],
      approvers: [
        { actor: 'alice', decision: 'approve', at: Date.now() - 30_000 },
      ],
    }),
  },
};

export const Decided: Story = {
  args: {
    approval: approval({
      decision: 'approve',
      decidedBy: 'alice',
      decidedAt: Date.now() - 5_000,
      approvers: [
        { actor: 'alice', decision: 'approve', at: Date.now() - 5_000 },
      ],
    }),
    readOnly: true,
  },
};

export const Rejected: Story = {
  args: {
    approval: approval({
      decision: 'reject',
      decidedBy: 'bob',
      decidedAt: Date.now() - 2_000,
      approvers: [
        { actor: 'bob', decision: 'reject', at: Date.now() - 2_000 },
      ],
    }),
    readOnly: true,
  },
};
