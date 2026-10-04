import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { Toaster } from './components/ui/toaster';
import { ToastProvider } from '@/hooks/useToast';
import { initTheme } from './services/theme';
import './index.css';

// Diagnostics: instead of a blank screen when a render error escapes,
// show a visible error page with the component name, exception and stack trace.
interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, componentStack: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error, componentStack: '' };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // React passes the failing component stack here (not via getDerivedStateFromError).
    this.setState({ componentStack: errorInfo.componentStack || '' });
    console.error('[ErrorBoundary] React render failure:', error, errorInfo.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div style={{ background: '#1a1a2e', color: '#ffffff', fontFamily: 'system-ui, sans-serif', padding: 24, height: '100vh', boxSizing: 'border-box' }}>
          <h1 style={{ fontSize: 22, marginBottom: 12 }}>Renderer Error</h1>
          <p style={{ color: '#f87171', fontWeight: 600, marginBottom: 8 }}>
            Failed component: {(this.state.componentStack || this.state.error.message).split('\n')[0]}
          </p>
          <p style={{ color: '#e5e7eb', marginBottom: 12 }}>{this.state.error.message}</p>
          <pre style={{ background: '#111122', padding: 12, borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 12, color: '#9ca3af' }}>
            {this.state.error.stack || '(no stack trace)'}
            {this.state.componentStack ? `\n\nComponent stack:\n${this.state.componentStack}` : ''}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// Apply the persisted theme (main process ConfigService) as early as
// possible. The index.html bootstrap script already set the root class
// from localStorage for frame 0; this syncs with the authoritative value
// and enables live "System" theme tracking.
void initTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      {/* ToastProvider must wrap BOTH the app routes and the Toaster,
          otherwise Toaster's useToast() throws and the whole tree unmounts. */}
      <ToastProvider>
        {/* HashRouter: the app is loaded via file:// from the asar, so
            history-based routes never match the URL; hash routes do. */}
        <HashRouter>
          <App />
          <Toaster />
        </HashRouter>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
