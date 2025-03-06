// Service Worker

const CACHE_VERSION = 'v1';
const CACHE_NAME = `caddy-ed-cache-${CACHE_VERSION}`;

const OFFLINE_URL = '/offline/';
const CACHED_ASSETS = [
  '/',
  '/offline/',
  '/css/main.css',
  '/js/main.js',
  '/img/logo.svg',
  '/img/favicon.ico',
  '/img/vehicle-placeholder.jpg',
  '/fonts/cadillac-gothic.woff2'
];

// Install event - cache the essential files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(CACHED_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.filter(cacheName => {
          return cacheName.startsWith('caddy-ed-cache-') && cacheName !== CACHE_NAME;
        }).map(cacheName => {
          console.log(`Deleting old cache: ${cacheName}`);
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - respond with cache then network strategy
self.addEventListener('fetch', event => {
  // Skip non-GET requests and those that aren't for our domain
  if (event.request.method !== 'GET' || 
      !(event.request.url.indexOf(self.location.origin) === 0)) {
    return;
  }

  // Skip requests to API endpoints
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('/.netlify/functions/')) {
    return;
  }
  
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached response if found
        if (response) {
          return response;
        }

        // If not in cache, fetch from network
        return fetch(event.request)
          .then(response => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }

            // Clone the response
            const responseToCache = response.clone();

            // Cache the fetched response for future use
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
              });

            return response;
          })
          .catch(error => {
            console.log('Fetch failed:', error);
            // If HTML page request fails, return the offline page
            if (event.request.headers.get('Accept').includes('text/html')) {
              return caches.match(OFFLINE_URL);
            }
          });
      })
  );
});
