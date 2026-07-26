import { describe, expect, it } from 'vitest';
import manifestRaw from '../../public/manifest.webmanifest?raw';
import html from '../../index.html?raw';
import sw from '../../public/sw.js?raw';
import { THEME_STORAGE_KEY } from './constants';

/**
 * The install surface is a contract with the OS: a broken manifest or a
 * mis-scoped worker fails silently on a phone, so it gets asserted here
 * rather than discovered after a deploy.
 */

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
  shortcuts?: { url: string }[];
}

const manifest = JSON.parse(manifestRaw) as Manifest;

describe('web app manifest', () => {
  it('declares a standalone app with a name and short name', () => {
    expect(manifest.name).toBe('Fitness Activity Coach');
    expect(manifest.short_name.length).toBeLessThanOrEqual(12);
    expect(manifest.display).toBe('standalone');
  });

  it('uses relative start_url and scope so the Pages base path resolves', () => {
    expect(manifest.start_url).toBe('./');
    expect(manifest.scope).toBe('./');
  });

  it('ships 192, 512, and a maskable icon', () => {
    const sizes = manifest.icons.map((icon) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });

  it('matches the app background so the splash screen does not flash', () => {
    expect(manifest.background_color).toBe('#0f172a');
    expect(manifest.theme_color).toBe('#0f172a');
  });

  it('points every shortcut at a hash route, since the app uses HashRouter', () => {
    for (const shortcut of manifest.shortcuts ?? []) {
      expect(shortcut.url).toMatch(/^\.\/#\//);
    }
  });
});

describe('theme bootstrap', () => {
  it('drops the hardcoded dark class in favour of a pre-paint script', () => {
    expect(html).not.toMatch(/<html[^>]*class="dark"/);
    expect(html).toMatch(/classList\.add\('dark'\)/);
  });

  it('reads the same storage key lib/theme writes', () => {
    expect(html).toContain(`localStorage.getItem('${THEME_STORAGE_KEY}')`);
  });

  it('keeps dark as the default when storage is unreadable', () => {
    expect(html).toMatch(/catch[\s\S]*classList\.add\('dark'\)/);
  });

  it('declares a theme colour for both schemes', () => {
    expect(html).toMatch(/theme-color"\s+content="#f1f5f9"\s+media="\(prefers-color-scheme: light\)"/);
    expect(html).toMatch(/theme-color"\s+content="#0f172a"\s+media="\(prefers-color-scheme: dark\)"/);
  });

  it('links the manifest and an apple touch icon', () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('rel="apple-touch-icon"');
  });
});

describe('service worker', () => {
  it('serves navigations network-first with a cached shell fallback', () => {
    expect(sw).toContain("request.mode === 'navigate'");
    expect(sw).toContain('networkFirstShell');
  });

  it('never intercepts cross-origin or non-GET traffic', () => {
    expect(sw).toContain("request.method !== 'GET'");
    expect(sw).toContain('url.origin !== self.location.origin');
  });

  it('drops stale caches on activate', () => {
    expect(sw).toContain('caches.delete');
    expect(sw).toContain('CACHE_VERSION');
  });
});
