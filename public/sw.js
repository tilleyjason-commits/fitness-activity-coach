/*
 * Offline app shell for Fitness Activity Coach.
 *
 * Hand-rolled rather than generated: the build emits hashed filenames that a
 * static list cannot know, so install discovers them from the built HTML.
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
const SHELL = [
  './',
  './index.html',
  './asset-manifest.json',
  './manifest.webmanifest',
  './icons/icon-192.png',
];

async function fetchIntoCache(cache, url) {
  try {
    const response = await fetch(url, { cache: 'reload' });
    if (response.ok) await cache.put(url, response.clone());
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

/** Cache the shell and every same-scope bundle emitted by Vite. */
async function precacheShell() {
  const cache = await caches.open(CACHE_NAME);
  const scopeUrl = new URL(self.registration.scope);
  const shellUrls = SHELL.map((path) => new URL(path, scopeUrl).href);
  const responses = await Promise.all(shellUrls.map((url) => fetchIntoCache(cache, url)));
  const indexUrl = new URL('./index.html', scopeUrl).href;
  const indexResponse = responses[shellUrls.indexOf(indexUrl)] ?? (await cache.match(indexUrl));
  if (!indexResponse) return;

  const html = await indexResponse.clone().text();
  const assetUrls = [...html.matchAll(/(?:src|href)=["']([^"'#]+)["']/g)]
    .map((match) => new URL(match[1], indexUrl))
    .filter(
      (url) =>
        url.origin === scopeUrl.origin &&
        url.pathname.startsWith(scopeUrl.pathname) &&
        url.pathname.includes('/assets/'),
    );

  const manifestUrl = new URL('./asset-manifest.json', scopeUrl).href;
  const manifestResponse =
    responses[shellUrls.indexOf(manifestUrl)] ?? (await cache.match(manifestUrl));
  if (manifestResponse) {
    try {
      const manifest = await manifestResponse.clone().json();
      for (const entry of Object.values(manifest)) {
        for (const path of [entry.file, ...(entry.css ?? []), ...(entry.assets ?? [])]) {
          if (path) assetUrls.push(new URL(path, scopeUrl));
        }
      }
    } catch {
      // The HTML-discovered entry assets still provide a usable online shell.
    }
  }

  await Promise.all([...new Set(assetUrls.map((url) => url.href))].map((url) => fetchIntoCache(cache, url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    precacheShell()
      // A shell entry that 404s must never block installation.
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('fac-') && key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
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
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then(async (response) => {
      if (response.ok) {
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
    const cache = await caches.open(CACHE_NAME);
    const shell =
      (await cache.match(new URL('./index.html', self.registration.scope).href)) ??
      (await cache.match(new URL('./', self.registration.scope).href));
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
