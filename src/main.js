/**
 * @file Browser entry point (loaded by index.html).
 * Mounts <App /> into #root and loads global CSS (Tailwind).
 *
 * StrictMode is development-only: it double-invokes renders, state updaters
 * and effects to surface side-effect bugs early. It has no effect in production.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.js';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
