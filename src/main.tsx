import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '~/App';
import { ErrorBoundary } from '~/components/ErrorBoundary';
import { AuthProvider } from '~/context/AuthContext';
import { applyTheme, getStoredTheme } from '~/lib/theme';
import { registerServiceWorker } from '~/lib/register-sw';
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
