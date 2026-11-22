import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootEl = document.getElementById('root');

if (rootEl) {
  rootEl.dataset.appMounted = '1';
  try {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  } catch (error) {
    console.error('Failed to mount React app:', error);
    rootEl.innerHTML = `
      <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;background:#f9fafb;color:#1f2937;padding:20px;text-align:center;">
        <h2 style="font-size:20px;margin-bottom:10px;">Ошибка запуска приложения</h2>
        <p style="font-size:14px;color:#4b5563;max-width:400px;word-break:break-all;">${error instanceof Error ? error.message : String(error)}</p>
      </div>
    `;
  }
}
