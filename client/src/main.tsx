import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './components/ui/Toast';
import { SocketErrorListener } from './components/SocketErrorListener';
import App from './App';

// Self-hosted fonts (no network requests to a font CDN).
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/inter';
import '@fontsource-variable/jetbrains-mono';

import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <SocketErrorListener />
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>
);
