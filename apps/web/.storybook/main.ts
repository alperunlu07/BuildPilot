import type { StorybookConfig } from '@storybook/react-vite';

// Storybook 8 + Vite preset. We keep the addon list small — `essentials`
// already bundles controls / actions / viewport / backgrounds / docs which
// is enough for the component-library use case. Visual regression on top
// is a separate Phase 12 item.
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-essentials'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  docs: {
    autodocs: 'tag',
  },
  typescript: {
    // We rely on TS in strict mode at the workspace root; let Storybook
    // skip its own type checks so build-storybook stays snappy.
    check: false,
    reactDocgen: 'react-docgen-typescript',
  },
  core: {
    disableTelemetry: true,
  },
};

export default config;
