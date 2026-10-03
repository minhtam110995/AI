// Content script trên shopee.vn: ghi dữ liệu, gắn nhãn phân tích lên trang,
// tự quét nhiều trang kết quả, lấy đánh giá và thanh công cụ ở trang sản phẩm.
(() => {
  const mem = new Map(); // sản phẩm đã thấy trong phiên (để gắn nhãn nhanh)
  const pending = { products: new Map(), shops: new Map(), reviews: new Map(), keywords: new Map() };
  let watch = new Set();
  let newCount = 0;
  let timer = null;

  chrome.storage.local.get('watch', (r) => { watch = new Set(r.watch || []); });
  chrome.storage.onChanged.addListener((ch) => { if (ch.watch) { watch = new Set(ch.watch.newValue || []); decorate(true); } });

  // ---------- nhận dữ liệu ----------
  function onData(apiUrl, json) {
    const { products, shops, reviews } = SPA.extract(json);
    products.forEach((p) => { pending.products.set(p.key, SPA.merge(pending.products.get(p.key), p)); mem.set(p.key, SPA.merge(mem.get(p.key), p)); });
    shops.forEach((s) => pending.shops.set(s.shopid, SPA.merge(pending.shops.get(s.shopid), s)));
    reviews.forEach((r) => pending.reviews.set(r.id, r));
    // Ghi nhớ thứ hạng sản phẩm theo từ khoá tìm kiếm
    try {
      const u = new URL(apiUrl);
      const kw = (u.searchParams.get('keyword') || '').trim().toLowerCase();
      if (kw && /search_items/.test(u.pathname) && products.length) {
        const offset = Number(u.searchParams.get('newest') || 0);
        const k = pending.keywords.get(kw) || {};
        products.forEach((p, i) => { if (!(p.key in k)) k[p.key] = offset + i + 1; });
        pending.keywords.set(kw, k);
      }
    } catch (_) {}
    if (products.length || shops.length || reviews.length) {
      clearTimeout(timer);
      timer = setTimeout(flush, 700);
      scheduleDecorate();
    }
  }

  async function flush() {
    const P = [...pending.products.values()], S = [...pending.shops.values()], R = [...pending.reviews.values()], K = [...pending.keywords.entries()];
    pending.products.clear(); pending.shops.clear(); pending.reviews.clear(); pending.keywords.clear();
    const keys = [...P.map((p) => 'p:' + p.key), ...S.map((s) => 's:' + s.shopid), ...K.map(([k]) => 'k:' + k), ...new Set(R.map((r) => 'r:' + r.key))];
    if (!keys.length) return;
    const cur = await chrome.storage.local.get(keys);
    const out = {};
    const now = Date.now();
    for (const p of P) {
      const prev = cur['p:' + p.key];
      if (!prev) newCount++;
      const m = SPA.merge(prev, p);
      const hist = prev?.hist ? [...prev.hist] : [];
      const last = hist[hist.length - 1];
      const snap = { t: now, price: m.price, sold30: m.sold30, hsold: m.hsold, stock: m.stock, rc: m.ratingCount };
      // Lưu lịch sử: tối đa 1 mốc/giờ, hoặc ngay khi giá/tồn kho thay đổi
      if (!last || now - last.t > 3600e3 || last.price !== snap.price || last.stock !== snap.stock) hist.push(snap);
      if (hist.length > 500) hist.splice(0, hist.length - 500);
      out['p:' + p.key] = { ...m, hist, firstSeen: prev?.firstSeen || now, updatedAt: now };
    }
    for (const s of S) out['s:' + s.shopid] = { ...SPA.merge(cur['s:' + s.shopid], s), updatedAt: now };
    for (const [kw, ranks] of K) {
      const prev = cur['k:' + kw] || { keyword: kw, items: {} };
      out['k:' + kw] = { keyword: kw, items: { ...prev.items, ...ranks }, updatedAt: now };
    }
    const byKey = {};
    R.forEach((r) => (byKey[r.key] ||= []).push(r));
    for (const k in byKey) {
      const prev = cur['r:' + k] || [];
      const ids = new Set(prev.map((r) => r.id));
      out['r:' + k] = prev.concat(byKey[k].filter((r) => !ids.has(r.id)));
    }
    try { await chrome.storage.local.set(out); } catch (e) { console.warn('[Shopee Analyzer]', e); }
    updatePanel();
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__spa || e.data.kind !== 'api') return;
    onData(e.data.url, e.data.data);
  });

  // ---------- nhãn phân tích trên thẻ sản phẩm ----------
  const ID_RE = /-i\.(\d+)\.(\d+)|\/product\/(\d+)\/(\d+)/;
  const keyFromHref = (href) => {
    const m = String(href || '').match(ID_RE);
    return m ? `${m[1] || m[3]}_${m[2] || m[4]}` : null;
  };
  let decoTimer = null;
  const scheduleDecorate = () => { clearTimeout(decoTimer); decoTimer = setTimeout(() => decorate(false), 400); };

  function badgeHTML(p) {
    const r = SPA.rev30(p);
    const age = SPA.ageDays(p.ctime);
    const parts = [];
    if (r != null) parts.push(`💰 ${SPA.fmt(r)}/th`);
    if (p.sold30 != null) parts.push(`🛒 ${SPA.fmt(p.sold30)}/th`);
    if (p.ratingCount != null) parts.push(`⭐ ${p.rating ? p.rating.toFixed(1) : '–'} (${SPA.fmt(p.ratingCount)})`);
    if (age != null) parts.push(`📅 ${age < 60 ? age + ' ngày' : Math.round(age / 30) + ' th'}`);
    return parts.join(' · ');
  }

  function decorate(force) {
    const anchors = document.querySelectorAll('a[href*="-i."], a[href*="/product/"]');
    for (const a of anchors) {
      const key = keyFromHref(a.getAttribute('href'));
      if (!key) continue;
      const p = mem.get(key);
      if (!p) continue;
      let b = a.querySelector(':scope > .spa-badge');
      if (b && !force && b.dataset.v === String(p.sold30) + watch.has(key)) continue;
      if (!b) {
        b = document.createElement('div');
        b.className = 'spa-badge';
        if (getComputedStyle(a).position === 'static') a.style.position = 'relative';
        a.appendChild(b);
      }
      b.dataset.v = String(p.sold30) + watch.has(key);
      b.innerHTML = `<span class="spa-star" title="Theo dõi sản phẩm" data-key="${key}">${watch.has(key) ? '★' : '☆'}</span> ${badgeHTML(p)}`;
      const isNew = SPA.ageDays(p.ctime) != null && SPA.ageDays(p.ctime) <= 90 && (p.sold30 || 0) >= 100;
      b.classList.toggle('spa-hot', isNew);
      if (isNew) b.title = 'Sản phẩm mới (≤ 90 ngày) nhưng bán chạy';
    }
  }

  document.addEventListener('click', (e) => {
    const star = e.target.closest?.('.spa-star');
    if (!star) return;
    e.preventDefault(); e.stopPropagation();
    toggleWatch(star.dataset.key);
  }, true);

  function toggleWatch(key) {
    chrome.storage.local.get('watch', (r) => {
      const w = new Set(r.watch || []);
      w.has(key) ? w.delete(key) : w.add(key);
      chrome.storage.local.set({ watch: [...w] });
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    .spa-badge{position:absolute;left:4px;right:4px;top:4px;z-index:5;background:rgba(18,18,20,.86);color:#fff;font:600 11px/1.35 system-ui,sans-serif;padding:4px 6px;border-radius:6px;pointer-events:auto;text-align:left;white-space:normal}
    .spa-badge.spa-hot{box-shadow:0 0 0 2px #ee4d2d}
    .spa-star{cursor:pointer;color:#ffce3d;font-size:13px}
    #spa-panel{position:fixed;right:16px;bottom:16px;z-index:2147483647;width:300px;background:#fff;color:#111;border:1px solid #e5e5e5;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.18);font:13px/1.45 system-ui,sans-serif}
    #spa-panel header{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:#ee4d2d;color:#fff;border-radius:12px 12px 0 0;font-weight:700;cursor:pointer}
    #spa-panel .body{padding:10px 12px;display:grid;gap:6px}
    #spa-panel .row{display:flex;justify-content:space-between;gap:8px}
    #spa-panel .row span:first-child{color:#666}
    #spa-panel .btns{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:4px}
    #spa-panel button{border:1px solid #ddd;background:#fafafa;border-radius:8px;padding:6px;font:600 12px system-ui;cursor:pointer;color:#111}
    #spa-panel button:hover{border-color:#ee4d2d}
    #spa-panel .msg{color:#666;font-size:12px}
    #spa-panel.min .body{display:none}
  `;
  (document.head || document.documentElement).appendChild(style);

  // ---------- thanh công cụ nổi ----------
  let panel;
  const currentProductKey = () => keyFromHref(location.pathname);

  function updatePanel() {
    if (!document.body) return;
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'spa-panel';
      panel.innerHTML = '<header><span>🛍 Shopee Analyzer</span><span class="toggle">–</span></header><div class="body"></div>';
      panel.querySelector('header').onclick = () => panel.classList.toggle('min');
      panel.addEventListener('click', onPanelClick);
      document.body.appendChild(panel);
    }
    const key = currentProductKey();
    const p = key && mem.get(key);
    const body = panel.querySelector('.body');
    if (p) {
      const v = SPA.velocity(p);
      body.innerHTML = `
        <div class="row"><span>Giá</span><b>${SPA.vnd(p.price)}${p.priceMax && p.priceMax !== p.price ? ' – ' + SPA.vnd(p.priceMax) : ''}</b></div>
        <div class="row"><span>Đã bán / tháng</span><b>${SPA.fmt(p.sold30)}</b></div>
        <div class="row"><span>Tổng đã bán</span><b>${SPA.fmt(p.hsold)}</b></div>
        <div class="row"><span>Doanh thu / tháng (ước tính)</span><b>${SPA.vnd(SPA.rev30(p))}</b></div>
        <div class="row"><span>Doanh thu tích luỹ (ước tính)</span><b>${SPA.vnd(SPA.revAll(p))}</b></div>
        <div class="row"><span>Đánh giá</span><b>⭐ ${p.rating ? p.rating.toFixed(2) : '–'} · ${SPA.fmt(p.ratingCount)}</b></div>
        <div class="row"><span>Ngày đăng</span><b>${SPA.fmtDate(p.ctime)}${p.ctime ? ` (${SPA.ageDays(p.ctime)} ngày)` : ''}</b></div>
        ${p.models ? `<div class="row"><span>Phân loại</span><b>${p.models.length}</b></div>` : ''}
        ${v != null ? `<div class="row"><span>Tốc độ bán thực tế</span><b>${v.toFixed(1)} đơn/ngày</b></div>` : ''}
        <div class="btns">
          <button data-act="watch">${watch.has(key) ? '★ Bỏ theo dõi' : '☆ Theo dõi'}</button>
          <button data-act="images">📥 Tải ảnh</button>
          <button data-act="reviews">💬 Lấy đánh giá</button>
          <button data-act="profit">🧮 Tính lãi</button>
          <button data-act="dash" style="grid-column:1/-1">📊 Mở Dashboard</button>
        </div><div class="msg" id="spa-msg"></div>`;
    } else {
      body.innerHTML = `<div class="msg">Đã ghi <b>${newCount}</b> sản phẩm mới trong phiên này.</div>
        <div class="btns"><button data-act="crawl3">⬇ Quét 3 trang</button><button data-act="crawl10">⬇ Quét 10 trang</button>
        <button data-act="dash" style="grid-column:1/-1">📊 Mở Dashboard</button></div><div class="msg" id="spa-msg">${crawlStatus()}</div>`;
    }
  }

  const msg = (t) => { const el = document.getElementById('spa-msg'); if (el) el.innerHTML = t; };

  function onPanelClick(e) {
    const act = e.target.dataset?.act;
    if (!act) return;
    const key = currentProductKey();
    const p = key && mem.get(key);
    if (act === 'dash') chrome.runtime.sendMessage({ type: 'open', page: 'dashboard.html' + (p ? '#product=' + key : '') });
    if (act === 'watch') { toggleWatch(key); setTimeout(updatePanel, 300); }
    if (act === 'profit') chrome.runtime.sendMessage({ type: 'open', page: `dashboard.html#profit=${p?.price || ''}&key=${key}` });
    if (act === 'images') {
      const imgs = (p?.images || [p?.image]).filter(Boolean);
      chrome.runtime.sendMessage({ type: 'downloadImages', key, images: imgs.map(SPA.img) });
      msg(`Đang tải ${imgs.length} ảnh vào thư mục Downloads/shopee/${key}/`);
    }
    if (act === 'reviews') fetchReviews(key, 500);
    if (act === 'crawl3') startCrawl(3);
    if (act === 'crawl10') startCrawl(10);
  }

  // ---------- lấy đánh giá ----------
  async function fetchReviews(key, max) {
    const [shopid, itemid] = key.split('_');
    let got = 0, offset = 0;
    const limit = 50;
    msg('Đang lấy đánh giá…');
    try {
      while (got < max) {
        const r = await fetch(`/api/v2/item/get_ratings?exclude_filter=1&filter=0&filter_size=0&flag=1&fold_filter=0&itemid=${itemid}&limit=${limit}&offset=${offset}&relevant_reviews=false&request_source=2&shopid=${shopid}&tag_filter=&type=0&variation_filters=`, { credentials: 'include' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const j = await r.json();
        if (j.error && j.error !== 0) throw new Error('mã lỗi ' + j.error);
        const list = j.data?.ratings || [];
        onData(location.href, j);
        got += list.length;
        offset += limit;
        msg(`Đã lấy ${got} đánh giá…`);
        if (list.length < limit) break;
        await new Promise((res) => setTimeout(res, 1500 + Math.random() * 1500));
      }
      msg(`✓ Đã lấy ${got} đánh giá. Xem ở Dashboard → tab Đánh giá.`);
    } catch (e) {
      // Shopee chặn gọi trực tiếp: chuyển sang tự bấm "trang sau" trong phần đánh giá
      msg(`Shopee chặn gọi trực tiếp (${e.message}). Chuyển sang tự lật trang đánh giá…`);
      clickReviewPages(Math.ceil((max - got) / 6));
    }
    setTimeout(flush, 800);
  }

  async function clickReviewPages(pages) {
    const ctrl = document.querySelector('.product-ratings .shopee-page-controller, .shopee-page-controller');
    if (!ctrl) { msg('Không tìm thấy phần đánh giá. Hãy cuộn xuống mục "ĐÁNH GIÁ SẢN PHẨM" rồi bấm lại.'); return; }
    ctrl.scrollIntoView({ block: 'center' });
    for (let i = 0; i < pages; i++) {
      const next = ctrl.querySelector('.shopee-icon-button--right');
      if (!next || next.disabled) break;
      next.click();
      msg(`Đang lật trang đánh giá ${i + 2}…`);
      await new Promise((res) => setTimeout(res, 1800 + Math.random() * 1500));
    }
    msg('✓ Đã lật xong. Xem ở Dashboard → tab Đánh giá.');
  }

  // ---------- quét nhiều trang (tìm kiếm / danh mục / shop) ----------
  const JOB = 'spa-crawl';
  const getJob = () => { try { return JSON.parse(sessionStorage.getItem(JOB) || 'null'); } catch (_) { return null; } };
  const setJob = (j) => { try { j ? sessionStorage.setItem(JOB, JSON.stringify(j)) : sessionStorage.removeItem(JOB); } catch (_) {} };
  const crawlStatus = () => { const j = getJob(); return j ? `Đang quét trang ${j.done + 1}/${j.total}… <a href="#" id="spa-stop">Dừng</a>` : ''; };
  document.addEventListener('click', (e) => { if (e.target.id === 'spa-stop') { e.preventDefault(); setJob(null); msg('Đã dừng quét.'); } });

  function startCrawl(total) {
    setJob({ total, done: 0 });
    runCrawl();
  }

  async function runCrawl() {
    const job = getJob();
    if (!job) return;
    updatePanel();
    // Cuộn chậm như người thật để trang tải hết sản phẩm
    for (let y = 0; y < 8; y++) {
      if (!getJob()) return;
      window.scrollBy(0, Math.max(400, innerHeight * 0.8));
      await new Promise((r) => setTimeout(r, 700 + Math.random() * 600));
    }
    await new Promise((r) => setTimeout(r, 1500));
    const j = getJob();
    if (!j) return;
    j.done++;
    if (j.done >= j.total) { setJob(null); updatePanel(); msg(`✓ Quét xong ${j.total} trang.`); return; }
    setJob(j);
    const u = new URL(location.href);
    const page = Number(u.searchParams.get('page') || 0);
    u.searchParams.set('page', page + 1);
    await new Promise((r) => setTimeout(r, 1500 + Math.random() * 2000));
    location.href = u.href;
  }

  // ---------- khởi động ----------
  function boot() {
    updatePanel();
    decorate(false);
    new MutationObserver(scheduleDecorate).observe(document.body, { childList: true, subtree: true });
    let lastPath = location.pathname + location.search;
    setInterval(() => {
      const p = location.pathname + location.search;
      if (p !== lastPath) { lastPath = p; updatePanel(); }
    }, 1000);
    if (getJob()) setTimeout(runCrawl, 3000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type === 'context') reply({ newCount, productKey: currentProductKey(), url: location.href, crawling: !!getJob() });
    if (m.type === 'crawl') { startCrawl(m.pages || 3); reply({ ok: true }); }
    if (m.type === 'stopCrawl') { setJob(null); reply({ ok: true }); }
    if (m.type === 'reviews') { fetchReviews(currentProductKey(), m.max || 500); reply({ ok: true }); }
    if (m.type === 'flushNow') { flush().then(() => reply({ ok: true })); return true; }
  });
})();
