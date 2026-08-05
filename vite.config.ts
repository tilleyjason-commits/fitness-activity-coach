import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: '/fitness-activity-coach/',
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
