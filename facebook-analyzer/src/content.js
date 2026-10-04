// Content script trên Facebook: lưu bài viết/Reels, đọc số liệu trên giao diện,
// gắn nhãn tương tác + bứt phá lên từng bài và từng ô Reels, tự cuộn.
(() => {
  const mem = new Map();        // key → bài viết
  const textIndex = new Map();  // nội dung rút gọn → key (để khớp bài trên giao diện với dữ liệu)
  const pending = new Map();
  const removeKeys = new Set();
  let pagePending = null;
  let newCount = 0;
  let timer = null;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const remember = (p) => {
    mem.set(p.key, p);
    const tk = FBA.textKey(p.text);
    if (tk.length >= 15) {
      const old = textIndex.get(tk);
      // Bài đọc từ API thay thế bản tạm đọc từ giao diện
      if (old && old !== p.key && old.startsWith('d:') && p.src === 'api') { removeKeys.add(old); mem.delete(old); }
      if (!old || old.startsWith('d:') || p.src === 'api') textIndex.set(tk, p.key);
    }
  };

  chrome.storage.local.get({ posts: {} }, ({ posts }) => {
    for (const k in posts) if (!mem.has(k)) remember(posts[k]);
    recompute();
    scheduleScan();
  });

  // ---------- nhận dữ liệu ----------
  function queue(list, fromDom) {
    for (const p of list) {
      const prev = mem.get(p.key);
      const m = fromDom ? fillMissing(prev, p) : FBA.merge(prev, p);
      remember(m);
      pending.set(p.key, fromDom ? fillMissing(pending.get(p.key), p) : FBA.merge(pending.get(p.key), p));
    }
    if (list.length) { clearTimeout(timer); timer = setTimeout(flush, 900); recompute(); }
  }
  const fillMissing = (prev, next) => {
    const out = { ...(prev || {}) };
    for (const k in next) if (out[k] == null && next[k] != null) out[k] = next[k];
    return out;
  };

  async function flush() {
    if (!pending.size && !removeKeys.size && !pagePending) return;
    const items = [...pending.values()];
    const del = [...removeKeys];
    const pg = pagePending;
    pending.clear(); removeKeys.clear(); pagePending = null;
    const store = await chrome.storage.local.get({ posts: {}, pages: {} });
    const now = Date.now();
    for (const p of items) {
      const prev = store.posts[p.key];
      if (!prev) newCount++;
      const m = p.src === 'dom' ? fillMissing(prev, p) : FBA.merge(prev, p);
      if (prev?.src === 'api') m.src = 'api';
      const hist = prev?.hist ? [...prev.hist] : [];
      const last = hist[hist.length - 1];
      if (!last || now - last.t > 3600e3) hist.push({ t: now, reactions: m.reactions, comments: m.comments, shares: m.shares, views: m.views });
      if (hist.length > 300) hist.splice(0, hist.length - 300);
      store.posts[p.key] = { ...m, hist, firstSeen: prev?.firstSeen || now, updatedAt: now };
      mem.set(p.key, store.posts[p.key]);
    }
    del.forEach((k) => delete store.posts[k]);
    if (pg) {
      const prev = store.pages[pg.name] || { history: [] };
      const history = prev.history || [];
      const last = history[history.length - 1];
      if (pg.followers != null && (!last || now - last.t > 3600e3)) history.push({ t: now, followers: pg.followers, likes: pg.likes });
      store.pages[pg.name] = { ...FBA.merge(prev, pg), history, updatedAt: now };
    }
    try { await chrome.storage.local.set({ posts: store.posts, pages: store.pages }); } catch (e) { console.warn('[Facebook Analyzer]', e); }
    updateBadge();
    chrome.runtime.sendMessage({ type: 'flushed' }).catch?.(() => {});
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__fba || e.data.kind !== 'api') return;
    for (const j of FBA.parseResponse(e.data.text)) queue(FBA.extract(j));
  });

  // Dữ liệu nhúng sẵn trong trang khi tải lần đầu
  function readEmbedded() {
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      if (s.__fbaDone) continue;
      s.__fbaDone = true;
      const t = s.textContent || '';
      if (t.length < 200 || !/creation_time|short_form_video_context/.test(t)) continue;
      try { queue(FBA.extract(JSON.parse(t))); } catch (_) {}
    }
  }

  // ---------- trang đang xem ----------
  const RESERVED = /^(watch|reel|reels|groups|marketplace|gaming|events|search|stories|photo|photo\.php|permalink\.php|story\.php|ads|settings|notifications|messages|friends|bookmarks|saved|hashtag|pages|business|login|help|privacy|policies|home\.php|me|live|videos)$/i;
  function pageCtx() {
    const u = new URL(location.href);
    const seg = u.pathname.split('/').filter(Boolean);
    let slug = null;
    if (seg[0] === 'profile.php') slug = u.searchParams.get('id');
    else if (seg[0] && !RESERVED.test(seg[0])) slug = seg[0];
    if (!slug) return null;
    const name = document.title.replace(/^\(\d+\+?\)\s*/, '').replace(/\s*[|·-]\s*Facebook\s*$/i, '').trim();
    return { slug, name: name || slug, reels: seg[1] === 'reels' || seg[1] === 'videos' };
  }

  function readPageHeader() {
    const c = pageCtx();
    if (!c || !c.name || /^facebook$/i.test(c.name)) return;
    const head = (document.querySelector('[role="main"]')?.innerText || document.body?.innerText || '').slice(0, 4000);
    const f = head.match(/([\d.,]+\s*(?:K|N|Tr|triệu|M)?)\s*(?:người theo dõi|followers)/i);
    const l = head.match(/([\d.,]+\s*(?:K|N|Tr|triệu|M)?)\s*(?:lượt thích|người thích|likes)/i);
    const info = { name: c.name, slug: c.slug, url: `https://www.facebook.com/${c.slug}`, followers: f ? FBA.parseShort(f[1]) : null, likes: l ? FBA.parseShort(l[1]) : null };
    const key = JSON.stringify(info);
    if (key !== readPageHeader.last) { readPageHeader.last = key; pagePending = info; clearTimeout(timer); timer = setTimeout(flush, 900); }
  }

  // ---------- đọc số liệu trên giao diện + nhãn ----------
  const NUM = '([\\d.,]+\\s*(?:K|N|Tr|triệu|M)?)';
  const RX = {
    reactions: new RegExp(`(?:Tất cả cảm xúc|All reactions)[:：]?\\s*${NUM}`, 'i'),
    comments: new RegExp(`${NUM}\\s*(?:bình luận|comments?)(?![\\p{L}])`, 'iu'),
    shares: new RegExp(`${NUM}\\s*(?:lượt chia sẻ|chia sẻ|shares?)(?![\\p{L}])`, 'iu'),
    views: new RegExp(`${NUM}\\s*(?:lượt xem|views?)(?![\\p{L}])`, 'iu'),
  };
  const grab = (t, k) => { const m = t.match(RX[k]); return m ? FBA.parseShort(m[1]) : null; };
  const hash = (s) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return (h >>> 0).toString(36); };

  const medians = new Map(); // "trang|reel" hoặc "trang|post" → trung vị
  function recompute() {
    const by = {};
    for (const p of mem.values()) {
      const k = `${p.page}|${FBA.metricKind(p)}`;
      (by[k] ||= []).push(FBA.metric(p));
    }
    medians.clear();
    for (const k in by) if (by[k].length >= 3) medians.set(k, FBA.median(by[k]));
    scheduleScan();
  }
  const ratioOf = (p) => {
    const med = medians.get(`${p.page}|${FBA.metricKind(p)}`);
    return med ? FBA.metric(p) / med : null;
  };

  function badgeText(p, r) {
    const parts = [];
    if (r != null && r >= 2) parts.push(`🔥 ${r.toFixed(1)}×`);
    if (p.views) parts.push(`▶ ${FBA.fmt(p.views)}`);
    if (p.reactions != null) parts.push(`👍 ${FBA.fmt(p.reactions)}`);
    if (p.comments != null) parts.push(`💬 ${FBA.fmt(p.comments)}`);
    if (p.shares != null) parts.push(`↗ ${FBA.fmt(p.shares)}`);
    return parts.join(' · ');
  }

  function putBadge(host, p, cls) {
    const r = ratioOf(p);
    const txt = badgeText(p, r);
    if (!txt) return;
    let b = host.querySelector(':scope > .fba-badge');
    if (b && b.textContent === txt) return;
    if (!b) {
      b = document.createElement('div');
      b.className = 'fba-badge ' + cls;
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(b);
    }
    b.textContent = txt;
    b.classList.toggle('fba-hot', r != null && r >= 3);
    b.title = r != null ? `Gấp ${r.toFixed(1)} lần mức trung vị của trang (${FBA.metricKind(p) === 'view' ? 'lượt xem' : 'tương tác'})` : 'Chưa đủ dữ liệu của trang để so sánh';
  }

  let scanTimer = null;
  const scheduleScan = () => { clearTimeout(scanTimer); scanTimer = setTimeout(scan, 700); };

  function scan() {
    if (!document.body) return;
    readEmbedded();
    readPageHeader();
    const ctx = pageCtx();
    const domItems = [];
    // Bài viết trên trang / bảng tin
    for (const a of document.querySelectorAll('[role="article"], div[aria-posinset]')) {
      if (a.parentElement?.closest('[role="article"], div[aria-posinset]')) continue; // bỏ bình luận lồng bên trong
      const label = a.getAttribute('aria-label') || '';
      if (/^(bình luận|comment|trả lời|reply)/i.test(label) || a.offsetHeight < 120) continue;
      const full = a.innerText || '';
      const msgEl = a.querySelector('[data-ad-preview="message"], [data-ad-comet-preview="message"], [data-ad-rendering-role="story_message"]');
      const text = (msgEl?.innerText || '').trim();
      const tk = FBA.textKey(text);
      let p = tk.length >= 15 ? mem.get(textIndex.get(tk)) : null;
      const dom = { reactions: grab(full, 'reactions'), comments: grab(full, 'comments'), shares: grab(full, 'shares'), views: grab(full, 'views') };
      const page = p ? null : (a.querySelector('h2 a, h3 a, h4 a, strong a, [data-ad-rendering-role="profile_name"] a')?.innerText || ctx?.name || '').trim().split('\n')[0];
      const dkey = page ? 'd:' + hash(page + '|' + (tk || full.slice(0, 80))) : null;
      if (!p && dkey && mem.has(dkey)) p = mem.get(dkey);
      if (!p && (text || dom.reactions != null)) {
        if (page && (dom.reactions != null || dom.comments != null)) {
          const isReel = !!a.querySelector('a[href*="/reel/"]');
          const isVideo = !!a.querySelector('video');
          p = { key: dkey, page, text, type: isReel ? 'reel' : isVideo ? 'video' : a.querySelector('img[src*="scontent"]') ? 'photo' : 'text', ...dom, src: 'dom', time: null, hashtags: [...new Set((text.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1).toLowerCase()))] };
          domItems.push(p);
        }
      } else if (p) {
        // bổ sung số liệu còn thiếu từ giao diện
        const need = Object.keys(dom).some((k) => p[k] == null && dom[k] != null);
        if (need) domItems.push({ key: p.key, ...Object.fromEntries(Object.entries(dom).filter(([, v]) => v != null)), src: 'dom' });
      }
      if (p) putBadge(a, mem.get(p.key) || p, 'fba-post');
    }
    // Ô Reels (tab Reels của trang, kết quả tìm kiếm…)
    for (const a of document.querySelectorAll('a[href*="/reel/"]')) {
      if (a.closest('[role="article"], div[aria-posinset]')) continue;
      const id = (a.getAttribute('href').match(/\/reel\/(\d+)/) || [])[1];
      if (!id) continue;
      let p = mem.get('v:' + id);
      // Số lượt xem trên ô Reels: dòng ngắn kết thúc bằng con số, ví dụ "▶ 134,0K" (bỏ qua nhãn của tiện ích)
      const line = (a.innerText || '').split('\n').map((x) => x.trim()).find((x) => x.length <= 16 && !/[·🔥👍💬↗]/u.test(x) && /[\d.,]+\s*(K|N|Tr|triệu|M)?$/i.test(x));
      const views = line ? FBA.parseShort(line.match(/([\d.,]+\s*(?:K|N|Tr|triệu|M)?)$/i)[1]) : null;
      if (!p && views != null && ctx) {
        p = { key: 'v:' + id, videoId: id, page: ctx.name, type: 'reel', views, url: `https://www.facebook.com/reel/${id}`, src: 'dom', text: '', hashtags: [] };
        domItems.push(p);
      } else if (p && p.views == null && views != null) domItems.push({ key: p.key, views, src: 'dom' });
      if (p) putBadge(a, mem.get(p.key) || p, 'fba-reel');
    }
    if (domItems.length) queue(domItems, true);
  }

  const style = document.createElement('style');
  style.textContent = `
    .fba-badge{position:absolute;z-index:3;background:rgba(18,18,20,.85);color:#fff;font:600 11.5px/1.35 system-ui,sans-serif;padding:3px 8px;border-radius:6px;pointer-events:none}
    .fba-badge.fba-post{right:56px;top:12px}
    .fba-badge.fba-reel{left:6px;top:6px;right:6px}
    .fba-badge.fba-hot{box-shadow:0 0 0 2px #f02849}
  `;
  (document.head || document.documentElement).appendChild(style);

  // Nút nổi
  let badge;
  function updateBadge(text) {
    if (!document.body) return;
    if (!badge) {
      badge = document.createElement('div');
      badge.title = 'Facebook Analyzer – bấm để mở Dashboard';
      Object.assign(badge.style, { position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483647, background: '#121214', color: '#fff', font: '600 12px/1 system-ui,sans-serif', padding: '8px 12px', borderRadius: '999px', cursor: 'pointer', boxShadow: '0 2px 10px rgba(0,0,0,.3)', border: '1px solid #1877f2' });
      badge.addEventListener('click', () => chrome.runtime.sendMessage({ type: 'openDashboard', page: pageCtx()?.name }));
      document.body.appendChild(badge);
    }
    badge.textContent = text || `📊 +${newCount} bài mới`;
  }

  // Tự cuộn để Facebook tải thêm bài / Reels
  let scrolling = false;
  async function autoScroll(times) {
    if (scrolling) return;
    scrolling = true;
    let stale = 0;
    for (let i = 0; i < times && scrolling; i++) {
      const h = document.documentElement.scrollHeight;
      window.scrollBy(0, Math.max(800, innerHeight * 1.5));
      await sleep(1800 + Math.random() * 1500);
      updateBadge(`⬇ Đang cuộn ${i + 1}/${times} · +${newCount} bài mới`);
      if (document.documentElement.scrollHeight === h) { if (++stale >= 4) break; } else stale = 0;
    }
    scrolling = false;
    await flush();
    updateBadge();
  }

  function boot() {
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
    let last = location.href;
    setInterval(() => { if (location.href !== last) { last = location.href; readPageHeader.last = null; scheduleScan(); } }, 1000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type === 'context') reply({ page: pageCtx(), newCount });
    if (m.type === 'autoscroll') { autoScroll(m.times || 30); reply({ ok: true }); }
    if (m.type === 'stopScroll') { scrolling = false; reply({ ok: true }); }
    if (m.type === 'flushNow') { scan(); setTimeout(() => flush().then(() => reply({ ok: true })), 1200); return true; }
  });
})();
