import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// jsdom ships no ResizeObserver, and recharts' ResponsiveContainer constructs
// one on mount. Without this stub every chart-bearing page throws the moment
// it has data to plot.
if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}

// Unit tests must never talk to a real backend: fail fast if the Supabase
// client module is imported without an explicit mock.
vi.stubEnv('VITE_SUPABASE_URL', 'http://supabase.test.invalid');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

afterEach(() => {
  cleanup();
  localStorage.clear();
});
