// Service Worker

const CACHE_VERSION = 'v1';
const CACHE_NAME = `caddy-ed-cache-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline/';

// Assets to cache immediately on service worker install
const PRECACHE_ASSETS = [
  '/',
  '/offline/',
  '/css/main.css',
  '/js/main.js',
  '/img/logo.svg',
  '/img/vehicle-placeholder.jpg',
  '/img/hero-background.jpg'
];

// Install event - precache key resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(PRECACHE_ASSETS);
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
          console.log('Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache, falling back to network
self.addEventListener('fetch', event => {
  // Skip non-GET requests and browser extensions
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith('http')) {
    return;
  }

  // For HTML requests - network-first strategy
  if (event.request.headers.get('Accept').includes('text/html')) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          // If successful, clone the response and store in cache
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME)
              .then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => {
          // If network fails, try cache first
          return caches.match(event.request)
            .then(cachedResponse => {
              // Return cached response or offline page
              return cachedResponse || caches.match(OFFLINE_URL);
            });
        })
    );
    return;
  }

  // For images and static assets - cache-first strategy
  if (event.request.url.match(/\.(jpg|jpeg|png|gif|svg|webp|js|css)$/)) {
    event.respondWith(
      caches.match(event.request)
        .then(cachedResponse => {
          // Return cached response or fetch from network
          return cachedResponse || fetch(event.request)
            .then(response => {
              // Cache the fetched response
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
              return response;
            });
        })
    );
    return;
  }

  // For API requests - network-only with timeout
  if (event.request.url.includes('/api/') || event.request.url.includes('/.netlify/functions/')) {
    const TIMEOUT_SECONDS = 10;
    
    event.respondWith(
      Promise.race([
        fetch(event.request.clone())
          .then(response => {
            // Don't cache API responses
            return response;
          }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Request timeout')), TIMEOUT_SECONDS * 1000)
        )
      ])
      .catch(() => {
        // If network fails, try cache as fallback
        return caches.match(event.request);
      })
    );
    return;
  }

  // Default strategy - stale-while-revalidate
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Return cached response immediately
        const fetchPromise = fetch(event.request)
          .then(response => {
            // Update the cache
            if (response.status === 200) {
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => cache.put(event.request, responseToCache));
            }
            return response;
          });
        
        return cachedResponse || fetchPromise;
      })
  );
});
