import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { AdminPanel } from './pages/AdminPanel';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

const rootEl = document.getElementById('root')!;
rootEl.dataset.appMounted = '1';

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AdminPanel />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
