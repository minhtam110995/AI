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
        const { playUrls, ...toStore } = merged; // địa chỉ phát có hạn dùng, chỉ giữ trong phiên
        store.videos[v.id] = toStore;
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

  // ---------- xem video gắn giỏ bị chặn trên web ----------
  const BLOCKED = /(chỉ (có thể )?xem (được )?trên ứng dụng|không (khả dụng|xem được|hỗ trợ) (trên|ở) (web|máy tính|trình duyệt)|xem (video )?(này )?trên ứng dụng tiktok|not available on (the )?web|only (available|viewable) (on|in) the (tiktok )?app|watch (it )?(on|in) the (tiktok )?app|open (it )?in the tiktok app)/i;
  function videoIdNear(el) {
    const onPage = (location.pathname.match(/\/video\/(\d+)/) || [])[1];
    let node = el;
    for (let i = 0; i < 12 && node && node !== document.body; i++) {
      const a = node.querySelector?.('a[href*="/video/"]');
      const id = (a?.getAttribute('href').match(/\/video\/(\d+)/) || [])[1] || (node.id?.match(/(\d{15,22})/) || [])[1];
      if (id) return id;
      node = node.parentElement;
    }
    return onPage || null;
  }
  function fixBlocked() {
    if (!document.body) return;
    // Duyệt các đoạn chữ ngắn (nhanh hơn đọc nội dung của từng khối lớn)
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.nodeValue.length > 8 && n.nodeValue.length < 220 && BLOCKED.test(n.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP),
    });
    const hits = [];
    while (walker.nextNode()) hits.push(walker.currentNode.parentElement);
    for (const el of hits) {
      if (!el || el.dataset.ttaPlay || el.closest('#tta-player')) continue;
      const id = videoIdNear(el);
      if (!id) continue;
      el.dataset.ttaPlay = id;
      const btn = document.createElement('button');
      btn.className = 'tta-play';
      btn.textContent = '▶ Xem trên máy tính (TikTok Analyzer)';
      btn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); openPlayer(id); }, true);
      el.insertAdjacentElement('afterend', btn);
    }
  }

  const escH = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function productLinks(v, products) {
    const real = (products || []).filter((p) => p.productId);
    const words = String(v.desc || '').replace(/#\S+/g, '').trim().split(/\s+/).slice(0, 8).join(' ');
    if (real.length) {
      return real.map((p) => `<a href="https://shop.tiktok.com/view/product/${p.productId}?region=VN&locale=vi-VN" target="_blank">🛒 ${escH(p.title)}${p.priceNum ? ' · ' + p.priceNum.toLocaleString('vi-VN') + 'đ' : ''}</a>`).join('');
    }
    return `<span>🛒 TikTok không gửi tên sản phẩm của video này lên web.</span>
      ${words ? `<a href="https://www.tiktok.com/search?q=${encodeURIComponent(words)}" target="_blank">🔎 Tìm sản phẩm theo nội dung video</a>` : ''}
      ${v.author ? `<a href="https://www.tiktok.com/@${encodeURIComponent(v.author)}" target="_blank">👤 Xem kênh @${escH(v.author)} (tab Cửa hàng nếu có)</a>` : ''}`;
  }

  async function openPlayer(id) {
    document.getElementById('tta-player')?.remove();
    const v = mem.get(id) || { id };
    const link = `https://www.tiktok.com/@${v.author || '_'}/video/${id}`;
    const box = document.createElement('div');
    box.id = 'tta-player';
    box.innerHTML = `<div class="tta-pl-inner"><div class="tta-pl-head"><span>▶ ${v.author ? '@' + escH(v.author) + ' · ' : ''}${escH(String(v.desc || '').slice(0, 80))}</span><button class="tta-pl-x" title="Đóng">✕</button></div>
      <div class="tta-pl-stage"><video controls autoplay playsinline ${v.cover ? `poster="${escH(v.cover)}"` : ''}></video></div>
      <div class="tta-pl-msg">Đang tải video…</div><div class="tta-pl-alt"></div>
      <div class="tta-pl-prod">${productLinks(v, v.products)}</div></div>`;
    document.body.appendChild(box);
    const close = () => { box.querySelector('video')?.pause(); box.remove(); document.removeEventListener('keydown', esc); };
    const esc = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', esc);
    box.querySelector('.tta-pl-x').onclick = close;
    box.addEventListener('click', (e) => { if (e.target === box) close(); });
    const stage = box.querySelector('.tta-pl-stage');
    const video = box.querySelector('video');
    const msg = box.querySelector('.tta-pl-msg');
    const alt = box.querySelector('.tta-pl-alt');
    const diag = { id, fromPage: (v.playUrls || []).length, tried: [], fresh: null, products: (v.products || []).map((p) => p.productId || p.pid) };
    let urls = [...(v.playUrls || [])];
    let fresh = false, cur = null, timer = null;
    const triedUrls = new Set();

    const embed = (src) => {
      video.pause(); video.removeAttribute('src');
      stage.innerHTML = `<iframe src="${src}" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe>`;
    };
    const giveUp = () => {
      msg.innerHTML = `⚠️ Không phát trực tiếp được (${diag.tried.length ? diag.tried.length + ' địa chỉ đều bị TikTok từ chối' : 'TikTok không gửi địa chỉ video này lên web'}). Thử các cách dưới đây:`;
      alt.innerHTML = `<button data-a="p1">Trình phát nhúng 1</button><button data-a="p2">Trình phát nhúng 2</button><button data-a="copy">📱 Copy link mở trên điện thoại</button><button data-a="diag">📋 Copy chẩn đoán</button>`;
      alt.onclick = (e) => {
        const a = e.target.dataset?.a;
        if (a === 'p1') embed(`https://www.tiktok.com/player/v1/${id}?autoplay=1&controls=1&description=1`);
        if (a === 'p2') embed(`https://www.tiktok.com/embed/v2/${id}`);
        if (a === 'copy') navigator.clipboard.writeText(link).then(() => (e.target.textContent = '✓ Đã copy link'));
        if (a === 'diag') navigator.clipboard.writeText(JSON.stringify({ ...diag, version: chrome.runtime.getManifest().version }, null, 1)).then(() => (e.target.textContent = '✓ Đã copy, dán gửi người hỗ trợ'));
      };
    };
    const tryNext = async (reason) => {
      clearTimeout(timer);
      if (cur) diag.tried.push({ host: (() => { try { return new URL(cur).host; } catch (_) { return '?'; } })(), reason, code: video.error?.code || null });
      if (!urls.length && !fresh) {
        fresh = true;
        msg.textContent = 'Đang tìm địa chỉ video ở nguồn khác…';
        const r = await chrome.runtime.sendMessage({ type: 'getPlayUrls', id, author: v.author }).catch(() => null);
        diag.fresh = r?.diag || null;
        if (r?.urls?.length) urls = r.urls.filter((u) => !triedUrls.has(u));
        if (r?.products?.length) box.querySelector('.tta-pl-prod').innerHTML = productLinks(v, r.products);
      }
      cur = urls.shift();
      if (!cur) { giveUp(); return; }
      triedUrls.add(cur);
      msg.textContent = `Đang phát (nguồn ${diag.tried.length + 1})…`;
      video.src = cur;
      video.play().catch(() => {});
      timer = setTimeout(() => { if (video.readyState < 2) tryNext('timeout'); }, 9000); // treo quá lâu → nguồn tiếp
    };
    video.addEventListener('error', () => tryNext('error'));
    const ok = () => { clearTimeout(timer); msg.textContent = ''; };
    video.addEventListener('playing', ok);
    video.addEventListener('loadeddata', ok);
    tryNext();
  }

  function decorate() {
    fixBlocked();
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
    .tta-play{display:block;margin:12px auto 0;padding:10px 16px;border:0;border-radius:999px;background:#fe2c55;color:#fff;font:700 14px system-ui,sans-serif;cursor:pointer;position:relative;z-index:20;pointer-events:auto}
    #tta-player{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center}
    #tta-player .tta-pl-inner{background:#121214;border-radius:12px;padding:10px;width:min(440px,92vw);color:#fff;font:13px system-ui,sans-serif}
    #tta-player .tta-pl-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px}
    #tta-player .tta-pl-head span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    #tta-player .tta-pl-x{background:#333;color:#fff;border:0;border-radius:6px;padding:4px 10px;cursor:pointer}
    #tta-player video,#tta-player iframe{width:100%;aspect-ratio:9/16;max-height:78vh;background:#000;border:0;border-radius:8px;display:block}
    #tta-player .tta-pl-msg{color:#bbb;font-size:12px;margin-top:6px;min-height:14px}
    #tta-player .tta-pl-stage video,#tta-player .tta-pl-stage iframe{width:100%;aspect-ratio:9/16;max-height:74vh;background:#000;border:0;border-radius:8px;display:block}
    #tta-player .tta-pl-alt{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
    #tta-player .tta-pl-alt button{background:#2a2a2e;color:#fff;border:1px solid #444;border-radius:6px;padding:5px 9px;font:600 12px system-ui;cursor:pointer}
    #tta-player .tta-pl-prod{margin-top:8px;display:grid;gap:4px;font-size:12.5px}
    #tta-player .tta-pl-prod a{color:#25f4ee;text-decoration:none}
    #tta-player .tta-pl-prod a:hover{text-decoration:underline}
    #tta-player .tta-pl-prod span{color:#bbb}
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
    if (msg.type === 'play') { const id = msg.id || currentVideo(); if (id) openPlayer(id); reply({ ok: !!id }); }
    if (msg.type === 'flushNow') { readProductPage(); setTimeout(() => { flush(); setTimeout(() => reply({ ok: true }), 1500); }, 300); return true; }
  });
})();
