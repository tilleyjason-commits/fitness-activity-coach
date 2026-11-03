import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { buildCsp, inlineScriptHashes } from './scripts/csp.mjs';

/** Production builds only: dev needs Vite's inline HMR/refresh scripts. */
function cspMeta(): Plugin {
  return {
    name: 'fac-csp-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        const csp = buildCsp({ scriptHashes: inlineScriptHashes(html) });
        return html.replace(
          '<meta charset="UTF-8" />',
          `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${csp}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), cspMeta()],
  // Vercel sets VERCEL=1 and serves the domain root. GitHub Pages does not,
  // and is mounted at the repo path. Do not hardcode that path into a Vercel build.
  base: process.env.VERCEL ? '/' : '/fitness-activity-coach/',
  build: {
    // The hand-written service worker uses this to precache lazy route chunks,
    // not just the entry JS/CSS visible in index.html.
    manifest: 'asset-manifest.json',
  },
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, 'src'),
    },
  },
});
