// Enhanced Service Worker with better error handling
// Note: This file lives in /public so Vite copies it as-is.
/* eslint-disable no-undef */

const CACHE_VERSION = 'v5';
const CACHE_NAMES = {
  SHELL: `app-shell-${CACHE_VERSION}`,
  STATIC: `static-resources-${CACHE_VERSION}`,
  IMAGES: `images-${CACHE_VERSION}`,
  API: `api-cache-${CACHE_VERSION}`,
  PAGES: `pages-${CACHE_VERSION}`
};

// Critical app shell assets that should be cached immediately
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './favicon.ico',
  './favicon-16x16.png',
  './favicon-32x32.png'
];

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'CACHE_URLS') {
    event.waitUntil(cacheUrls(event.data.urls));
  }
});

// Install event - cache shell assets immediately
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAMES.SHELL).then(cache => {
      console.log('Caching shell assets...');
      return cache.addAll(SHELL_ASSETS);
    }).then(() => {
      console.log('Service Worker installed successfully');
      return self.skipWaiting();
    }).catch(error => {
      console.error('Service Worker installation failed:', error);
      // Continue installation even if caching fails
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!Object.values(CACHE_NAMES).includes(cacheName)) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // Take control immediately
      self.clients.claim()
    ]).then(() => {
      console.log('Service Worker activated successfully');
    }).catch(error => {
      console.error('Service Worker activation failed:', error);
      // Continue activation even if cleanup fails
      return self.clients.claim();
    })
  );
});

// Enhanced fetch event with network-first strategy for navigation
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests
  if (request.mode === 'navigate') {
    // Navigation requests - use network-first to prevent stale cache issues
    event.respondWith(handleNavigation(request));
  } else if (request.destination === 'image') {
    // Images - use cache-first strategy
    event.respondWith(handleImage(request));
  } else if (request.destination === 'style' || request.destination === 'script') {
    // Styles and scripts - use stale-while-revalidate
    event.respondWith(handleStaticResource(request));
  } else if (url.pathname.startsWith('/api/')) {
    // API requests - use network-first with cache fallback
    event.respondWith(handleAPI(request));
  } else {
    // Default - try network first, then cache
    event.respondWith(handleDefault(request));
  }
});

// Navigation handler - network-first to prevent whitescreen
async function handleNavigation(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache the response for next time
      const cache = await caches.open(CACHE_NAMES.PAGES);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
    throw new Error('Network response not ok');
  } catch (error) {
    console.log('Network failed, trying cache:', error);
    
    // If network fails, try cache
    try {
      const cachedResponse = await caches.match(request);
      if (cachedResponse) {
        return cachedResponse;
      }
    } catch (cacheError) {
      console.error('Cache lookup failed:', cacheError);
    }
    
    // If both network and cache fail, return a basic offline page
    console.log('Both network and cache failed, serving offline page');
    return createOfflineResponse();
  }
}

// Create a basic offline response
function createOfflineResponse() {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Offline - Prompt Manager</title>
      <style>
        body { 
          font-family: system-ui, -apple-system, sans-serif; 
          margin: 0; 
          padding: 20px; 
          background: #0f172a; 
          color: white; 
          display: flex; 
          align-items: center; 
          justify-content: center; 
          min-height: 100vh; 
        }
        .container { text-align: center; max-width: 400px; }
        .icon { font-size: 48px; margin-bottom: 20px; }
        button { 
          background: #3b82f6; 
          color: white; 
          border: none; 
          padding: 12px 24px; 
          border-radius: 8px; 
          cursor: pointer; 
          margin: 10px; 
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">📱</div>
        <h1>You're Offline</h1>
        <p>Please check your internet connection and try again.</p>
        <button onclick="window.location.reload()">Retry</button>
        <button onclick="window.location.href='./'">Go Home</button>
      </div>
    </body>
    </html>
  `;
  
  return new Response(html, {
    status: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache'
    }
  });
}

// Image handler - cache-first
async function handleImage(request) {
  try {
    const cache = await caches.open(CACHE_NAMES.IMAGES);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error('Image fetch failed:', error);
    return new Response('', { status: 404 });
  }
}

// Static resource handler - stale-while-revalidate
async function handleStaticResource(request) {
  try {
    const cache = await caches.open(CACHE_NAMES.STATIC);
    const cachedResponse = await cache.match(request);
    
    // Return cached version immediately if available
    const fetchPromise = fetch(request).then(networkResponse => {
      if (networkResponse.ok) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    }).catch(() => {
      // If network fails, return cached version if available
      return cachedResponse || new Response('', { status: 404 });
    });

    return cachedResponse || fetchPromise;
  } catch (error) {
    console.error('Static resource fetch failed:', error);
    return new Response('', { status: 404 });
  }
}

// API handler - network-first
async function handleAPI(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.API);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Try cache as fallback
    try {
      const cachedResponse = await caches.match(request);
      return cachedResponse || new Response('', { status: 503 });
    } catch (cacheError) {
      console.error('API cache fallback failed:', cacheError);
      return new Response('', { status: 503 });
    }
  }
}

// Default handler - network-first
async function handleDefault(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAMES.STATIC);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    try {
      const cachedResponse = await caches.match(request);
      return cachedResponse || new Response('', { status: 404 });
    } catch (cacheError) {
      console.error('Default handler cache fallback failed:', cacheError);
      return new Response('', { status: 404 });
    }
  }
}

// Helper function to cache URLs
async function cacheUrls(urls) {
  try {
    const cache = await caches.open(CACHE_NAMES.STATIC);
    return Promise.all(urls.map(url => cache.add(url)));
  } catch (error) {
    console.error('Cache URLs failed:', error);
    return Promise.resolve();
  }
}
