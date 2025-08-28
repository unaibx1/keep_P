// Enhanced Service Worker with offline-first caching
// Note: This file lives in /public so Vite copies it as-is.
/* eslint-disable no-undef */

const CACHE_VERSION = 'v4';
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

// Remove references to development files that don't exist in production
const PRELOAD_ASSETS = [
  // These will be handled by Vite's build process
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
    Promise.all([
      // Cache shell assets
      caches.open(CACHE_NAMES.SHELL).then(cache => {
        console.log('Caching shell assets...');
        return cache.addAll(SHELL_ASSETS);
      })
    ]).then(() => {
      console.log('Service Worker installed successfully');
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
    })
  );
});

// Enhanced fetch event with offline-first strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Handle different types of requests
  if (request.mode === 'navigate') {
    // Navigation requests - use offline-first with network fallback
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
    // Default - try cache first, then network
    event.respondWith(handleDefault(request));
  }
});

// Navigation handler - offline-first
async function handleNavigation(request) {
  try {
    // Try cache first
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      // Return cached version immediately
      return cachedResponse;
    }

    // If not in cache, try network
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      // Cache the response for next time
      const cache = await caches.open(CACHE_NAMES.PAGES);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // If network fails, return offline page
    console.log('Navigation failed, serving offline page');
    return caches.match('./index.html');
  }
}

// Image handler - cache-first
async function handleImage(request) {
  const cache = await caches.open(CACHE_NAMES.IMAGES);
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    // Return a placeholder image or fallback
    return new Response('', { status: 404 });
  }
}

// Static resource handler - stale-while-revalidate
async function handleStaticResource(request) {
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
    const cachedResponse = await caches.match(request);
    return cachedResponse || new Response('', { status: 503 });
  }
}

// Default handler
async function handleDefault(request) {
  const cache = await caches.open(CACHE_NAMES.STATIC);
  const cachedResponse = await cache.match(request);
  
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    return cachedResponse || new Response('', { status: 404 });
  }
}

// Helper function to cache URLs
async function cacheUrls(urls) {
  const cache = await caches.open(CACHE_NAMES.STATIC);
  return Promise.all(urls.map(url => cache.add(url)));
}
