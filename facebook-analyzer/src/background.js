importScripts('common.js');

chrome.runtime.onMessage.addListener((msg, _s, reply) => {
  if (msg.type === 'openDashboard') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + (msg.page ? '?page=' + encodeURIComponent(msg.page) : '')) });
  }
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
