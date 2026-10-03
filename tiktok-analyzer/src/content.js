// Content script: nhận dữ liệu từ inject.js + dữ liệu nhúng sẵn trong trang,
// gộp lại và lưu vào chrome.storage.local.
(() => {
  const pending = { videos: new Map(), users: new Map() };
  let sessionCount = 0;
  let timer = null;

  function queue({ videos, users }) {
    videos.forEach((v) => pending.videos.set(v.id, v));
    users.forEach((u) => pending.users.set(u.uniqueId, u));
    if (videos.length || users.length) {
      clearTimeout(timer);
      timer = setTimeout(flush, 800);
    }
  }

  function flush() {
    if (!pending.videos.size && !pending.users.size) return;
    const newVideos = [...pending.videos.values()];
    const newUsers = [...pending.users.values()];
    pending.videos.clear();
    pending.users.clear();
    chrome.storage.local.get({ videos: {}, users: {} }, (store) => {
      for (const v of newVideos) {
        if (!store.videos[v.id]) sessionCount++;
        store.videos[v.id] = { ...store.videos[v.id], ...v };
      }
      const now = Date.now();
      for (const u of newUsers) {
        const prev = store.users[u.uniqueId] || { history: [] };
        const history = prev.history || [];
        const last = history[history.length - 1];
        // Lưu lịch sử follower để theo dõi tăng trưởng (tối đa 1 mốc/giờ).
        if (!last || now - last.t > 3600e3) {
          history.push({ t: now, followers: u.followers, hearts: u.hearts, videoCount: u.videoCount });
          if (history.length > 1000) history.shift();
        }
        store.users[u.uniqueId] = { ...prev, ...u, history, updatedAt: now };
      }
      chrome.storage.local.set(store, () => {
        if (chrome.runtime.lastError) console.warn('[TikTok Analyzer]', chrome.runtime.lastError.message);
        updateBadge();
      });
    });
  }

  // Dữ liệu nhúng sẵn khi tải trang (trang kênh, trang video).
  function readHydration() {
    for (const id of ['__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE', '__NEXT_DATA__']) {
      const el = document.getElementById(id);
      if (!el?.textContent) continue;
      try { queue(TTA.extract(JSON.parse(el.textContent))); } catch (_) {}
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__tta || e.data.kind !== 'api') return;
    queue(TTA.extract(e.data.data));
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', readHydration);
  else readHydration();

  // Nút nổi nhỏ hiển thị số video đã thu thập trong phiên.
  let badge;
  function updateBadge() {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.title = 'TikTok Analyzer – bấm để mở Dashboard';
      Object.assign(badge.style, {
        position: 'fixed', right: '16px', bottom: '16px', zIndex: 2147483647,
        background: '#121214', color: '#fff', font: '600 12px/1 system-ui, sans-serif',
        padding: '8px 12px', borderRadius: '999px', cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0,0,0,.3)', border: '1px solid #25f4ee',
      });
      badge.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openDashboard', author: currentProfile() }));
      document.body.appendChild(badge);
    }
    badge.textContent = `📊 +${sessionCount} video mới`;
  }

  const currentProfile = () => (location.pathname.match(/^\/@([^/?]+)/) || [])[1] || '';

  // Tự cuộn trang để TikTok tải thêm video (dữ liệu được thu thập trong lúc cuộn).
  let scrolling = false;
  async function autoScroll(times) {
    if (scrolling) return;
    scrolling = true;
    let stale = 0;
    for (let i = 0; i < times && scrolling; i++) {
      const h = document.documentElement.scrollHeight;
      window.scrollTo(0, h);
      await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1000));
      if (document.documentElement.scrollHeight === h) { if (++stale >= 3) break; } else stale = 0;
    }
    scrolling = false;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'context') reply({ profile: currentProfile(), sessionCount, url: location.href });
    if (msg.type === 'autoscroll') { autoScroll(msg.times || 20); reply({ ok: true }); }
    if (msg.type === 'stopScroll') { scrolling = false; reply({ ok: true }); }
  });
})();
