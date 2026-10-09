// Service worker: lưu sẵn giao diện app để mở được khi mạng yếu.
const CACHE = 'chamcong-go-v2';
const SHELL = ['./', './index.html', './styles.css', './config.js', './core.js', './data.js', './app.js', './admin.html', './admin.css', './admin.js', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];
const CDN = ['https://unpkg.com/', 'https://fonts.googleapis.com/', 'https://fonts.gstatic.com/', 'https://www.gstatic.com/firebasejs/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url;
  const sameOrigin = url.startsWith(self.location.origin);
  if (!sameOrigin && !CDN.some(p => url.startsWith(p))) return; // ô bản đồ: luôn lấy từ mạng
  // Mạng trước, lỗi mạng thì dùng bản đã lưu.
  e.respondWith(fetch(req).then(res => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
