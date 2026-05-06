import type { StepType } from '@buildpilot/shared-types';

export interface StepFieldSchema {
  name: string;
  label: string;
  // 'branchSelect' = a project-aware combobox populated with the project's
  // local + remote branches. The host UI supplies the branch list.
  type: 'text' | 'textarea' | 'select' | 'number' | 'branchSelect';
  options?: readonly string[];
  required?: boolean;
  placeholder?: string;
  help?: string;
  defaultValue?: string | number;
}

export interface StepDefinition {
  type: StepType;
  label: string;
  description: string;
  color: string; // background colour for the React Flow node
  icon: string;  // lucide-react icon name
  fields: readonly StepFieldSchema[];
}

const UNITY_BUILD_TARGETS = [
  'StandaloneLinux64',
  'StandaloneWindows64',
  'StandaloneOSX',
  'iOS',
  'Android',
  'WebGL',
] as const;

export const STEP_DEFINITIONS: Record<StepType, StepDefinition> = {
  checkout: {
    type: 'checkout',
    label: 'Checkout',
    description: 'Switch the project working tree to a specific branch.',
    color: '#0ea5e9',
    icon: 'GitBranch',
    fields: [
      { name: 'branch', label: 'Branch', type: 'branchSelect', required: true },
    ],
  },
  pull: {
    type: 'pull',
    label: 'Pull',
    description: 'Fetch and fast-forward the current branch from the remote.',
    color: '#10b981',
    icon: 'ArrowDownToLine',
    fields: [
      { name: 'remote', label: 'Remote', type: 'text', placeholder: 'origin' },
    ],
  },
  shell: {
    type: 'shell',
    label: 'Shell',
    description: 'Run an arbitrary shell command inside the project directory.',
    color: '#f59e0b',
    icon: 'Terminal',
    fields: [
      {
        name: 'command',
        label: 'Command',
        type: 'textarea',
        required: true,
        placeholder: 'pnpm install && pnpm test',
      },
      {
        name: 'cwd',
        label: 'Working dir (relative)',
        type: 'text',
        placeholder: '. (defaults to project root)',
      },
    ],
  },
  unityBatch: {
    type: 'unityBatch',
    label: 'Unity Batch Build',
    description: 'Run Unity in batch mode and invoke a static build method.',
    color: '#a855f7',
    icon: 'Gamepad2',
    fields: [
      {
        name: 'unityPath',
        label: 'Unity executable path',
        type: 'text',
        required: true,
        placeholder: 'C:/Program Files/Unity/Hub/Editor/<version>/Editor/Unity.exe',
      },
      {
        name: 'buildTarget',
        label: 'Build target',
        type: 'select',
        required: true,
        options: UNITY_BUILD_TARGETS,
      },
      {
        name: 'executeMethod',
        label: 'Static method',
        type: 'text',
        required: true,
        placeholder: 'BuildScript.BuildDedicatedServer',
      },
      {
        name: 'extraArgs',
        label: 'Extra args',
        type: 'text',
        placeholder: '-customArg value',
      },
      {
        name: 'logPath',
        label: 'Log file path',
        type: 'text',
        placeholder: '(optional — otherwise streamed to stdout)',
      },
    ],
  },
  httpRequest: {
    type: 'httpRequest',
    label: 'HTTP Request',
    description: 'Make an HTTP call and fail the step on a non-success status.',
    color: '#06b6d4',
    icon: 'Globe',
    fields: [
      {
        name: 'method',
        label: 'Method',
        type: 'select',
        required: true,
        options: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const,
        defaultValue: 'POST',
      },
      {
        name: 'url',
        label: 'URL',
        type: 'text',
        required: true,
        placeholder: 'https://api.example.com/build-finished',
      },
      {
        name: 'headers',
        label: 'Headers (one per line, "Key: Value")',
        type: 'textarea',
        placeholder: 'Authorization: Bearer ${env.TOKEN}\nContent-Type: application/json',
      },
      {
        name: 'body',
        label: 'Body',
        type: 'textarea',
        placeholder: '{"status":"green"}',
      },
      {
        name: 'expectedStatus',
        label: 'Expected status (comma-separated)',
        type: 'text',
        placeholder: '200,201,204 (defaults to 2xx)',
      },
    ],
  },
  slackNotify: {
    type: 'slackNotify',
    label: 'Slack Notify',
    description: 'Post a message to a Slack incoming webhook.',
    color: '#22d3ee',
    icon: 'MessageSquare',
    fields: [
      {
        name: 'webhookUrl',
        label: 'Webhook URL',
        type: 'text',
        required: true,
        placeholder: 'https://hooks.slack.com/services/T.../B.../...',
      },
      {
        name: 'text',
        label: 'Message',
        type: 'textarea',
        required: true,
        placeholder: ':white_check_mark: Build finished',
      },
    ],
  },
  discordNotify: {
    type: 'discordNotify',
    label: 'Discord Notify',
    description: 'Post a message to a Discord webhook.',
    color: '#8b5cf6',
    icon: 'MessageCircle',
    fields: [
      {
        name: 'webhookUrl',
        label: 'Webhook URL',
        type: 'text',
        required: true,
        placeholder: 'https://discord.com/api/webhooks/.../...',
      },
      {
        name: 'content',
        label: 'Message',
        type: 'textarea',
        required: true,
        placeholder: '✅ Build finished',
      },
    ],
  },
  remoteSsh: {
    type: 'remoteSsh',
    label: 'Remote SSH',
    description: 'Run a shell command on a remote host via ssh — the foundation for cross-OS builds.',
    color: '#64748b',
    icon: 'Server',
    fields: [
      {
        name: 'host',
        label: 'Host',
        type: 'text',
        required: true,
        placeholder: 'user@mac-builder.local',
        help: 'Optionally include a port: user@host:2222',
      },
      {
        name: 'identityFile',
        label: 'Identity file',
        type: 'text',
        placeholder: '~/.ssh/id_ed25519 (optional)',
      },
      {
        name: 'cwd',
        label: 'Remote working dir',
        type: 'text',
        placeholder: '/Users/build/projects/MyGame',
      },
      {
        name: 'command',
        label: 'Command',
        type: 'textarea',
        required: true,
        placeholder: 'git pull && xcodebuild -scheme MyGame -configuration Release archive',
      },
      {
        name: 'skipStrictHostKey',
        label: 'Skip strict host key checking',
        type: 'select',
        options: ['false', 'true'] as const,
        defaultValue: 'false',
      },
    ],
  },
  xcodebuild: {
    type: 'xcodebuild',
    label: 'xcodebuild',
    description: 'Drive xcodebuild for iOS / macOS builds (must run on a Mac — see Remote SSH).',
    color: '#0891b2',
    icon: 'Apple',
    fields: [
      {
        name: 'workspacePath',
        label: 'Workspace (.xcworkspace, optional)',
        type: 'text',
        placeholder: 'MyGame.xcworkspace',
      },
      {
        name: 'projectPath',
        label: 'Project (.xcodeproj, used if no workspace)',
        type: 'text',
        placeholder: 'MyGame.xcodeproj',
      },
      {
        name: 'scheme',
        label: 'Scheme',
        type: 'text',
        required: true,
        placeholder: 'MyGame',
      },
      {
        name: 'configuration',
        label: 'Configuration',
        type: 'select',
        options: ['Debug', 'Release'] as const,
        defaultValue: 'Release',
      },
      {
        name: 'buildAction',
        label: 'Action',
        type: 'select',
        options: ['build', 'archive', 'test', 'clean'] as const,
        defaultValue: 'archive',
      },
      {
        name: 'destination',
        label: 'Destination',
        type: 'text',
        placeholder: 'generic/platform=iOS',
      },
      {
        name: 'archivePath',
        label: 'Archive path (when action=archive)',
        type: 'text',
        placeholder: 'build/MyGame.xcarchive',
      },
      {
        name: 'additionalArgs',
        label: 'Extra args',
        type: 'text',
        placeholder: 'CODE_SIGNING_ALLOWED=NO',
      },
    ],
  },
  artifact: {
    type: 'artifact',
    label: 'Artifact',
    description: 'Record build outputs (paths or globs) so they can be downloaded later.',
    color: '#facc15',
    icon: 'Package',
    fields: [
      {
        name: 'paths',
        label: 'Paths (one per line)',
        type: 'textarea',
        required: true,
        placeholder:
          'Builds/Linux/server.x86_64\nBuilds/Linux/server_Data/**\nartifacts/dist/**',
        help: 'A path can be a file, a directory (one level), or end with /** for recursive walk.',
      },
    ],
  },
  aiPrompt: {
    type: 'aiPrompt',
    label: 'AI Prompt',
    description: 'Run a non-interactive prompt through claude / codex / aider / gemini / custom CLI.',
    color: '#ec4899',
    icon: 'Sparkles',
    fields: [
      {
        name: 'tool',
        label: 'Tool',
        type: 'select',
        required: true,
        options: ['claude', 'codex', 'aider', 'gemini', 'custom'] as const,
        defaultValue: 'claude',
      },
      {
        name: 'command',
        label: 'Custom command (only when tool=custom)',
        type: 'text',
        placeholder: 'mycli --flag',
      },
      {
        name: 'prompt',
        label: 'Prompt',
        type: 'textarea',
        required: true,
        placeholder: 'Fix the failing test in src/utils.ts so that pnpm test passes.',
      },
      {
        name: 'cwd',
        label: 'Working dir (relative)',
        type: 'text',
        placeholder: '. (defaults to project root)',
      },
      {
        name: 'allowFailure',
        label: 'Allow failure (continue on non-zero exit)',
        type: 'select',
        options: ['false', 'true'] as const,
        defaultValue: 'false',
      },
    ],
  },
};

export const STEP_TYPES: readonly StepType[] = Object.keys(STEP_DEFINITIONS) as StepType[];

export function getStepDefinition(type: StepType): StepDefinition {
  return STEP_DEFINITIONS[type];
}
