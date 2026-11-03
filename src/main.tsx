import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '~/App';
import { ErrorBoundary } from '~/components/ErrorBoundary';
import { AuthProvider } from '~/context/AuthContext';
import { applyTheme, getStoredTheme } from '~/lib/theme';
import { registerServiceWorker } from '~/lib/register-sw';
// Self-hosted (bundled) so no request goes to a third-party font CDN.
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import '@fontsource/inter/latin-800.css';
import '~/index.css';

// The inline bootstrap in index.html already set the class before paint; this
// keeps the stored value authoritative for the rest of the session.
applyTheme(getStoredTheme());
registerServiceWorker();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);
