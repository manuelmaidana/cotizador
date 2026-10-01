import { StrictMode } from 'react';
import type { Root } from 'react-dom/client';
import App from './App';
import { UserProvider } from './context/UserContext';
import { CompanyProvider } from './context/CompanyContext';
import { ToastProvider } from './context/ToastContext';
import { preloadProducts } from './services/productService';

/** Loaded by main.tsx only once the Firebase settings are known to be present. */
export function mount(root: Root) {
  preloadProducts();
  root.render(
    <StrictMode>
      <UserProvider>
        <CompanyProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </CompanyProvider>
      </UserProvider>
    </StrictMode>,
  );
}
