import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      // Listen for sync events from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_PENDING') {
          window.dispatchEvent(new Event('app-sync-pending'));
        }
      });
    }).catch(console.error);
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
