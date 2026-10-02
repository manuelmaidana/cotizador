import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { UserProvider } from './context/UserContext';
import { CompanyProvider } from './context/CompanyContext';
import { ToastProvider } from './context/ToastContext';
import { preloadProducts } from './services/productService';

/** Loaded by main.tsx only once the Firebase settings are known to be present. */
export function mount(root: Root) {
  preloadProducts();
  // Async failures are handled where they happen; this only makes stray ones visible in logs.
  window.addEventListener('unhandledrejection', (e) => console.error('Promesa sin manejar', e.reason));
  root.render(
    <StrictMode>
      <ErrorBoundary>
        <UserProvider>
          <CompanyProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CompanyProvider>
        </UserProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
