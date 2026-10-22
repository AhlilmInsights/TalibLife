// HabitFlow service worker — lets the website open with no internet after the first visit.
// Bump CACHE_VERSION whenever you upload new app files so phones pick up the update.
const CACHE_VERSION = 'habitflow-v10';
const SHELL = [
  './', './index.html', './manifest.json', './css/app.css',
  './js/core.js', './js/files.js', './js/prayer.js', './js/studio.js', './js/today.js', './js/review.js', './js/habits.js', './js/app.js',
  './vendor/adhan.min.js', './vendor/pdfjs/pdf.min.js', './vendor/pdfjs/pdf.worker.min.js', './data/mutun/index.json', './data/quran-1441.json',
  './fonts/amiri-quran-arabic-400-normal.woff2', './fonts/amiri-arabic-400-normal.woff2', './fonts/amiri-arabic-700-normal.woff2',
  './fonts/ibm-plex-sans-arabic-latin-400-normal.woff2', './fonts/ibm-plex-sans-arabic-latin-700-normal.woff2',
  './fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', './fonts/ibm-plex-sans-arabic-arabic-700-normal.woff2',
  './icons/icon-192.png', './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))));
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // recitations and readings stream straight from their sites
  if (req.headers.has('range')) return;            // let the browser handle partial requests itself

  // Data files (Qur'an layouts, mutūn line maps): the cached copy opens instantly, and a fresh copy is
  // fetched in the background so corrected data arrives on the next start.
  if (url.pathname.includes('/data/')) {
    event.respondWith(caches.open(CACHE_VERSION).then((c) => c.match(req).then((hit) => {
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
      if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
      return net;
    })));
    return;
  }
  // App files: network first so updates show, cached copy when offline.
  event.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE_VERSION).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))));
});
