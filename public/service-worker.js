/* global workbox */
/* Service Worker für Keiko – Offline‑Support, Caching und Fallbacks */

// Workbox laden (CDN)
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.5.4/workbox-sw.js');

const VERSION = 'v1.0.1';

// Installation: sofortige Aktivierung
self.addEventListener('install', (event) => {
  // Wichtige statische Assets vorab cachen (Precache light)
  event.waitUntil(
    caches.open('keiko-precache-' + VERSION).then((cache) => {
      return cache.addAll(['/', '/index.html', '/offline.html', '/manifest.json']);
    }),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Alte Caches bereinigen
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) =>
              (k.startsWith('keiko-precache-') && !k.endsWith(VERSION)) ||
              (k.startsWith('keiko-webhooks-') && !k.endsWith(VERSION)) ||
              (k.startsWith('keiko-api-') && !k.endsWith(VERSION))
            )
            .map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

// Fallback für Navigation (App‑Shell)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const preload = await event.preloadResponse;
          if (preload) return preload;
          const net = await fetch(request);
          return net;
        } catch (_) {
          const cache = await caches.open('keiko-precache-' + VERSION);
          const offline = await cache.match('/offline.html');
          return offline || new Response('Offline', { status: 503 });
        }
      })(),
    );
  }
});

if (self.workbox) {
  // Cache Strategien
  const { routing, strategies, expiration, cacheableResponse } = self.workbox;

  // Statische Assets: Cache First
  routing.registerRoute(
    ({ request }) => ['style', 'script', 'image', 'font'].includes(request.destination),
    new strategies.CacheFirst({
      cacheName: 'keiko-static-' + VERSION,
      plugins: [
        new expiration.ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 }),
        new cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  );

  // API: Network First mit Fallback Cache (nur für same-origin requests)
  routing.registerRoute(
    ({ url, request }) =>
      url.pathname.startsWith('/api/') &&
      request.method === 'GET' &&
      url.origin === self.location.origin, // Nur same-origin requests cachen
    new strategies.NetworkFirst({
      cacheName: 'keiko-api-' + VERSION,
      networkTimeoutSeconds: 5,
      plugins: [new cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] })],
    }),
  );

  // Häufige Daten: Stale‑While‑Revalidate (z. B. Agents, Configs) - nur same-origin
  routing.registerRoute(
    ({ url, request }) =>
      request.method === 'GET' &&
      url.origin === self.location.origin && // Nur same-origin requests cachen
      (/\/api\/v[12]\/agents/.test(url.pathname) ||
        /\/api\/v[12]\/configurations/.test(url.pathname)),
    new strategies.StaleWhileRevalidate({ cacheName: 'keiko-swr-' + VERSION }),
  );

  // Voice API (Lesend) – Network First mit Fallback - nur same-origin
  routing.registerRoute(
    ({ url, request }) =>
      request.method === 'GET' &&
      url.origin === self.location.origin && // Nur same-origin requests cachen
      /\/api\/voice\//.test(url.pathname),
    new strategies.NetworkFirst({ cacheName: 'keiko-voice-' + VERSION }),
  );

  // Webhook Management (Targets/Deliveries) – SWR - nur same-origin
  routing.registerRoute(
    ({ url, request }) =>
      request.method === 'GET' &&
      url.origin === self.location.origin && // Nur same-origin requests cachen
      (/\/api\/v1\/webhooks\/targets/.test(url.pathname) ||
        /\/api\/v1\/webhooks\/deliveries/.test(url.pathname)),
    new strategies.StaleWhileRevalidate({ cacheName: 'keiko-webhooks-' + VERSION }),
  );

  // Agent Config (Lesend) – SWR - nur same-origin
  routing.registerRoute(
    ({ url, request }) =>
      request.method === 'GET' &&
      url.origin === self.location.origin && // Nur same-origin requests cachen
      /\/api\/v1\/agents\/config/.test(url.pathname),
    new strategies.StaleWhileRevalidate({ cacheName: 'keiko-agents-config-' + VERSION }),
  );

  // Health Check – Cache First (schneller Offline‑Status) - nur same-origin
  routing.registerRoute(
    ({ url, request }) =>
      request.method === 'GET' &&
      url.origin === self.location.origin && // Nur same-origin requests cachen
      /\/api\/v1\/health/.test(url.pathname),
    new strategies.CacheFirst({ cacheName: 'keiko-health-' + VERSION }),
  );
}

// Nachrichten vom Client (z. B. SKIP_WAITING)
self.addEventListener('message', (event) => {
  if (!event.data) return;
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* Service Worker für Offline-First, Caching und Background Sync */
const CACHE_NAME = 'keiko-sw-v1';
const CORE_ASSETS = ['/', '/index.html', '/offline.html'];
const BACKGROUND_SYNC_TAG = 'keiko-background-sync';
const CRITICAL_API_PATTERNS = ['/api/v1/agents', '/api/v1/webhooks', '/api/logs/client'];

// IndexedDB für Background Sync Queue
const DB_NAME = 'keiko-sync-db';
const STORE_NAME = 'sync-queue';
const DB_VERSION = 1;

// Öffnet IndexedDB für Background Sync
function openSyncDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('priority', 'priority', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Fügt Request zur Background Sync Queue hinzu
async function queueRequest(request, priority = 'normal') {
  try {
    const db = await openSyncDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const requestData = {
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.method !== 'GET' ? await request.text() : null,
      timestamp: Date.now(),
      priority: priority,
      retryCount: 0,
    };

    await store.add(requestData);

    // Background Sync registrieren
    if ('serviceWorker' in self && 'sync' in self.registration) {
      await self.registration.sync.register(BACKGROUND_SYNC_TAG);
    }
  } catch (error) {
    console.error('[SW] Queue Request failed:', error);
  }
}

// Prüft ob Request kritisch ist
function isCriticalRequest(url) {
  return CRITICAL_API_PATTERNS.some((pattern) => url.includes(pattern));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
      ),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Nur same-origin requests verarbeiten, cross-origin requests durchlassen
  if (url.origin !== self.location.origin) {
    return; // Lässt cross-origin requests unverändert durch
  }

  // Background Sync für kritische POST/PUT/PATCH Requests
  if (req.method !== 'GET' && isCriticalRequest(req.url)) {
    event.respondWith(
      fetch(req.clone()).catch(async (error) => {
        // Bei Netzwerkfehler: Request in Queue einreihen
        await queueRequest(req.clone(), 'high');
        throw error;
      }),
    );
    return;
  }

  // Standard GET Caching + Offline Fallback für Navigation
  if (req.method === 'GET') {
    if (req.mode === 'navigate') {
      event.respondWith(
        fetch(req).catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const offline = await cache.match('/offline.html');
          return offline || Response.error();
        }),
      );
      return;
    }
    event.respondWith(
      (async () => {
        const cached = await caches.match(req);
        try {
          const networkRes = await fetch(req);

          // Prüfe ob Response cacheable ist
          const shouldCache = (req.url.startsWith('http://') || req.url.startsWith('https://')) &&
                             !req.url.includes('/api/v1/logs/') &&
                             !req.url.includes('/api/v1/metrics/') &&
                             networkRes.ok &&
                             networkRes.status < 400 &&
                             networkRes.type !== 'opaque';

          if (shouldCache) {
            try {
              const copy = networkRes.clone();
              // Sichere Cache-Operation mit Fehlerbehandlung
              caches.open(CACHE_NAME).then((cache) => {
                return cache.put(req, copy).catch((error) => {
                  console.warn('Cache put failed:', error);
                });
              }).catch((error) => {
                console.warn('Cache open failed:', error);
              });
            } catch (error) {
              console.warn('Cache clone failed:', error);
            }
          }
          return networkRes;
        } catch (error) {
          console.warn('Network request failed:', error);
          return cached || new Response('Network error', { status: 503 });
        }
      })(),
    );
  }
});

// Background Sync Event Handler
self.addEventListener('sync', (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) {
    event.waitUntil(flushSyncQueue());
  }
});

// Queue-Flush-Mechanismus
async function flushSyncQueue() {
  try {
    const db = await openSyncDB();
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('priority');

    // Hole alle Requests sortiert nach Priorität (high zuerst)
    const requests = await new Promise((resolve, reject) => {
      const req = index.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Sortiere: high priority zuerst, dann nach Timestamp
    requests.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (a.priority !== 'high' && b.priority === 'high') return 1;
      return a.timestamp - b.timestamp;
    });

    const results = [];

    for (const requestData of requests) {
      try {
        // Rekonstruiere Request
        const request = new Request(requestData.url, {
          method: requestData.method,
          headers: requestData.headers,
          body: requestData.body,
        });

        // Versuche Request auszuführen
        const response = await fetch(request);

        if (response.ok) {
          // Erfolgreich: Aus Queue entfernen
          await store.delete(requestData.id);
          results.push({ id: requestData.id, status: 'success' });
        } else {
          // HTTP-Fehler: Retry-Count erhöhen
          requestData.retryCount = (requestData.retryCount || 0) + 1;
          if (requestData.retryCount >= 3) {
            // Max Retries erreicht: Aus Queue entfernen
            await store.delete(requestData.id);
            results.push({ id: requestData.id, status: 'failed_max_retries' });
          } else {
            // Retry später
            await store.put(requestData);
            results.push({ id: requestData.id, status: 'retry_scheduled' });
          }
        }
      } catch (error) {
        // Netzwerkfehler: Retry-Count erhöhen
        requestData.retryCount = (requestData.retryCount || 0) + 1;
        if (requestData.retryCount >= 3) {
          await store.delete(requestData.id);
          results.push({ id: requestData.id, status: 'failed_network' });
        } else {
          await store.put(requestData);
          results.push({ id: requestData.id, status: 'retry_scheduled' });
        }
      }
    }

    console.log('[SW] Background Sync completed:', results);

    // Wenn noch Requests in Queue: Nächsten Sync planen
    const remainingRequests = await new Promise((resolve, reject) => {
      const req = store.count();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    if (remainingRequests > 0) {
      // Exponential Backoff für nächsten Sync
      setTimeout(
        () => {
          if ('serviceWorker' in self && 'sync' in self.registration) {
            self.registration.sync.register(BACKGROUND_SYNC_TAG);
          }
        },
        Math.min(30000, 1000 * Math.pow(2, Math.min(5, requests[0]?.retryCount || 0))),
      );
    }
  } catch (error) {
    console.error('[SW] Background Sync failed:', error);
  }
}
