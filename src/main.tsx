import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { UserProvider } from './context/UserContext';
import { CompanyProvider } from './context/CompanyContext';
import { ToastProvider } from './context/ToastContext';
import { preloadProducts } from './services/productService';
import './index.css';

preloadProducts();

createRoot(document.getElementById('root')!).render(
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
