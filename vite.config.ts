import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
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
