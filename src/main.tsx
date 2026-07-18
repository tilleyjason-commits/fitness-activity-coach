import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '~/App';
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
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
