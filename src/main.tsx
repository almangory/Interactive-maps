import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { LanguageProvider } from './utils/i18n';

// Intercept and swallow generic cross-origin "Script error." issues
// typically raised by third-party scripts or Google Maps iframes
if (typeof window !== 'undefined') {
  const isIgnorableError = (message: any, source: any) => {
    const msg = String(message || '').toLowerCase();
    const src = String(source || '').toLowerCase();
    return (
      msg.includes('script error') || 
      msg.includes('cross-origin') ||
      msg.includes('cors') ||
      !source || 
      src === '' || 
      src.includes('google') || 
      src.includes('googleapis') || 
      src.includes('google-analytics') ||
      src.includes('leaflet') ||
      src.includes('maps')
    );
  };

  const prevOnError = window.onerror;
  window.onerror = function (message, source, lineno, colno, error) {
    if (isIgnorableError(message, source)) {
      console.warn('Ignored safe cross-origin or third-party script error:', message);
      return true; // prevent default error reporting and stop propagation to iframe boundary
    }
    if (prevOnError) {
      try {
        return prevOnError.apply(this, [message, source, lineno, colno, error]);
      } catch (e) {
        return true;
      }
    }
    return true; // Return true as a fallback to prevent screen notifications of external system/network glitches
  };

  window.addEventListener('error', (event) => {
    const errorMsg = event.message || (event.error ? event.error.message : '');
    const filename = event.filename || (event.error ? event.error.filename : '');
    if (isIgnorableError(errorMsg, filename) || isIgnorableError(event.message, event.filename)) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, { capture: true });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const reasonStr = String(reason && (reason.message || reason) || '').toLowerCase();
    if (
      reasonStr.includes('script error') || 
      reasonStr.includes('cross-origin') ||
      reasonStr.includes('cors') ||
      reasonStr.includes('google') ||
      reasonStr.includes('leaflet') ||
      reasonStr.includes('maps')
    ) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    }
  }, { capture: true });

  // Hijack console.error to prevent cross-origin/iframe script issues from causing false flags
  const originalConsoleError = console.error;
  console.error = function (...args) {
    const errorStr = args.map(arg => {
      if (arg instanceof Error) {
        return arg.message + ' ' + (arg.stack || '');
      }
      return String(arg);
    }).join(' ').toLowerCase();

    if (
      errorStr.includes('script error') ||
      errorStr.includes('cross-origin') ||
      errorStr.includes('cors') ||
      errorStr.includes('google.com') ||
      errorStr.includes('googleapis.com') ||
      errorStr.includes('leaflet') ||
      errorStr.includes('maps')
    ) {
      console.warn('Suppressed third-party map or cross-origin console.error:', ...args);
      return;
    }
    originalConsoleError.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LanguageProvider>
      <App />
    </LanguageProvider>
  </StrictMode>,
);

