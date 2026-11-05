importScripts('common.js');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'openDashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + (msg.page ? '?page=' + encodeURIComponent(msg.page) : '') + (msg.tab ? '#' + msg.tab : '')) });
  }
  if (msg.type === 'analyzePage') { const slug = slugOf(msg.input); if (slug) analyzePage(slug, msg.scrolls || 15); reply({ ok: !!slug }); }
  if (msg.type === 'searchKeyword') { searchKeyword(msg.keyword, msg.scrolls || 15); reply({ ok: true }); }
  if (msg.type === 'getTranscript') { getTranscript(msg.key).then(reply).catch((e) => reply({ ok: false, error: e.message || String(e) })); return true; }
  if (msg.type === 'scrollMe' && sender.tab) { chrome.tabs.sendMessage(sender.tab.id, { type: 'autoscroll', times: msg.times || 15 }).catch(() => {}); reply({ ok: true }); }
  if (msg.type === 'refreshPages') { refreshPages().then((n) => reply({ ok: true, n })); return true; }
  if (msg.type === 'flushed') { clearTimeout(bt); bt = setTimeout(checkBreakouts, 30000); }
});

// ---------- theo dõi fanpage đối thủ ----------
// Mở lần lượt trang và tab Reels của từng fanpage trong tab nền, cuộn một chút để Facebook tải bài mới.
let refreshing = false;
async function refreshPages() {
  if (refreshing) return 0;
  refreshing = true;
  const { watchPages = [], pages = {} } = await chrome.storage.local.get(['watchPages', 'pages']);
  let n = 0;
  for (const name of watchPages) {
    const slug = pages[name]?.slug;
    if (!slug) continue;
    for (const path of ['', 'reels/']) {
      const tab = await chrome.tabs.create({ url: `https://www.facebook.com/${slug}/${path}`, active: false });
      await new Promise((r) => setTimeout(r, 12000));
      try { await chrome.tabs.sendMessage(tab.id, { type: 'autoscroll', times: 4 }); } catch (_) {}
      await new Promise((r) => setTimeout(r, 14000));
      try { await chrome.tabs.sendMessage(tab.id, { type: 'flushNow' }); } catch (_) {}
      try { await chrome.tabs.remove(tab.id); } catch (_) {}
      await new Promise((r) => setTimeout(r, 4000 + Math.random() * 4000));
    }
    n++;
  }
  await chrome.storage.local.set({ lastRefresh: Date.now() });
  refreshing = false;
  checkBreakouts();
  return n;
}

async function syncAlarm() {
  const { fbSettings = {} } = await chrome.storage.local.get('fbSettings');
  if (fbSettings.autoRefresh) chrome.alarms.create('refreshPages', { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  else chrome.alarms.clear('refreshPages');
}
chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(syncAlarm);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'refreshPages') refreshPages(); });
chrome.storage.onChanged.addListener((ch) => { if (ch.fbSettings) syncAlarm(); });

// Bài/Reels của fanpage đang theo dõi: đăng ≤ 3 ngày và ≥ 3× trung vị của trang (cùng loại)
let bt = null;
async function checkBreakouts() {
  const { watchPages = [], posts = {}, notified = [], fbSettings = {} } = await chrome.storage.local.get(['watchPages', 'posts', 'notified', 'fbSettings']);
  if (fbSettings.notify === false || !watchPages.length) return;
  const done = new Set(notified);
  const now = Date.now() / 1000;
  const isReel = (p) => p.type === 'reel' || p.type === 'video';
  for (const name of watchPages) {
    const ps = Object.values(posts).filter((p) => p.page === name);
    for (const grp of [ps.filter((p) => FBA.metricKind(p) === 'view'), ps.filter((p) => FBA.metricKind(p) === 'eng')]) {
      if (grp.length < 5) continue;
      const med = FBA.median(grp.map(FBA.metric));
      for (const p of grp) {
        if (done.has(p.key) || !p.time || now - p.time > 3 * 86400 || !med || FBA.metric(p) < 3 * med) continue;
        done.add(p.key);
        chrome.notifications.create('fba-' + p.key, {
          type: 'basic', iconUrl: 'icons/icon128.png',
          title: `🔥 ${name}: ${isReel(p) ? 'Reels' : 'bài viết'} bứt phá`,
          message: `${FBA.fmt(FBA.metric(p))} ${FBA.metricKind(p) === 'view' ? 'lượt xem' : 'tương tác'} (gấp ${(FBA.metric(p) / med).toFixed(1)}× trung vị) · ${(p.text || '').slice(0, 70)}`,
        });
      }
    }
  }
  await chrome.storage.local.set({ notified: [...done].slice(-2000) });
}

chrome.notifications.onClicked.addListener((id) => {
  const key = id.replace(/^fba-/, '');
  chrome.storage.local.get('posts', ({ posts = {} }) => { if (posts[key]?.url) chrome.tabs.create({ url: posts[key].url }); });
});

// ================= Phân tích fanpage / tìm từ khoá: chạy trong cửa sổ nhỏ =================
// Cửa sổ nhỏ hiển thị thật (tab nền bị Chrome tạm dừng vẽ nên Facebook không tải thêm bài khi cuộn)
const LOGIN_MSG = '🔑 Cần đăng nhập facebook.com trước (mở facebook.com ở tab thường, đăng nhập), rồi bấm lại.';
const SLOW_MSG = '⛔ Không mở được Facebook trong cửa sổ nhỏ (mạng chậm hoặc Facebook yêu cầu xác minh). Mở facebook.com ở tab thường kiểm tra, rồi thử lại.';
async function pageReady(tabId, ms = 25000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const c = await chrome.tabs.sendMessage(tabId, { type: 'context' }); if (c?.alive) return c; } catch (_) {}
    await sleep(1500);
  }
  return null;
}
async function openWorkWindow(url) {
  // Màn hình nhỏ: Chrome từ chối cửa sổ quá to → lùi dần về kích thước nhỏ hơn
  let w = null, err = null;
  for (const [width, height] of [[560, 900], [520, 640]]) {
    try { w = await chrome.windows.create({ url, type: 'popup', focused: true, width, height, left: 20, top: 20 }); break; } catch (e) { err = e; }
  }
  if (!w) w = await chrome.windows.create({ url, type: 'popup', focused: true }).catch(() => { throw err; });
  return { winId: w.id, tabId: w.tabs[0].id };
}
// Mở url trong cửa sổ làm việc, chờ trang sẵn sàng rồi cuộn (đợi cuộn xong) và ghi dữ liệu
async function visitAndScroll(win, url, times) {
  await chrome.tabs.update(win.tabId, { url });
  await sleep(2500);
  const c = await pageReady(win.tabId);
  if (!c) throw new Error(SLOW_MSG);
  if (c.loggedOut) throw new Error(LOGIN_MSG);
  await sleep(3500);
  try { await chrome.tabs.sendMessage(win.tabId, { type: 'autoscroll', times, wait: true }); } catch (_) { await sleep(times * 3000); }
  try { await chrome.tabs.sendMessage(win.tabId, { type: 'flushNow' }); } catch (_) {}
  await sleep(800);
  return c;
}
const allPosts = async () => Object.values((await chrome.storage.local.get('posts')).posts || {});

// Dán link fanpage: facebook.com/tenpage, facebook.com/profile.php?id=…, fb.com/tenpage hoặc chỉ tên
const RESERVED_SLUG = /^(watch|reel|reels|groups|marketplace|gaming|events|search|stories|photo|photo\.php|permalink\.php|story\.php|ads|settings|login|help|hashtag|share|home\.php)$/i;
function slugOf(input) {
  const s = String(input || '').trim();
  let m = s.match(/(?:facebook|fb)\.com\/profile\.php\?(?:[^#]*&)?id=(\d+)/i);
  if (m) return 'profile.php?id=' + m[1];
  m = s.match(/(?:facebook|fb)\.com\/(?:pg\/)?([\w.\-]+)/i) || s.match(/^@?([\w.\-]{3,})$/);
  return m && !RESERVED_SLUG.test(m[1]) ? m[1] : '';
}
// Trang dạng profile.php?id=… mở tab Reels bằng &sk=reels_tab
const pageUrl = (slug, sub = '') => slug.startsWith('profile.php') ? `https://www.facebook.com/${slug}${sub ? '&sk=reels_tab' : ''}` : `https://www.facebook.com/${slug}/${sub}`;

let pageJob = false;
async function analyzePage(slug, scrolls) {
  if (pageJob) return;
  pageJob = true;
  const setJob = (job) => chrome.storage.local.set({ pgJob: { slug, ...job, t: Date.now() } });
  let win = null;
  try {
    await setJob({ step: 'run', msg: `Đang mở fanpage ${slug} trong cửa sổ nhỏ (để cửa sổ đó mở, đừng thu nhỏ)…` });
    win = await openWorkWindow('about:blank');
    const before = (await allPosts()).length;
    const c = await visitAndScroll(win, pageUrl(slug, 'reels/'), scrolls);
    const name = c.page?.name;
    await setJob({ step: 'run', msg: `Đã cuộn tab Reels${name ? ' của ' + name : ''}. Đang cuộn bài viết…`, page: name });
    const c2 = await visitAndScroll(win, pageUrl(slug), scrolls);
    const page = c2.page?.name || name;
    try { await chrome.windows.remove(win.winId); } catch (_) {}
    win = null;
    const all = await allPosts();
    const n = page ? all.filter((p) => p.page === page).length : 0;
    await setJob({ step: 'done', page, n, msg: n ? `✓ Xong: ${page} có ${n} bài / Reels (+${Math.max(0, all.length - before)} mới lần này).` : 'Không lấy được bài nào. Kiểm tra link fanpage, đăng nhập facebook.com rồi thử lại.' });
  } catch (e) {
    await setJob({ step: 'error', msg: /^(⛔|🔑)/.test(e.message || '') ? e.message : 'Lỗi: ' + (e.message || e) });
  }
  if (win) try { await chrome.windows.remove(win.winId); } catch (_) {}
  pageJob = false;
}

let kwJob = false;
async function searchKeyword(input, scrolls) {
  const keyword = String(input || '').trim();
  if (!keyword || kwJob) return;
  kwJob = true;
  const key = FBA.kwKey(keyword);
  const setJob = (job) => chrome.storage.local.set({ kwJob: { keyword: key, ...job, t: Date.now() } });
  const count = async () => (await allPosts()).filter((p) => p.kw?.includes(key)).length;
  let win = null;
  try {
    const before = await count();
    await setJob({ step: 'run', msg: `Đang tìm video / Reels "${keyword}" trên Facebook trong cửa sổ nhỏ (để cửa sổ đó mở, đừng thu nhỏ)…` });
    win = await openWorkWindow('about:blank');
    const tick = setInterval(async () => setJob({ step: 'run', msg: `Đang cuộn lấy kết quả "${keyword}": ${await count()} video…` }), 5000);
    try { await visitAndScroll(win, `https://www.facebook.com/search/videos/?q=${encodeURIComponent(keyword)}`, scrolls); } finally { clearInterval(tick); }
    try { await chrome.windows.remove(win.winId); } catch (_) {}
    win = null;
    const n = await count();
    const { fbKeywords = {} } = await chrome.storage.local.get('fbKeywords');
    fbKeywords[key] = { t: Date.now(), n };
    await chrome.storage.local.set({ fbKeywords });
    await setJob({ step: 'done', n, msg: n ? `✓ Xong: ${n} video cho "${keyword}" (+${Math.max(0, n - before)} mới lần này).` : 'Không lấy được video nào. Đăng nhập facebook.com, thử từ khoá khác hoặc quét sâu hơn.' });
  } catch (e) {
    await setJob({ step: 'error', msg: /^(⛔|🔑)/.test(e.message || '') ? e.message : 'Lỗi: ' + (e.message || e) });
  }
  if (win) try { await chrome.windows.remove(win.winId); } catch (_) {}
  kwJob = false;
}

// ================= Lời thoại Reels (phụ đề tự động của Facebook) =================
// Có link phụ đề → tải luôn; chưa có → mở Reels trong cửa sổ nhỏ vài giây để Facebook gửi dữ liệu video (kèm link phụ đề)
async function saveTranscript(key, fields) {
  const { posts = {} } = await chrome.storage.local.get('posts');
  if (!posts[key]) return;
  posts[key] = { ...posts[key], ...fields };
  await chrome.storage.local.set({ posts });
}
async function fetchCaptions(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return FBA.parseCaptions(await r.text());
}
async function getTranscript(key) {
  let p = (await chrome.storage.local.get('posts')).posts?.[key];
  if (!p) return { ok: false, error: 'Không tìm thấy bài này trong dữ liệu.' };
  if (typeof p.transcript === 'string' && p.trTried) return { ok: true, transcript: p.transcript };
  if (p.captionsUrl) {
    try { const t = await fetchCaptions(p.captionsUrl); await saveTranscript(key, { transcript: t, trTried: true }); return { ok: true, transcript: t }; } catch (_) {} // link hết hạn → mở lại Reels
  }
  if (!p.url && !p.videoId) return { ok: false, error: 'Bài này không có link video.' };
  let win = null;
  try {
    win = await openWorkWindow(p.type === 'reel' && p.videoId ? `https://www.facebook.com/reel/${p.videoId}` : p.url);
    const c = await pageReady(win.tabId);
    if (!c) throw new Error(SLOW_MSG);
    if (c.loggedOut) throw new Error(LOGIN_MSG);
    await sleep(5000);
    try { await chrome.tabs.sendMessage(win.tabId, { type: 'flushNow' }); } catch (_) {}
    await sleep(800);
  } finally { if (win) try { await chrome.windows.remove(win.winId); } catch (_) {} }
  // Trang Reels lưu video theo khoá v:<id> — có thể khác khoá bài viết đang hỏi
  const posts = (await chrome.storage.local.get('posts')).posts || {};
  const capUrl = posts[key]?.captionsUrl || (p.videoId && posts['v:' + p.videoId]?.captionsUrl);
  let t = '';
  if (capUrl) { try { t = await fetchCaptions(capUrl); } catch (_) {} }
  await saveTranscript(key, { transcript: t, trTried: true });
  return { ok: true, transcript: t };
}
