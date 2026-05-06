import type { StepType } from '@buildpilot/shared-types';

export interface StepFieldSchema {
  name: string;
  label: string;
  // 'branchSelect'  = project-aware combobox populated with the project's
  //                   local + remote branches.
  // 'hostSelect'    = combobox listing entries from ~/.buildpilot/hosts.json
  //                   plus an "(inline)" option that hands control back to
  //                   the host/identityFile/password fields below it.
  // The host UI supplies both lists.
  type: 'text' | 'textarea' | 'select' | 'number' | 'branchSelect' | 'hostSelect';
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
  gitMerge: {
    type: 'gitMerge',
    label: 'Git Merge',
    description: 'Merge another branch into the current one (compose with AI auto-fix to resolve conflicts).',
    color: '#14b8a6',
    icon: 'GitMerge',
    fields: [
      { name: 'sourceBranch', label: 'Source branch', type: 'branchSelect', required: true },
      {
        name: 'noFastForward',
        label: 'Always create a merge commit (--no-ff)',
        type: 'select',
        options: ['false', 'true'] as const,
        defaultValue: 'false',
      },
      {
        name: 'message',
        label: 'Commit message (optional)',
        type: 'text',
        placeholder: 'Merge {{source}} into {{current}}',
      },
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
  telegramNotify: {
    type: 'telegramNotify',
    label: 'Telegram Notify',
    description: 'Send a message via Telegram Bot API (token + chat fall back to ~/.buildpilot/config.json).',
    color: '#38bdf8',
    icon: 'Send',
    fields: [
      {
        name: 'botToken',
        label: 'Bot token (leave blank for default)',
        type: 'text',
        placeholder: '123456:ABC-DEF…',
      },
      {
        name: 'chatId',
        label: 'Chat id (leave blank for default)',
        type: 'text',
        placeholder: '@yourchannel or 12345678',
      },
      {
        name: 'text',
        label: 'Message',
        type: 'textarea',
        required: true,
        placeholder: '✅ NetworkTest server build finished\n<i>commit</i> <code>{{sha}}</code>',
      },
      {
        name: 'parseMode',
        label: 'Parse mode',
        type: 'select',
        options: ['plain', 'HTML', 'MarkdownV2'] as const,
        defaultValue: 'plain',
      },
      {
        name: 'silent',
        label: 'Send silently (no sound)',
        type: 'select',
        options: ['false', 'true'] as const,
        defaultValue: 'false',
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
        name: 'hostId',
        label: 'Saved host (or pick "(inline)" to type one below)',
        type: 'hostSelect',
      },
      {
        name: 'host',
        label: 'Host (used when no saved host is picked)',
        type: 'text',
        placeholder: 'user@mac-builder.local',
        help: 'Optionally include a port: user@host:2222',
      },
      {
        name: 'identityFile',
        label: 'Identity file (use this OR password)',
        type: 'text',
        placeholder: '~/.ssh/id_ed25519',
      },
      {
        name: 'password',
        label: 'Password (plaintext — see secrets warning)',
        type: 'text',
        placeholder: '(leave blank to use identityFile)',
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
  sftpUpload: {
    type: 'sftpUpload',
    label: 'SFTP Upload',
    description: 'Upload a single file over SSH/SFTP (key or password auth).',
    color: '#475569',
    icon: 'Upload',
    fields: [
      {
        name: 'hostId',
        label: 'Saved host (or pick "(inline)" to type one below)',
        type: 'hostSelect',
      },
      {
        name: 'host',
        label: 'Host (used when no saved host is picked)',
        type: 'text',
        placeholder: 'root@game-server.example:22',
      },
      {
        name: 'identityFile',
        label: 'Identity file (use this OR password)',
        type: 'text',
        placeholder: '~/.ssh/id_ed25519',
      },
      {
        name: 'password',
        label: 'Password (plaintext — see secrets warning)',
        type: 'text',
        placeholder: '(leave blank to use identityFile)',
      },
      {
        name: 'localPath',
        label: 'Local file (relative to project, or absolute)',
        type: 'text',
        required: true,
        placeholder: 'Builds/Server.rar',
      },
      {
        name: 'remotePath',
        label: 'Remote destination (absolute path)',
        type: 'text',
        required: true,
        placeholder: '/home/Game/Server.rar',
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
  s3Upload: {
    type: 's3Upload',
    label: 'S3 Upload',
    description: 'Upload a file to AWS S3 with optional presigned URL + manifest. Stores credentials in plaintext.',
    color: '#fb923c',
    icon: 'CloudUpload',
    fields: [
      {
        name: 'accessKeyId',
        label: 'AWS Access Key ID (plaintext — secrets vault TBD)',
        type: 'text',
        required: true,
        placeholder: 'AKIA…',
      },
      {
        name: 'secretAccessKey',
        label: 'AWS Secret Access Key',
        type: 'text',
        required: true,
        placeholder: '40-char secret',
      },
      {
        name: 'region',
        label: 'Region',
        type: 'text',
        required: true,
        placeholder: 'eu-central-1',
      },
      {
        name: 'bucket',
        label: 'Bucket',
        type: 'text',
        required: true,
        placeholder: 'my-build-bucket',
      },
      {
        name: 'localPath',
        label: 'Local file',
        type: 'text',
        required: true,
        placeholder: 'Builds/Server.rar',
      },
      {
        name: 'key',
        label: 'S3 object key (path inside bucket)',
        type: 'text',
        required: true,
        placeholder: 'linux-x86_64/Server.rar',
      },
      {
        name: 'storageClass',
        label: 'Storage class',
        type: 'select',
        options: [
          'STANDARD',
          'STANDARD_IA',
          'REDUCED_REDUNDANCY',
          'GLACIER',
          'DEEP_ARCHIVE',
        ] as const,
        defaultValue: 'STANDARD',
      },
      {
        name: 'makePresignedUrl',
        label: 'Generate presigned URL',
        type: 'select',
        options: ['false', 'true'] as const,
        defaultValue: 'false',
      },
      {
        name: 'presignedExpiresSec',
        label: 'Presigned URL expiry (seconds)',
        type: 'number',
        placeholder: '604800 = 7 days',
      },
      {
        name: 'manifestKey',
        label: 'Manifest object key (optional, e.g. stable.json)',
        type: 'text',
        placeholder: 'stable.json',
      },
      {
        name: 'manifestChannel',
        label: 'Manifest channel',
        type: 'text',
        placeholder: 'stable',
      },
      {
        name: 'manifestPlatform',
        label: 'Manifest platform',
        type: 'text',
        placeholder: 'linux-x86_64',
      },
    ],
  },
  xcodebuild: {
    type: 'xcodebuild',
    label: 'xcodebuild',
    description: 'Drive xcodebuild for iOS / macOS builds. Local or via a saved Mac host.',
    color: '#0891b2',
    icon: 'Apple',
    fields: [
      {
        name: 'hostId',
        label: 'Saved Mac host (or pick "(inline)" / leave blank for local)',
        type: 'hostSelect',
      },
      {
        name: 'host',
        label: 'Inline host (used when no saved host is picked)',
        type: 'text',
        placeholder: 'build@mac-builder.local',
      },
      {
        name: 'identityFile',
        label: 'Identity file',
        type: 'text',
        placeholder: '~/.ssh/id_ed25519',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'text',
        placeholder: '(use this OR identityFile)',
      },
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
        label: 'Scheme (required for build / archive / test / clean)',
        type: 'text',
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
        options: ['build', 'archive', 'test', 'clean', 'exportArchive'] as const,
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
        label: 'Archive path (archive: output, exportArchive: input)',
        type: 'text',
        placeholder: 'build/MyGame.xcarchive',
      },
      {
        name: 'exportPath',
        label: 'Export output dir (exportArchive only)',
        type: 'text',
        placeholder: 'build/export',
      },
      {
        name: 'exportOptionsPlist',
        label: 'ExportOptions.plist path (exportArchive only)',
        type: 'text',
        placeholder: 'signing/ExportOptions.plist',
      },
      {
        name: 'additionalArgs',
        label: 'Extra args',
        type: 'text',
        placeholder: 'CODE_SIGNING_ALLOWED=NO',
      },
    ],
  },
  testflightUpload: {
    type: 'testflightUpload',
    label: 'TestFlight Upload',
    description: 'Upload an .ipa to App Store Connect / TestFlight via xcrun altool.',
    color: '#0ea5e9',
    icon: 'PlaneTakeoff',
    fields: [
      {
        name: 'hostId',
        label: 'Saved Mac host (or pick "(inline)" / leave blank for local)',
        type: 'hostSelect',
      },
      {
        name: 'host',
        label: 'Inline host (used when no saved host is picked)',
        type: 'text',
        placeholder: 'build@mac-builder.local',
      },
      {
        name: 'identityFile',
        label: 'Identity file',
        type: 'text',
        placeholder: '~/.ssh/id_ed25519',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'text',
        placeholder: '(use this OR identityFile)',
      },
      {
        name: 'ipaPath',
        label: '.ipa path',
        type: 'text',
        required: true,
        placeholder: 'build/MyGame.ipa',
      },
      {
        name: 'platform',
        label: 'Platform',
        type: 'select',
        options: ['ios', 'macos', 'tvos'] as const,
        defaultValue: 'ios',
      },
      {
        name: 'authMethod',
        label: 'Auth method',
        type: 'select',
        options: ['apiKey', 'appleId'] as const,
        defaultValue: 'apiKey',
      },
      {
        name: 'apiKeyId',
        label: 'API Key ID (apiKey auth)',
        type: 'text',
        placeholder: 'ABC123XYZ',
        help: 'Place AuthKey_<id>.p8 at ~/.appstoreconnect/private_keys/ on the host.',
      },
      {
        name: 'apiIssuerId',
        label: 'API Issuer ID (apiKey auth)',
        type: 'text',
        placeholder: '57246542-96fe-1a63-e053-0824d011072a',
      },
      {
        name: 'appleId',
        label: 'Apple ID (appleId auth)',
        type: 'text',
        placeholder: 'developer@example.com',
      },
      {
        name: 'appPassword',
        label: 'App-specific password (appleId auth — plaintext)',
        type: 'text',
        placeholder: 'xxxx-xxxx-xxxx-xxxx',
      },
      {
        name: 'additionalArgs',
        label: 'Extra altool args',
        type: 'text',
        placeholder: '--verbose',
      },
    ],
  },
  keychainUnlock: {
    type: 'keychainUnlock',
    label: 'Keychain Unlock',
    description: 'Unlock a macOS keychain so codesign / xcodebuild don’t prompt.',
    color: '#f97316',
    icon: 'KeyRound',
    fields: [
      {
        name: 'hostId',
        label: 'Saved Mac host (or pick "(inline)" / leave blank for local)',
        type: 'hostSelect',
      },
      {
        name: 'host',
        label: 'Inline host',
        type: 'text',
        placeholder: 'build@mac-builder.local',
      },
      {
        name: 'identityFile',
        label: 'Identity file',
        type: 'text',
        placeholder: '~/.ssh/id_ed25519',
      },
      {
        name: 'password',
        label: 'Keychain password (plaintext)',
        type: 'text',
        required: true,
        placeholder: '(matches the user login password by default)',
      },
      {
        name: 'keychain',
        label: 'Keychain path',
        type: 'text',
        placeholder: 'login.keychain-db (default)',
      },
      {
        name: 'unlockTimeoutSec',
        label: 'Re-lock after (seconds, optional)',
        type: 'number',
        placeholder: '3600',
      },
    ],
  },
  provisioningProfileInstall: {
    type: 'provisioningProfileInstall',
    label: 'Install Provisioning Profile',
    description:
      'Drop a .mobileprovision into ~/Library/MobileDevice/Provisioning Profiles (locally or remote).',
    color: '#a3e635',
    icon: 'BadgeCheck',
    fields: [
      {
        name: 'hostId',
        label: 'Saved Mac host (or pick "(inline)" / leave blank for local)',
        type: 'hostSelect',
      },
      {
        name: 'host',
        label: 'Inline host',
        type: 'text',
        placeholder: 'build@mac-builder.local',
      },
      {
        name: 'identityFile',
        label: 'Identity file',
        type: 'text',
        placeholder: '~/.ssh/id_ed25519',
      },
      {
        name: 'password',
        label: 'Password',
        type: 'text',
        placeholder: '(use this OR identityFile)',
      },
      {
        name: 'profilePath',
        label: '.mobileprovision file (local — uploaded automatically when remote)',
        type: 'text',
        required: true,
        placeholder: 'signing/MyGame_AdHoc.mobileprovision',
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
