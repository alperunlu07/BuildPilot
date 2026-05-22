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

// Responsive overhaul Faz 0 — viewport presets so reviewers can spot
// check any story at the same breakpoints Playwright's mobile/tablet
// projects use. The defaults Storybook ships are iPhone 6 / Galaxy /
// Kindle — not quite the modern set we want.
const CUSTOM_VIEWPORTS = {
  iphoneSE: {
    name: 'iPhone SE (375)',
    styles: { width: '375px', height: '667px' },
    type: 'mobile',
  },
  iphone12: {
    name: 'iPhone 12 (390)',
    styles: { width: '390px', height: '844px' },
    type: 'mobile',
  },
  pixel7: {
    name: 'Pixel 7 (412)',
    styles: { width: '412px', height: '915px' },
    type: 'mobile',
  },
  ipadMini: {
    name: 'iPad Mini (768)',
    styles: { width: '768px', height: '1024px' },
    type: 'tablet',
  },
  laptop: {
    name: 'Laptop (1280)',
    styles: { width: '1280px', height: '800px' },
    type: 'desktop',
  },
  desktop: {
    name: 'Desktop (1440)',
    styles: { width: '1440px', height: '900px' },
    type: 'desktop',
  },
} as const;

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
    viewport: {
      viewports: CUSTOM_VIEWPORTS,
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
