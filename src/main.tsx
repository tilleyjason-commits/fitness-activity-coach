import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '~/App';
import { ErrorBoundary } from '~/components/ErrorBoundary';
import { AuthProvider } from '~/context/AuthContext';
import { applyTheme, getStoredTheme } from '~/lib/theme';
import '~/index.css';

applyTheme(getStoredTheme());

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
