import { createHash } from 'node:crypto';

/**
 * Content-Security-Policy shared by the build-time <meta> tag (GitHub Pages
 * cannot send headers) and vercel.json (real headers). `frame-ancestors` is
 * ignored in a <meta> tag, so it only appears in the header version.
 *
 * script-src has no 'unsafe-inline': the one inline script (theme bootstrap in
 * index.html) is allowed by its sha256 hash, computed from the built HTML.
 * style-src keeps 'unsafe-inline' because React renders style attributes.
 */
export function buildCsp({ scriptHashes = [], supabaseHost = '*.supabase.co', header = false } = {}) {
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", ...scriptHashes.map((h) => `'sha256-${h}'`)],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', `https://${supabaseHost}`],
    'font-src': ["'self'"],
    'connect-src': ["'self'", `https://${supabaseHost}`, `wss://${supabaseHost}`],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  if (header) directives['frame-ancestors'] = ["'none'"];
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${values.join(' ')}`)
    .join('; ');
}

export function inlineScriptHashes(html) {
  const hashes = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    if (!match[1].trim()) continue;
    hashes.push(createHash('sha256').update(match[1]).digest('base64'));
  }
  return hashes;
}
