// Content script: nhận dữ liệu từ inject.js + dữ liệu nhúng sẵn trong trang,
// lưu vào chrome.storage.local, gắn nhãn lên lưới video, tự cuộn và lấy bình luận.
(() => {
  const pending = { videos: new Map(), users: new Map(), comments: new Map(), products: new Map(), adSeen: new Map() };
  const mem = new Map(); // video đã biết (để gắn nhãn)
  let sessionCount = 0;
  let timer = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Nạp sẵn dữ liệu cũ để gắn nhãn ngay cả với video đã lưu từ trước
  chrome.storage.local.get({ videos: {} }, ({ videos }) => {
    for (const id in videos) if (!mem.has(id)) mem.set(id, videos[id]);
    recomputeMedians();
    scheduleDecorate();
  });

  function queue({ videos, users, comments = [], products = [] }) {
    videos.forEach((v) => {
      pending.videos.set(v.id, { ...pending.videos.get(v.id), ...v });
      mem.set(v.id, { ...mem.get(v.id), ...v });
      if (v.isAd) pending.adSeen.set(v.id, (pending.adSeen.get(v.id) || 0) + 1);
      // sản phẩm gắn giỏ trong video → danh sách sản phẩm
      (v.products || []).forEach((p) => p.pid && !p.pid.startsWith('ec-') && addProduct({ pid: p.pid, productId: p.productId, title: p.title, price: p.priceNum, sold: p.sold }));
    });
    products.forEach(addProduct);
    users.forEach((u) => pending.users.set(u.uniqueId, u));
    comments.forEach((c) => pending.comments.set(c.cid, c));
    if (videos.length || users.length || comments.length || products.length) {
      clearTimeout(timer);
      timer = setTimeout(flush, 800);
      if (videos.length) { recomputeMedians(); scheduleDecorate(); }
    }
  }

  function addProduct(p) {
    const prev = pending.products.get(p.pid) || {};
    const out = { ...prev };
    for (const k in p) if (p[k] != null && p[k] !== '') out[k] = p[k];
    pending.products.set(p.pid, out);
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  }

  function flush() {
    if (!pending.videos.size && !pending.users.size && !pending.comments.size && !pending.products.size) return;
    const newProducts = [...pending.products.values()];
    const adSeen = new Map(pending.adSeen);
    pending.products.clear(); pending.adSeen.clear();
    const newVideos = [...pending.videos.values()];
    const newUsers = [...pending.users.values()];
    const newComments = [...pending.comments.values()];
    pending.videos.clear(); pending.users.clear(); pending.comments.clear();
    const byVid = {};
    newComments.forEach((c) => (byVid[c.vid] ||= []).push(c));
    const cKeys = Object.keys(byVid).map((v) => 'c:' + v);
    chrome.storage.local.get({ videos: {}, users: {}, products: {}, ...Object.fromEntries(cKeys.map((k) => [k, []])) }, (store) => {
      const now = Date.now();
      // Sản phẩm: lưu lịch sử "đã bán" để tính tốc độ bán (tối đa 1 mốc/giờ, hoặc khi số thay đổi)
      for (const p of newProducts) {
        const prev = store.products[p.pid] || {};
        const m = { ...prev };
        for (const k in p) if (p[k] != null && p[k] !== '') m[k] = p[k];
        const hist = prev.hist ? [...prev.hist] : [];
        const last = hist[hist.length - 1];
        if (m.sold != null && (!last || (now - last.t > 3600e3) || last.sold !== m.sold)) hist.push({ t: now, sold: m.sold, price: m.price });
        if (hist.length > 300) hist.splice(0, hist.length - 300);
        store.products[p.pid] = { ...m, hist, firstSeen: prev.firstSeen || now, updatedAt: now };
      }
      for (const v of newVideos) {
        const prev = store.videos[v.id];
        if (!prev) sessionCount++;
        // Lịch sử số liệu từng video (tối đa 1 mốc/giờ) để tính tốc độ tăng view
        const hist = prev?.hist ? [...prev.hist] : [];
        const last = hist[hist.length - 1];
        if (!last || now - last.t > 3600e3) hist.push({ t: now, views: v.views, likes: v.likes, comments: v.comments, shares: v.shares });
        if (hist.length > 300) hist.splice(0, hist.length - 300);
        // Giữ lại các trường chỉ có ở bản cũ (lời thoại, sản phẩm…) nếu bản mới không có
        const merged = { ...prev, ...v, hist };
        // Quảng cáo: đếm số lần bắt gặp video này dưới dạng quảng cáo khi lướt
        if (adSeen.has(v.id)) {
          merged.adSeen = (prev?.adSeen || 0) + adSeen.get(v.id);
          merged.adFirst = prev?.adFirst || now;
          merged.adLast = now;
        }
        if (prev?.adSeen && !v.isAd) { merged.adSeen = prev.adSeen; merged.adFirst = prev.adFirst; merged.adLast = prev.adLast; }
        if (prev?.products?.length && !v.products?.length) merged.products = prev.products;
        if (prev?.hasSpeech && !v.hasSpeech) merged.hasSpeech = true;
        if (prev?.authorFollowers && v.authorFollowers == null) merged.authorFollowers = prev.authorFollowers;
        store.videos[v.id] = merged;
        mem.set(v.id, merged);
      }
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
      const out = { videos: store.videos, users: store.users, products: store.products };
      for (const vid in byVid) {
        const prev = store['c:' + vid] || [];
        const ids = new Set(prev.map((c) => c.cid));
        out['c:' + vid] = prev.concat(byVid[vid].filter((c) => !ids.has(c.cid)));
      }
      chrome.storage.local.set(out, () => {
        if (chrome.runtime.lastError) console.warn('[TikTok Analyzer]', chrome.runtime.lastError.message);
        updateBadge();
        chrome.runtime.sendMessage({ type: 'flushed' }).catch?.(() => {});
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

  // ---------- trang chi tiết sản phẩm TikTok Shop ----------
  const productIdFromUrl = () => (location.href.match(/\/product\/(\d{12,22})/) || [])[1] || '';
  function readProductPage() {
    const pid = productIdFromUrl();
    if (!pid) return;
    for (const s of document.querySelectorAll('script[type="application/json"], script#__MODERN_ROUTER_DATA__, script#__NEXT_DATA__')) {
      if (s.__ttaDone || !(s.textContent || '').includes(pid)) continue;
      s.__ttaDone = true;
      try { queue({ videos: [], users: [], products: TTA.extract(JSON.parse(s.textContent)).products }); } catch (_) {}
    }
    // Dự phòng: đọc tên, giá, "đã bán" ngay trên giao diện
    const text = document.body?.innerText || '';
    const sold = text.match(/([\d.,]+\s*[KkMN]?\+?)\s*(?:đã bán|sold)/i);
    const price = text.match(/₫\s*([\d.,]+)|([\d.,]+)\s*₫/);
    const title = (document.querySelector('h1')?.innerText || document.title.split('|')[0] || '').trim();
    if (sold || price) {
      queue({ videos: [], users: [], products: [{ pid, productId: pid, title: title || null, sold: sold ? TTA.parseCount(sold[1]) : null, price: price ? TTA.parseMoney(price[1] || price[2]) : null, url: location.href }] });
    }
  }
  if (/\/product\/\d/.test(location.href)) {
    const run = () => { readProductPage(); setTimeout(readProductPage, 3000); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
  }

  // ---------- nhãn trên lưới video ----------
  const medians = new Map(); // view trung vị theo kênh
  function recomputeMedians() {
    const by = {};
    for (const v of mem.values()) if (v.author) (by[v.author] ||= []).push(v.views);
    medians.clear();
    for (const a in by) if (by[a].length >= 3) medians.set(a, TTA.median(by[a]));
  }

  let decoTimer = null;
  const scheduleDecorate = () => { clearTimeout(decoTimer); decoTimer = setTimeout(decorate, 500); };

  function decorate() {
    for (const a of document.querySelectorAll('a[href*="/video/"]')) {
      const id = (a.getAttribute('href').match(/\/video\/(\d+)/) || [])[1];
      const v = id && mem.get(id);
      if (!v) continue;
      const med = medians.get(v.author);
      const ratio = med ? v.views / med : null;
      const sig = `${v.views}|${ratio?.toFixed(1)}`;
      let b = a.querySelector(':scope .tta-badge');
      if (b && b.dataset.sig === sig) continue;
      if (!b) {
        b = document.createElement('div');
        b.className = 'tta-badge';
        const host = a.querySelector('div') || a;
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
        host.appendChild(b);
      }
      b.dataset.sig = sig;
      const parts = [`ER ${TTA.pct(TTA.er(v))}`, `↗ ${TTA.fmt(v.shares)}`, `🔖 ${TTA.fmt(v.saves)}`];
      if (ratio != null && ratio >= 2) parts.unshift(`🔥 ${ratio.toFixed(1)}×`);
      if (v.products?.length) parts.push('🛒');
      b.textContent = parts.join(' · ');
      b.classList.toggle('tta-hot', ratio != null && ratio >= 3);
      b.title = ratio != null ? `Gấp ${ratio.toFixed(1)} lần lượt xem trung vị của @${v.author}` : '';
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    .tta-badge{position:absolute;left:4px;top:4px;right:4px;z-index:3;background:rgba(18,18,20,.82);color:#fff;font:600 11px/1.3 system-ui,sans-serif;padding:3px 6px;border-radius:6px;pointer-events:none;white-space:normal}
    .tta-badge.tta-hot{box-shadow:0 0 0 2px #fe2c55}
  `;
  (document.head || document.documentElement).appendChild(style);

  // Nút nổi nhỏ hiển thị số video đã thu thập trong phiên.
  let badge;
  function updateBadge(text) {
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
    badge.textContent = text || `📊 +${sessionCount} video mới`;
  }

  const currentProfile = () => (location.pathname.match(/^\/@([^/?]+)/) || [])[1] || '';
  const currentVideo = () => (location.pathname.match(/\/video\/(\d+)/) || [])[1] || '';

  // Tự cuộn trang để TikTok tải thêm video (dữ liệu được thu thập trong lúc cuộn).
  let scrolling = false;
  async function autoScroll(times) {
    if (scrolling) return;
    scrolling = true;
    let stale = 0;
    for (let i = 0; i < times && scrolling; i++) {
      const h = document.documentElement.scrollHeight;
      window.scrollTo(0, h);
      await sleep(1500 + Math.random() * 1000);
      if (document.documentElement.scrollHeight === h) { if (++stale >= 3) break; } else stale = 0;
    }
    scrolling = false;
  }

  // ---------- lấy bình luận: mở khung bình luận rồi cuộn để TikTok tải thêm ----------
  function commentScroller() {
    const item = document.querySelector('[data-e2e="comment-level-1"], [class*="CommentItemContainer"], [class*="DivCommentItemWrapper"]');
    let el = item?.parentElement;
    while (el && el !== document.body) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 20) return el;
      el = el.parentElement;
    }
    return item ? document.scrollingElement : null;
  }

  async function collectComments(max) {
    const vid = currentVideo();
    if (!vid) { updateBadge('⚠️ Hãy mở 1 video trước'); return; }
    if (!commentScroller()) {
      const btn = document.querySelector('[data-e2e="comment-icon"], [data-e2e="browse-comment-icon"], button[aria-label*="omment"]');
      btn?.click();
      await sleep(2500);
    }
    scrolling = true;
    let stale = 0, lastCount = -1;
    while (scrolling) {
      const sc = commentScroller();
      if (!sc) { updateBadge('⚠️ Không tìm thấy khung bình luận'); break; }
      sc.scrollTop = sc.scrollHeight;
      await sleep(1500 + Math.random() * 1200);
      flush();
      const { ['c:' + vid]: list = [] } = await chrome.storage.local.get('c:' + vid);
      updateBadge(`💬 Đã lấy ${list.length} bình luận…`);
      if (list.length >= max) break;
      if (list.length === lastCount) { if (++stale >= 4) break; } else stale = 0;
      lastCount = list.length;
    }
    scrolling = false;
    await sleep(1000);
    flush();
    const { ['c:' + vid]: list = [] } = await chrome.storage.local.get('c:' + vid);
    updateBadge(`✓ ${list.length} bình luận · xem ở Dashboard → Bình luận`);
  }

  // Bắt đầu theo dõi nhãn khi trang sẵn sàng
  const startObserver = () => new MutationObserver(scheduleDecorate).observe(document.body, { childList: true, subtree: true });
  if (document.body) startObserver(); else document.addEventListener('DOMContentLoaded', startObserver);

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'context') reply({ profile: currentProfile(), video: currentVideo(), sessionCount, url: location.href });
    if (msg.type === 'autoscroll') { autoScroll(msg.times || 20); reply({ ok: true }); }
    if (msg.type === 'stopScroll') { scrolling = false; reply({ ok: true }); }
    if (msg.type === 'comments') { collectComments(msg.max || 500); reply({ ok: true }); }
    if (msg.type === 'flushNow') { readProductPage(); setTimeout(() => { flush(); setTimeout(() => reply({ ok: true }), 1500); }, 300); return true; }
  });
})();
