import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/bagel-fat-one/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-400.css';
import '@fontsource/atkinson-hyperlegible-next/latin-700.css';
import '@fontsource/atkinson-hyperlegible-next/latin-800.css';
import './styles/global.css';
import './styles/screens.css';
import { App } from './App.js';
import { audio } from './audio/audio.js';

// iOS only lets audio start inside a gesture: every tap (Join, Ready, anything) unlocks or resumes it.
document.addEventListener('pointerdown', audio.unlock, { capture: true, passive: true });

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
