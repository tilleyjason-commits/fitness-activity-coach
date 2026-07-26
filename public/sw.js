/*
 * Offline app shell for Fitness Activity Coach.
 *
 * Hand-rolled rather than generated: the build emits hashed filenames that a
 * static precache list cannot know, so assets are cached on first use instead.
 * Bump CACHE_VERSION to retire every old cache on the next activate.
 *
 * Strategy
 *   navigation      network-first, falling back to the cached shell offline
 *   /assets/*       cache-first (hashed filenames are immutable)
 *   icons, manifest stale-while-revalidate
 *   everything else straight to the network (Supabase, auth, functions)
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `fac-${CACHE_VERSION}`;

/** Scope-relative shell entries, resolved against the registration scope. */
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL.map((path) => new URL(path, self.registration.scope).href)))
      // A shell entry that 404s must never block installation.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

function isAssetRequest(url) {
  return url.pathname.includes('/assets/');
}

function isStaticRequest(url) {
  return (
    url.pathname.includes('/icons/') ||
    url.pathname.endsWith('.webmanifest') ||
    url.pathname.endsWith('apple-touch-icon.png') ||
    url.pathname.endsWith('favicon-32.png')
  );
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  return cached ?? network;
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(new URL('./index.html', self.registration.scope).href, response.clone());
    }
    return response;
  } catch {
    const shell =
      (await caches.match(new URL('./index.html', self.registration.scope).href)) ??
      (await caches.match(new URL('./', self.registration.scope).href));
    if (shell) return shell;
    throw new Error('Offline and no cached shell available');
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }
  if (isAssetRequest(url)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (isStaticRequest(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});
