// サービスワーカー: アプリのファイルをスマホ内に保存して、電波がなくても開けるようにする
// ファイルを更新したら CACHE の番号を上げる（v1 → v2）と、スマホ側も新しい版に入れ替わる
const CACHE = 'film-cam-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './places.js',
  './manifest.json',
  './icon-180.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).catch(() => {
        if (e.request.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    }),
  );
});
