import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { Providers } from '@/app/providers';
import { router } from '@/app/router';
import '@/styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found in index.html');

createRoot(rootEl).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>
);

/*
 * THE SERVICE WORKER, which is here so the app can be INSTALLED and for very
 * little else. See public/sw.js for what it deliberately does not do.
 *
 * PRODUCTION ONLY. In dev the worker would sit in front of Vite's module graph
 * and could hand a stale asset back to HMR, and the bug that produces looks
 * like a React fault rather than a caching one. There is nothing to exercise
 * locally anyway: offline it serves one designed page.
 *
 * AFTER `load`, not during it. Registering competes with the first paint
 * otherwise, and on the phones this product is built for that is the paint
 * that matters most. Nothing in the app depends on the worker, so it waits.
 *
 * A failure is swallowed on purpose. A browser with service workers turned
 * off, or a private window that refuses the registration, must still get the
 * entire app; the only thing lost is the install prompt.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Not installable here. Everything else still works. */
    });
  });
}
