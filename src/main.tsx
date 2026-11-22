import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const rootEl = document.getElementById('root')!;
rootEl.dataset.appMounted = '1';

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
