import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './index.css';
import './lib/i18n';
import { applyDensity, applyTheme, readStoredDensity, readStoredTheme } from './lib/theme';

applyTheme(readStoredTheme());
applyDensity(readStoredDensity());

const root = document.getElementById('root');
if (!root) throw new Error('#root not found in index.html');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
