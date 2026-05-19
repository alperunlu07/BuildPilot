import type { Preview } from '@storybook/react';
import React from 'react';
// Pull in the same global stylesheet the app uses so Tailwind utility
// classes resolve identically in stories. The CSS file at this path also
// imports react-flow's stylesheet for the StepNode story.
import '../src/index.css';
// Initialise i18n so components that call `useTranslation()` resolve real
// strings instead of falling back to the key (which would clutter every
// story label).
import '../src/lib/i18n';

const preview: Preview = {
  parameters: {
    // BuildPilot is a dark-themed app — show stories on the same near-black
    // background so contrast matches production.
    backgrounds: {
      default: 'slate-950',
      values: [
        { name: 'slate-950', value: '#020617' },
        { name: 'slate-900', value: '#0f172a' },
        { name: 'white', value: '#ffffff' },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    layout: 'centered',
  },
  // Tailwind's `darkMode: 'class'` config in apps/web/tailwind.config.js
  // expects a `.dark` class on an ancestor. Wrap every story in a div that
  // sets it so `dark:` utilities apply globally.
  decorators: [
    (Story) =>
      React.createElement(
        'div',
        { className: 'dark', style: { padding: '1rem', minWidth: '320px' } },
        React.createElement(Story),
      ),
  ],
};

export default preview;
