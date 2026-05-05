import type { StepType } from '@buildpilot/shared-types';

export interface StepFieldSchema {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'number';
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
      { name: 'branch', label: 'Branch', type: 'text', required: true, placeholder: 'main' },
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
};

export const STEP_TYPES: readonly StepType[] = Object.keys(STEP_DEFINITIONS) as StepType[];

export function getStepDefinition(type: StepType): StepDefinition {
  return STEP_DEFINITIONS[type];
}
