import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './styles.css'
import { ErrorBoundary } from './components/ErrorBoundary'

// Error handling for React rendering
const handleError = (error: Error, errorInfo: any) => {
  console.error('React error:', error, errorInfo);
  
  // Hide loading indicator if it exists
  const loading = document.getElementById('loading');
  if (loading) {
    loading.style.opacity = '0';
    loading.style.transition = 'opacity 0.3s ease';
    setTimeout(() => loading.remove(), 300);
  }
};

// Global error handler
window.addEventListener('error', (event) => {
  console.error('Global error:', event.error);
  handleError(event.error, {});
});

// Unhandled promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  handleError(new Error(event.reason), {});
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// Dispatch app ready event when React app is mounted
window.dispatchEvent(new CustomEvent('app-ready'));
