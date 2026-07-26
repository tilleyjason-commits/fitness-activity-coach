/**
 * Service worker registration. Production only — a worker in dev caches the
 * Vite module graph and produces stale-module confusion on reload.
 *
 * The scope is the Vite base path, so the same code works on GitHub Pages
 * (/fitness-activity-coach/) and at a domain root.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const base = import.meta.env.BASE_URL || '/';

  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${base}sw.js`, { scope: base }).catch(() => {
      // An unavailable worker degrades to a normal online-only app.
    });
  });
}
