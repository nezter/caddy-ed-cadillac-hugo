// Service Worker

const CACHE_VERSION = 'v1';
const CACHE_NAME = `caddy-ed-cache-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline/';

// Assets to cache immediately on service worker install.
//
// This list used to name /css/main.css, /js/main.js, /img/logo.svg,
// /img/vehicle-placeholder.jpg and /img/hero-background.jpg. Every one of
// those paths is now a 404: the CSS and JS are content-hashed by Hugo Pipes,
// the logo is a hashed asset, and the two image paths have never existed.
//
// `cache.addAll` rejects the whole promise if a single request fails, so
// event.waitUntil rejected, the install event failed, and the worker was
// discarded before it ever activated. There has been no offline support on this
// site at all -- it only looked like there was, because registration succeeds
// and the failure happens afterwards and silently.
//
// Two changes:
//   1. Precache only URLs that are actually stable and actually published.
//   2. Add each entry independently and tolerate a miss, so one bad path can
//      never take the whole worker down again.
const PRECACHE_ASSETS = [
  '/',
  '/inventory/',
  '/contact/'
];

// Install event - precache key resources
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => Promise.all(
        PRECACHE_ASSETS.map(url =>
          // A 404 is a rejected promise, caught here rather than being allowed
          // to fail the install.
          cache.add(new Request(url, { cache: 'reload' })).catch(err => {
            console.warn('[sw] precache skipped', url, err && err.message);
          })
        )
      ))
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
