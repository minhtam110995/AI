// Hàm dùng chung: chuẩn hoá dữ liệu Shopee, lưu trữ, định dạng số, phân tích văn bản.
const SPA = (() => {
  const IMG = 'https://down-vn.img.susercontent.com/file/';
  const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const money = (v) => { const n = num(v); return n == null || n < 0 ? null : n / 100000; }; // API Shopee nhân giá với 100.000

  // ---------- chuẩn hoá ----------
  function normalizeProduct(o, extra = {}) {
    const itemid = o.itemid ?? o.item_id;
    const shopid = o.shopid ?? o.shop_id;
    // Shopee có 2 kiểu dữ liệu: kiểu cũ (item_basic) và kiểu "thẻ sản phẩm" mới (item_card_*)
    const card = o.item_card_displayed_asset || {};
    const dp = o.item_card_display_price || {};
    const sc = o.item_card_display_sold_count || {};
    const name = o.name ?? o.title ?? card.name;
    if (!itemid || !shopid || !name || !('price' in o || 'price_min' in o || 'price' in dp)) return null;
    const pr = extra.product_review || {};
    const ir = o.item_rating || card.rating || {};
    const rc = Array.isArray(ir.rating_count) ? ir.rating_count : Array.isArray(pr.rating_count) ? pr.rating_count : null;
    const before = money(o.price_before_discount ?? dp.strikethrough_price);
    const models = (o.models || extra.models || []).map((m) => ({
      name: m.name || '', price: money(m.price), stock: num(m.stock ?? m.normal_stock), sold: num(m.sold),
    }));
    return {
      key: `${shopid}_${itemid}`,
      itemid: String(itemid),
      shopid: String(shopid),
      name: String(name),
      image: o.image || card.image || (o.images || [])[0] || '',
      images: o.images || null,
      price: money(o.price ?? o.price_min ?? dp.price),
      priceMin: money(o.price_min),
      priceMax: money(o.price_max),
      priceBefore: before && before > 0 ? before : null,
      discount: num(o.raw_discount ?? dp.discount) ?? (typeof o.discount === 'string' ? num(o.discount.replace(/\D/g, '')) : null),
      sold30: num(o.sold ?? sc.monthly_sold_count ?? pr.sold),
      hsold: num(o.historical_sold ?? sc.historical_sold_count ?? pr.historical_sold ?? o.global_sold ?? pr.global_sold),
      rating: num(ir.rating_star ?? pr.rating_star),
      ratingCount: rc ? num(rc[0]) : num(pr.total_rating_count ?? ir.total_rating_count ?? ir.rating_count),
      stars: rc && rc.length >= 6 ? rc.slice(1, 6).map(Number) : null,
      likes: num(o.liked_count),
      ctime: num(o.ctime),
      stock: num(o.stock ?? o.normal_stock),
      location: o.shop_location || o.shop_data?.shop_location || null,
      mall: o.is_official_shop != null ? !!o.is_official_shop : null,
      preferred: o.shopee_verified != null ? !!o.shopee_verified : null,
      brand: o.brand || null,
      catid: num(o.catid ?? o.cat_id),
      freeship: o.show_free_shipping != null ? !!o.show_free_shipping : null,
      shopName: o.shop_name || o.shop_data?.shop_name || extra.shop_detailed?.name || null,
      tiers: o.tier_variations ? o.tier_variations.map((t) => ({ name: t.name, options: t.options || [] })) : null,
      models: models.length ? models : null,
      ads: !!(o.adsid || extra.adsid),
    };
  }

  function normalizeShop(o) {
    const shopid = o.shopid ?? o.shop_id;
    if (!shopid || !('follower_count' in o) || !(o.name || o.account)) return null;
    return {
      shopid: String(shopid),
      name: o.name || o.account?.username || '',
      username: o.account?.username || o.username || '',
      followers: num(o.follower_count),
      itemCount: num(o.item_count),
      rating: num(o.rating_star),
      responseRate: num(o.response_rate),
      responseTime: num(o.response_time),
      ctime: num(o.ctime),
      mall: o.is_official_shop != null ? !!o.is_official_shop : null,
      preferred: (o.is_shopee_verified ?? o.shopee_verified) != null ? !!(o.is_shopee_verified ?? o.shopee_verified) : null,
      location: o.shop_location || o.place || null,
      avatar: o.account?.portrait || o.portrait || '',
    };
  }

  function normalizeReview(o) {
    const itemid = o.itemid ?? o.item_id;
    const shopid = o.shopid ?? o.shop_id;
    if (!o.cmtid || !itemid || !shopid || o.rating_star == null) return null;
    return {
      id: String(o.cmtid),
      key: `${shopid}_${itemid}`,
      star: num(o.rating_star),
      comment: o.comment || '',
      ctime: num(o.ctime),
      user: o.author_username || '',
      variant: (o.product_items || []).map((p) => p.model_name).filter(Boolean).join(', '),
      images: (o.images || []).length,
      video: (o.videos || []).length > 0,
      likes: num(o.like_count) || 0,
      tags: (o.template_tags || o.tags || []).map((t) => (typeof t === 'string' ? t : t.tag_description || '')).filter(Boolean),
    };
  }

  // Duyệt JSON để tìm sản phẩm / shop / đánh giá, không phụ thuộc vào cấu trúc API cụ thể.
  function extract(json) {
    const products = [], shops = [], reviews = [];
    const seen = new WeakSet();
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 14 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      if (o.item && typeof o.item === 'object' && (o.product_review || o.shop_detailed)) {
        const p = normalizeProduct(o.item, o);
        if (p) { products.push(p); seen.add(o.item); }
        if (o.shop_detailed) walk(o.shop_detailed, depth + 1);
      }
      const p = normalizeProduct(o);
      if (p) products.push(p);
      const s = normalizeShop(o);
      if (s) shops.push(s);
      const r = normalizeReview(o);
      if (r) reviews.push(r);
      for (const k in o) walk(o[k], depth + 1);
    };
    walk(json, 0);
    return { products, shops, reviews };
  }

  // "1,2k" → 1200, "10k+" → 10000, "1,5tr" → 1500000
  function parseShort(t) {
    const m = String(t || '').toLowerCase().replace(/\s/g, '').match(/([\d.,]+)(k|tr|triệu|m)?/);
    if (!m) return null;
    const n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * (m[2] === 'k' ? 1e3 : m[2] ? 1e6 : 1));
  }

  // Gộp: chỉ điền các trường còn trống (dùng cho dữ liệu đọc từ giao diện, kém chính xác hơn API).
  function fillMissing(prev, next) {
    const out = { ...(prev || {}) };
    for (const k in next) if (out[k] == null && next[k] != null && next[k] !== '') out[k] = next[k];
    return out;
  }

  // Gộp: chỉ ghi đè trường có giá trị.
  function merge(prev, next) {
    const out = { ...(prev || {}) };
    for (const k in next) if (next[k] != null && next[k] !== '') out[k] = next[k];
    return out;
  }

  // ---------- lưu trữ (mỗi đối tượng 1 khoá để ghi nhanh) ----------
  // p:<shopid_itemid>  s:<shopid>  k:<từ khoá>  r:<shopid_itemid>  watch  settings
  async function loadAll() {
    const all = await chrome.storage.local.get(null);
    const db = { products: {}, shops: {}, keywords: {}, reviews: {}, watch: all.watch || [], settings: { ...DEFAULT_SETTINGS, ...(all.settings || {}), fees: { ...DEFAULT_SETTINGS.fees, ...(all.settings?.fees || {}) } }, lastRefresh: all.lastRefresh };
    for (const k in all) {
      if (k.startsWith('p:')) {
        const p = all[k];
        const m = m30(p);
        db.products[k.slice(2)] = { ...p, sold30raw: p.sold30 ?? null, sold30: m.v, m30src: m.src };
      }
      else if (k.startsWith('s:')) db.shops[k.slice(2)] = all[k];
      else if (k.startsWith('k:')) db.keywords[k.slice(2)] = all[k];
      else if (k.startsWith('r:')) db.reviews[k.slice(2)] = all[k];
    }
    return db;
  }

  // Xoá 1 phiên quét; sản phẩm chỉ thuộc phiên đó (và không được theo dõi) cũng bị xoá
  async function deleteSession(key) {
    const all = await chrome.storage.local.get(null);
    const items = Object.keys(all['k:' + key]?.items || {});
    const others = Object.keys(all).filter((k) => k.startsWith('k:') && k !== 'k:' + key).map((k) => all[k].items || {});
    const watch = all.watch || [];
    const orphan = items.filter((it) => !others.some((o) => it in o) && !watch.includes(it));
    await chrome.storage.local.remove(['k:' + key, ...orphan.map((it) => 'p:' + it), ...orphan.map((it) => 'r:' + it)]);
    return orphan.length;
  }

  // Xoá toàn bộ dữ liệu đã quét (giữ lại cài đặt)
  async function resetAll() {
    const all = await chrome.storage.local.get(null);
    await chrome.storage.local.remove(Object.keys(all).filter((k) => k !== 'settings'));
  }

  const DEFAULT_SETTINGS = {
    sheetsUrl: '',
    autoRefresh: false,
    notify: true,
    fees: { fixed: 6, payment: 5, freeship: 0, voucherXtra: 0, tax: 1.5, perOrder: 0, packing: 3000, ads: 0 },
  };

  // ---------- định dạng ----------
  const fmt = (n) => {
    if (n == null || !Number.isFinite(n)) return '–';
    const a = Math.abs(n);
    const f = (x, s) => x.toFixed(x >= 100 ? 0 : 1).replace(/\.0$/, '').replace('.', ',') + s;
    if (a >= 1e9) return f(n / 1e9, ' tỷ');
    if (a >= 1e6) return f(n / 1e6, ' tr');
    if (a >= 1e3) return f(n / 1e3, 'k');
    return String(Math.round(n));
  };
  const vnd = (n) => (n == null || !Number.isFinite(n) ? '–' : Math.round(n).toLocaleString('vi-VN') + 'đ');
  const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(d).replace('.', ',') + '%');
  const fmtDate = (sec) => (sec ? new Date(sec * 1000).toLocaleDateString('vi-VN') : '–');
  const ageDays = (sec) => (sec ? Math.floor((Date.now() / 1000 - sec) / 86400) : null);
  const median = (arr) => {
    const s = arr.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const sum = (arr) => arr.reduce((a, b) => a + (b || 0), 0);
  const url = (p) => `https://shopee.vn/product/${p.shopid}/${p.itemid}`;
  const img = (hash) => (!hash ? '' : /^https?:/.test(hash) ? hash : IMG + hash);

  // Bán/tháng: số Shopee hiển thị; nếu Shopee trả 0/không có thì ước tính
  //  1) tốc độ bán thực tế giữa các lần ghi nhận × 30, 2) tổng đã bán ÷ số tháng từ ngày đăng
  function m30(p) {
    const raw = p.sold30raw !== undefined ? p.sold30raw : p.sold30;
    if (raw > 0) return { v: raw, src: 'shopee' };
    const v = velocity(p);
    if (v != null && v > 0) return { v: v * 30, src: 'velocity' };
    const age = ageDays(p.ctime);
    if (p.hsold > 0 && age != null) return { v: p.hsold / Math.max(1, age / 30), src: 'avg' };
    return { v: raw ?? null, src: 'shopee' };
  }
  const M30_SRC = { shopee: 'số Shopee hiển thị', velocity: 'tốc độ bán thực tế × 30 ngày', avg: 'TB tổng đã bán ÷ số tháng từ ngày đăng' };

  // Doanh thu ước tính
  const rev30 = (p) => { const s = p.sold30raw !== undefined ? p.sold30 : m30(p).v; return p.price != null && s != null ? p.price * s : null; };
  const revAll = (p) => (p.price != null && p.hsold != null ? p.price * p.hsold : null);

  // Tốc độ bán thực tế từ lịch sử ghi nhận (đơn/ngày), cần ≥ 2 mốc cách nhau ≥ 12 giờ.
  function velocity(p) {
    const h = (p.hist || []).filter((x) => x.hsold != null);
    if (h.length < 2) return null;
    const a = h[0], b = h[h.length - 1];
    const days = (b.t - a.t) / 86400e3;
    return days >= 0.5 ? Math.max(0, (b.hsold - a.hsold) / days) : null;
  }

  // ---------- phân tích văn bản tiếng Việt ----------
  const STOP = new Set(('và của cho có là các những một được không với này khi đã thì mà rất cũng như để ra vào lại nên nhưng bị từ trong theo sẽ đến hơn nhiều ạ ạ. nha nhé ok oke shop sp sản phẩm hàng mình em anh chị bạn mua giao nhận đơn mới thấy dùng thì còn vẫn đều hết luôn quá lắm thôi rồi ko k kh hk dc đc đk vs j gì nào đây đó kia ạ ah à ơi vậy vì do nếu hay hoặc cái chiếc bộ size màu loại x ml g kg cm mm m set combo freeship chính hãng hot new 2023 2024 2025 2026 sale giá rẻ tốt'
  ).split(' '));

  function tokens(text) {
    return String(text || '').toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/).filter((w) => w && w.length > 1 && !/^\d+$/.test(w));
  }

  // Đếm cụm 2–3 từ (bỏ cụm toàn từ dừng), có trọng số.
  function phrases(items, weightFn = () => 1, top = 30) {
    const counts = new Map();
    for (const it of items) {
      const t = tokens(it.text);
      const w = weightFn(it);
      const seen = new Set();
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i + n <= t.length; i++) {
          const g = t.slice(i, i + n);
          if (STOP.has(g[0]) || STOP.has(g[n - 1])) continue;
          const k = g.join(' ');
          if (seen.has(k)) continue;
          seen.add(k);
          const c = counts.get(k) || { phrase: k, count: 0, weight: 0 };
          c.count++; c.weight += w;
          counts.set(k, c);
        }
      }
    }
    // Bỏ cụm 2 từ nằm gọn trong cụm 3 từ có tần suất tương đương
    const arr = [...counts.values()].filter((c) => c.count >= 2);
    const tri = arr.filter((c) => c.phrase.split(' ').length === 3);
    return arr.filter((c) => c.phrase.split(' ').length === 3 || !tri.some((t) => t.phrase.includes(c.phrase) && t.count >= c.count * 0.8))
      .sort((a, b) => b.weight - a.weight).slice(0, top);
  }

  // ---------- xuất ----------
  function toCSV(rows, cols) {
    const esc = (x) => {
      const s = String(x ?? '');
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return '﻿' + cols.map((c) => esc(c.label)).join(',') + '\n' + rows.map((r) => cols.map((c) => esc(c.get(r))).join(',')).join('\n');
  }

  const PRODUCT_COLS = [
    { label: 'Tên sản phẩm', get: (p) => p.name },
    { label: 'Shop', get: (p) => p.shopName || p.shopid },
    { label: 'Giá', get: (p) => p.price },
    { label: 'Giá gốc', get: (p) => p.priceBefore },
    { label: 'Đã bán/tháng', get: (p) => p.sold30 },
    { label: 'Tổng đã bán', get: (p) => p.hsold },
    { label: 'Doanh thu/tháng (ước tính)', get: (p) => rev30(p) },
    { label: 'Doanh thu tích luỹ (ước tính)', get: (p) => revAll(p) },
    { label: 'Sao', get: (p) => p.rating?.toFixed(2) },
    { label: 'Số đánh giá', get: (p) => p.ratingCount },
    { label: 'Lượt thích', get: (p) => p.likes },
    { label: 'Tồn kho', get: (p) => p.stock },
    { label: 'Ngày đăng', get: (p) => (p.ctime ? new Date(p.ctime * 1000).toISOString().slice(0, 10) : '') },
    { label: 'Nơi bán', get: (p) => p.location },
    { label: 'Mall', get: (p) => (p.mall ? 'Có' : '') },
    { label: 'Yêu thích', get: (p) => (p.preferred ? 'Có' : '') },
    { label: 'Link', get: (p) => url(p) },
  ];

  function download(name, text, type = 'text/csv') {
    const u = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = u; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }

  return {
    extract, normalizeProduct, normalizeShop, normalizeReview, merge, fillMissing, parseShort, loadAll, DEFAULT_SETTINGS,
    fmt, vnd, pct, fmtDate, ageDays, median, sum, url, img, rev30, revAll, velocity, m30, M30_SRC, deleteSession, resetAll,
    tokens, phrases, toCSV, PRODUCT_COLS, download,
  };
})();
