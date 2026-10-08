// Content script cho Trung tâm liên kết TikTok Shop (affiliate.tiktok.com).
// Chỉ đọc số liệu mà tài khoản người bán của bạn đang được xem trên trang:
//  1) dữ liệu API trang đã tải (qua inject.js), 2) dự phòng: đọc bảng trên giao diện.
(() => {
  const pending = new Map();
  let timer = null;
  let added = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const pct = (v) => { if (v == null) return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n / 100 : null; };

  function put(c) {
    if (!c?.handle) return;
    c.handle = String(c.handle).replace(/^@/, '').trim();
    const prev = pending.get(c.handle) || {};
    const out = { ...prev };
    for (const k in c) if (c[k] != null && c[k] !== '' && !(Array.isArray(c[k]) && !c[k].length)) out[k] = c[k];
    pending.set(c.handle, out);
    clearTimeout(timer);
    timer = setTimeout(flush, 900);
  }

  async function flush() {
    if (!pending.size) return;
    const items = [...pending.values()];
    pending.clear();
    const { affCreators = {} } = await chrome.storage.local.get('affCreators');
    const now = Date.now();
    for (const c of items) {
      const prev = affCreators[c.handle];
      if (!prev) added++;
      const m = { ...(prev || {}) };
      for (const k in c) if (c[k] != null) m[k] = c[k];
      // Lưu lịch sử GMV / số món bán (tối đa 1 mốc / 6 giờ) để thấy ai đang tăng trưởng
      const snaps = prev?.snaps ? [...prev.snaps] : [];
      const last = snaps[snaps.length - 1];
      if (m.gmv != null && (!last || now - last.t > 6 * 3600e3)) snaps.push({ t: now, gmv: m.gmv, units: m.units, followers: m.followers });
      if (snaps.length > 200) snaps.splice(0, snaps.length - 200);
      affCreators[c.handle] = { ...m, snaps, firstSeen: prev?.firstSeen || now, updatedAt: now, page: location.pathname };
    }
    await chrome.storage.local.set({ affCreators });
    badge();
  }

  // ---------- 1) dữ liệu API ----------
  const HANDLE_KEYS = ['handle', 'unique_id', 'uniqueId', 'user_name', 'username', 'creator_handle'];
  const money = (v) => {
    if (v == null) return null;
    if (typeof v === 'object') {
      if (v.min != null && v.max != null) return (TTA.parseMoney(v.min) + TTA.parseMoney(v.max)) / 2;
      return TTA.parseMoney(v.formatted ?? v.format ?? v.value ?? v.amount ?? v.amount_formatted ?? null);
    }
    return TTA.parseMoney(v);
  };
  // Giá trị có thể nằm trong {value: …}
  const un = (x) => (x && typeof x === 'object' && !Array.isArray(x) && ('value' in x || 'formatted' in x) ? x.formatted ?? x.value : x);
  const pick = (o, re) => { for (const k in o) if (re.test(k) && o[k] != null && typeof o[k] !== 'boolean') return un(o[k]); return undefined; };
  function fromApi(o) {
    const hk = HANDLE_KEYS.find((k) => typeof o[k] === 'string' && o[k]);
    if (!hk) return null;
    // gộp các nhóm số liệu lồng (vd: {stats: {gmv: …}}) nhưng không ghi đè khoá đã có
    const flat = { ...o };
    for (const k in o) {
      const v = o[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && !/avatar|image|cover/i.test(k) && !('value' in v)) for (const kk in v) if (!(kk in flat)) flat[kk] = v[kk];
    }
    const gmv = pick(flat, /^(?!.*(rate|ratio|pct|percent))(.*gmv.*|.*revenue.*)$/i);
    const units = pick(flat, /(units?_sold|sold_cnt|sold_count|sales_cnt|item_sold)/i);
    const views = pick(flat, /(avg.*(view|play)|(view|play).*avg|ec_video_view)/i);
    const eng = pick(flat, /(engagement|interact)/i);
    const fol = pick(flat, /follower/i);
    if (gmv === undefined && units === undefined && fol === undefined) return null;
    const cats = pick(flat, /categor/i);
    return {
      handle: o[hk], name: o.nickname || o.nick_name || o.display_name || null,
      gmv: money(gmv), units: units != null ? TTA.parseCount(units?.value ?? units) : null,
      avgViews: views != null ? TTA.parseCount(views?.value ?? views) : null,
      er: eng == null ? null : typeof eng === 'number' ? (eng > 1 ? eng / 100 : eng) : pct(eng),
      followers: fol != null ? TTA.parseCount(fol?.value ?? fol) : null,
      categories: Array.isArray(cats) ? cats.map((c) => (typeof c === 'string' ? c : c?.name || c?.category_name)).filter(Boolean) : typeof cats === 'string' ? [cats] : null,
      creatorId: o.creator_oecuid || o.creator_id || o.oec_uid || o.cid || null,
      src: 'api',
    };
  }
  function walk(o, d = 0, seen = new WeakSet()) {
    if (!o || typeof o !== 'object' || d > 14 || seen.has(o)) return;
    seen.add(o);
    if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1, seen)); return; }
    const c = fromApi(o);
    if (c) put(c);
    for (const k in o) walk(o[k], d + 1, seen);
  }
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__tta || e.data.kind !== 'api') return;
    walk(e.data.data);
  });

  // ---------- 2) đọc bảng trên giao diện (trang "Tìm nhà sáng tạo", bảng xếp hạng…) ----------
  const MONEY = /^([\d.,]+\s*(?:Tr|tr|Tỷ|tỷ|K|k|N)?\s*[đd₫])$/;
  const COUNT = /^[\d.,]+\s*(?:K|N|M|Tr)?$/i;
  function parseRow(row) {
    // bỏ biểu tượng ở đầu dòng (🛍, 👤…)
    const lines = (row.innerText || '').split('\n').map((s) => s.trim().replace(/^[^\p{L}\p{N}@]+/u, '').trim()).filter(Boolean);
    const gi = lines.findIndex((l) => MONEY.test(l));
    if (gi < 1) return null;
    const handle = lines[0];
    if (!/^[\w.]{2,40}$/.test(handle)) return null;
    const after = lines.slice(gi + 1);
    const units = after.find((l) => COUNT.test(l));
    const views = after.filter((l) => COUNT.test(l))[1];
    const er = after.find((l) => /^[\d.,]+\s*%$/.test(l));
    const demo = lines.find((l) => /^([\d.,]+\s*(?:K|N|M|Tr)?)\s*,\s*(Nam|Nữ|Male|Female)\s*(\d+)%/i.test(l));
    const dm = demo && demo.match(/^([\d.,]+\s*(?:K|N|M|Tr)?)\s*,\s*(Nam|Nữ|Male|Female)\s*(\d+)%\s*,?\s*([\d+\-–]+)?/i);
    const catLine = lines.find((l, i) => i > 1 && i < gi && l !== demo && /(,\s*\+\d+$)|…|\.\.\./.test(l))
      || lines.find((l, i) => i > 1 && i < gi && l !== demo && /[&,]/.test(l) && !/^\d/.test(l));
    const link = row.querySelector('a[href*="creator"], a[href*="cid="]');
    return {
      handle, name: lines[1] && lines[1] !== catLine && lines[1] !== demo ? lines[1] : null,
      gmv: TTA.parseMoney(lines[gi]), gmvText: lines[gi],
      units: units ? TTA.parseCount(units) : null, avgViews: views ? TTA.parseCount(views) : null, er: er ? pct(er) : null,
      followers: dm ? TTA.parseCount(dm[1]) : null, gender: dm ? dm[2] : null, genderPct: dm ? Number(dm[3]) / 100 : null, age: dm?.[4] || null,
      // tên ngành có thể chứa dấu phẩy ("Sách, tạp chí & âm thanh"), nên giữ nguyên cả dòng, chỉ bỏ ", +2"
      categories: catLine ? [catLine.replace(/\s*,\s*\+\d+\s*$/, '').trim()] : null,
      moreCategories: catLine && /\+(\d+)\s*$/.test(catLine) ? Number(catLine.match(/\+(\d+)\s*$/)[1]) : null,
      star: /Ngôi sao sáng tạo|Rising star|Star creator/i.test(row.innerText),
      detailUrl: link ? link.href : null, src: 'dom',
    };
  }

  function scanTable() {
    const seen = new Set();
    // Mỗi dòng creator có nút "Mời"/"Invite": đi ngược lên tìm khung dòng chứa số GMV
    for (const btn of document.querySelectorAll('button')) {
      if (!/^(Mời|Invite)$/i.test((btn.innerText || '').trim())) continue;
      let row = btn.parentElement;
      for (let i = 0; i < 8 && row; i++) {
        if ((row.innerText || '').split('\n').some((l) => MONEY.test(l.trim())) && (row.innerText || '').split('\n').length >= 5) break;
        row = row.parentElement;
      }
      if (!row || seen.has(row)) continue;
      seen.add(row);
      const c = parseRow(row);
      if (c) put(c);
    }
    scanDetail();
  }

  // Trang chi tiết creator: đọc cặp "nhãn → giá trị" phổ biến
  const LABELS = [
    ['gmv', /^(GMV)$/i, 'money'], ['units', /^(Số món bán ra|Món bán ra|Items sold|Units sold)$/i, 'count'],
    ['avgViews', /^(Lượt xem video trung bình|Avg\.? video views)$/i, 'count'], ['er', /^(Tỷ lệ tương tác|Engagement rate)$/i, 'pct'],
    ['followers', /^(Người theo dõi|Followers)$/i, 'count'], ['videoGmv', /^(GMV (từ )?video|Video GMV)$/i, 'money'],
    ['liveGmv', /^(GMV (từ )?(LIVE|phát trực tiếp)|LIVE GMV)$/i, 'money'], ['products', /^(Sản phẩm|Products)$/i, 'count'],
  ];
  function scanDetail() {
    if (!/creator\/detail|cid=|creator_id=/.test(location.href)) return;
    const lines = (document.querySelector('main, [role="main"]') || document.body).innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    const handle = (lines.find((l) => /^@?[\w.]{3,40}$/.test(l)) || '').replace(/^@/, '');
    if (!handle) return;
    const c = { handle, detailUrl: location.href, src: 'detail' };
    lines.forEach((l, i) => {
      for (const [key, re, type] of LABELS) {
        if (c[key] != null || !re.test(l)) continue;
        const v = lines.slice(i + 1, i + 3).find((x) => /\d/.test(x));
        if (!v) continue;
        c[key] = type === 'money' ? TTA.parseMoney(v) : type === 'pct' ? pct(v) : TTA.parseCount(v);
      }
    });
    if (Object.keys(c).length > 3) put(c);
  }

  let st = null;
  const schedule = () => { clearTimeout(st); st = setTimeout(scanTable, 800); };

  // ---------- tự cuộn để trang tải thêm creator ----------
  let scrolling = false;
  function scrollTarget() {
    let best = document.scrollingElement, max = 0;
    for (const el of document.querySelectorAll('div, main, section')) {
      const cs = getComputedStyle(el);
      if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight - el.clientHeight > max && el.clientHeight > 300) { max = el.scrollHeight - el.clientHeight; best = el; }
    }
    return best;
  }
  async function autoScroll(times) {
    if (scrolling) return;
    scrolling = true;
    let stale = 0;
    for (let i = 0; i < times && scrolling; i++) {
      const el = scrollTarget();
      const h = el.scrollHeight;
      el.scrollTop = el.scrollHeight;
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(2000 + Math.random() * 1500);
      // nút "Xem thêm / Tải thêm" nếu có
      const more = [...document.querySelectorAll('button')].find((b) => /^(Xem thêm|Tải thêm|Load more|View more)$/i.test((b.innerText || '').trim()) && b.offsetParent);
      if (more) { more.click(); await sleep(2000); }
      badge(`⬇ Đang cuộn ${i + 1}/${times}…`);
      if (el.scrollHeight === h && !more) { if (++stale >= 3) break; } else stale = 0;
    }
    scrolling = false;
    scanTable();
    await sleep(1200);
    await flush();
    badge();
  }

  let b;
  function badge(text) {
    if (!document.body) return;
    if (!b) {
      b = document.createElement('div');
      Object.assign(b.style, { position: 'fixed', left: '16px', bottom: '16px', zIndex: 2147483647, background: '#121214', color: '#fff', font: '600 12px/1 system-ui,sans-serif', padding: '8px 12px', borderRadius: '999px', cursor: 'pointer', border: '1px solid #25f4ee' });
      b.title = 'TikTok Analyzer – mở bảng nhà sáng tạo';
      b.onclick = () => chrome.runtime.sendMessage({ type: 'openDashboard', hash: 'creators' });
      document.body.appendChild(b);
    }
    b.textContent = text || `🤝 +${added} nhà sáng tạo đã lưu`;
  }

  function boot() {
    scanTable();
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    badge();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();

  chrome.runtime.onMessage.addListener((m, _s, reply) => {
    if (m.type === 'context') reply({ affiliate: true, added, url: location.href });
    if (m.type === 'autoscroll') { autoScroll(m.times || 30); reply({ ok: true }); }
    if (m.type === 'stopScroll') { scrolling = false; reply({ ok: true }); }
  });
})();
