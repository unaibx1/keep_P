import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './styles.css'

// Performance monitoring
const startTime = performance.now();

// Preload critical resources
const preloadCriticalResources = () => {
  const criticalResources = [
    '/src/App.tsx',
    '/src/styles.css',
    '/manifest.webmanifest'
  ];

  criticalResources.forEach(resource => {
    const link = document.createElement('link');
    link.rel = 'preload';
    link.as = resource.endsWith('.css') ? 'style' : 'script';
    link.href = resource;
    document.head.appendChild(link);
  });
};

// Enhanced service worker registration with better error handling
const registerServiceWorker = async () => {
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/',
        updateViaCache: 'none' // Always check for updates
      });

      console.log('Service Worker registered successfully:', registration);

      // Listen for service worker updates
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // New service worker available
              console.log('New service worker available');
              // You can show a notification to the user here
            }
          });
        }
      });

      // Listen for sync events from SW
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'SYNC_PENDING') {
          window.dispatchEvent(new Event('app-sync-pending'));
        }
        if (event.data?.type === 'ONLINE_STATUS') {
          window.dispatchEvent(new CustomEvent('online-status-change', { 
            detail: { online: event.data.online } 
          }));
        }
      });

      // Handle service worker errors
      registration.addEventListener('error', (error) => {
        console.error('Service Worker registration failed:', error);
      });

      return registration;
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
};

// Initialize app with performance optimizations
const initializeApp = async () => {
  // Preload critical resources
  preloadCriticalResources();

  // Register service worker
  await registerServiceWorker();

  // Measure app initialization time
  const initTime = performance.now() - startTime;
  console.log(`App initialized in ${initTime.toFixed(2)}ms`);

  // Render the app
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
};

// Start the app
initializeApp().catch(console.error);

// Performance monitoring
window.addEventListener('load', () => {
  const loadTime = performance.now() - startTime;
  console.log(`App fully loaded in ${loadTime.toFixed(2)}ms`);
  
  // Report to analytics if available
  if ('gtag' in window) {
    (window as any).gtag('event', 'timing_complete', {
      name: 'app_load',
      value: Math.round(loadTime)
    });
  }
});
