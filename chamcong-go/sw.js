// Service worker: lưu sẵn app trên máy để mở nhanh và mở được khi mạng yếu.
//  - File có phiên bản cố định (thư viện CDN ghi số phiên bản, file của app có ?v=...): lấy ngay từ máy, không hỏi mạng.
//  - Trang HTML: hỏi mạng trước để nhận bản cập nhật (chờ tối đa 3 giây), mạng chậm/mất thì dùng bản đã lưu.
const CACHE = 'chamcong-go-v6';
const SHELL = ['./', './index.html', './admin.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];
const IMMUTABLE = [/^https:\/\/unpkg\.com\/[^/]+@\d/, /^https:\/\/www\.gstatic\.com\/firebasejs\/\d/, /^https:\/\/fonts\.gstatic\.com\//];
const SWR = ['https://fonts.googleapis.com/'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const put = async (req, res) => {
  if (!(res.ok || res.type === 'opaque')) return;
  const c = await caches.open(CACHE);
  const u = new URL(req.url);
  if (u.origin === self.location.origin && u.searchParams.has('v')) {
    // Xoá bản cũ của cùng file (phiên bản trước) cho gọn bộ nhớ.
    (await c.keys()).forEach(k => { const ku = new URL(k.url); if (ku.pathname === u.pathname && ku.search !== u.search) c.delete(k); });
  }
  await c.put(req, res);
};
const cacheFirst = req => caches.match(req).then(hit => hit || fetch(req).then(res => { put(req, res.clone()); return res; }));
const networkFirst = (req, ms) => new Promise(resolve => {
  let done = false;
  const fallback = () => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : null));
  const timer = setTimeout(() => fallback().then(r => { if (r && !done) { done = true; resolve(r); } }), ms);
  fetch(req, { cache: 'no-cache' }).then(res => {
    put(req, res.clone());
    if (!done) { done = true; clearTimeout(timer); resolve(res); }
  }).catch(() => fallback().then(r => { if (!done) { done = true; clearTimeout(timer); resolve(r || Response.error()); } }));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = req.url, u = new URL(url);
  const sameOrigin = u.origin === self.location.origin;
  if (sameOrigin && (u.searchParams.has('v') || u.pathname.includes('/vendor/') || u.pathname.includes('/icons/'))) return e.respondWith(cacheFirst(req));
  if (IMMUTABLE.some(r => r.test(url))) return e.respondWith(cacheFirst(req));
  if (SWR.some(p => url.startsWith(p))) {
    return e.respondWith(caches.match(req).then(hit => { const net = fetch(req).then(res => { put(req, res.clone()); return res; }); return hit || net; }));
  }
  if (sameOrigin) return e.respondWith(networkFirst(req, 3000));
  // Còn lại (ô bản đồ, Firebase, kiểm tra IP): luôn lấy từ mạng.
});

// Bấm vào thông báo nhắc chấm công: mở (hoặc chuyển sang) app.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(w => w.url.startsWith(self.registration.scope) && !w.url.includes('admin.html'));
    return c ? c.focus().then(w => w && w.navigate ? w.navigate(url) : w) : self.clients.openWindow(url);
  }));
});
