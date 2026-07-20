import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Unit tests must never talk to a real backend: fail fast if the Supabase
// client module is imported without an explicit mock.
vi.stubEnv('VITE_SUPABASE_URL', 'http://supabase.test.invalid');
vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'test-anon-key');

afterEach(() => {
  cleanup();
});
