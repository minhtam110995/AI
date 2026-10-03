// Tab Sản phẩm (lọc, sắp xếp, so sánh, xuất) và tab Shop.

const PCOLS = [
  { key: 'price', label: 'Giá', fmt: SPA.vnd },
  { key: 'sold30', label: 'Bán/tháng', fmt: SPA.fmt },
  { key: 'hsold', label: 'Tổng bán', fmt: SPA.fmt },
  { key: 'rev30', label: 'DT/tháng', fmt: (x) => (x == null ? '–' : SPA.fmt(x) + 'đ'), get: SPA.rev30 },
  { key: 'rating', label: 'Sao', fmt: (x) => (x ? x.toFixed(1) : '–') },
  { key: 'ratingCount', label: 'Đánh giá', fmt: SPA.fmt },
  { key: 'age', label: 'Tuổi (ngày)', fmt: (x) => (x == null ? '–' : x), get: (p) => SPA.ageDays(p.ctime) },
  { key: 'location', label: 'Nơi bán', fmt: (x) => esc(x || '–') },
];

TABS.products = {
  sort: { key: 'rev30', dir: -1 },
  selected: new Set(),

  render(el, hp, keep) {
    const prev = keep ? { kw: $('#pKw').value, q: $('#pQ').value, min: $('#pMin').value, shop: $('#pShop').value, w: $('#pW').checked } : {};
    const kws = Object.values(DB.keywords).sort((a, b) => b.updatedAt - a.updatedAt);
    el.innerHTML = `
      <section class="filters">
        <label>Từ khoá<select id="pKw"><option value="">Tất cả</option>${kws.map((k) => `<option value="${esc(k.keyword)}">${esc(k.keyword)}</option>`).join('')}</select></label>
        <label class="grow">Tìm theo tên sản phẩm<input id="pQ" type="search" placeholder="vd: kem chống nắng"></label>
        <label>Đã bán/tháng tối thiểu<input id="pMin" type="search" inputmode="numeric" placeholder="0" style="min-width:120px"></label>
        <label>Shop ID<input id="pShop" type="search" placeholder="tất cả" style="min-width:120px"></label>
        <label style="align-self:end"><span><input id="pW" type="checkbox"> Chỉ SP đang theo dõi</span></label>
      </section>
      <div class="toolbar" style="margin-bottom:12px">
        <button id="pCompare" class="primary">So sánh (0)</button>
        <button id="pCsv">Xuất CSV</button>
        <button id="pSheets">Gửi Google Sheets</button>
        <span class="muted small" id="pInfo"></span>
      </div>
      <section class="card"><div class="tablewrap"><table id="pTable"></table></div></section>`;
    $('#pKw').value = prev.kw ?? hp.get('kw') ?? '';
    $('#pQ').value = prev.q || '';
    $('#pMin').value = prev.min || '';
    $('#pShop').value = prev.shop ?? hp.get('shop') ?? '';
    $('#pW').checked = !!prev.w;
    let t;
    ['#pKw', '#pW'].forEach((s) => ($(s).onchange = () => this.table()));
    ['#pQ', '#pMin', '#pShop'].forEach((s) => ($(s).oninput = () => { clearTimeout(t); t = setTimeout(() => this.table(), 250); }));
    $('#pCsv').onclick = () => SPA.download(`shopee-san-pham-${new Date().toISOString().slice(0, 10)}.csv`, SPA.toCSV(this.list(), SPA.PRODUCT_COLS));
    $('#pSheets').onclick = () => pushSheets('SanPham', SPA.PRODUCT_COLS.map((c) => c.label), this.list().map((p) => SPA.PRODUCT_COLS.map((c) => c.get(p) ?? '')));
    $('#pCompare').onclick = () => this.compare();
    $('#pTable').addEventListener('click', (e) => {
      const th = e.target.closest('th[data-key]');
      if (th) { const k = th.dataset.key; this.sort = { key: k, dir: this.sort.key === k ? -this.sort.dir : -1 }; this.table(); }
    });
    $('#pTable').addEventListener('change', (e) => {
      if (!e.target.dataset.sel) return;
      e.target.checked ? this.selected.add(e.target.dataset.sel) : this.selected.delete(e.target.dataset.sel);
      if (this.selected.size > 5) { this.selected.delete(e.target.dataset.sel); e.target.checked = false; alert('So sánh tối đa 5 sản phẩm.'); }
      $('#pCompare').textContent = `So sánh (${this.selected.size})`;
    });
    this.table();
  },

  list() {
    const kw = $('#pKw').value, q = $('#pQ').value.trim().toLowerCase(), min = Number($('#pMin').value) || 0, shop = $('#pShop').value.trim(), w = $('#pW').checked;
    const inKw = kw && DB.keywords[kw] ? DB.keywords[kw].items : null;
    return Object.values(DB.products).filter((p) =>
      (!inKw || p.key in inKw) && (!q || p.name.toLowerCase().includes(q)) && (p.sold30 || 0) >= min &&
      (!shop || p.shopid === shop) && (!w || isWatched(p.key)));
  },

  table() {
    const list = this.list();
    const { key, dir } = this.sort;
    const col = PCOLS.find((c) => c.key === key);
    const val = (p) => (col?.get ? col.get(p) : p[key]) ?? -Infinity;
    const rows = list.sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0)).slice(0, 500);
    $('#pInfo').textContent = list.length > 500 ? `Hiển thị 500/${list.length} SP (xuất CSV để xem đủ)` : `${list.length} sản phẩm`;
    $('#pTable').innerHTML = `<thead><tr><th></th><th></th><th class="l">Sản phẩm</th>${PCOLS.map((c) => `<th data-key="${c.key}">${c.label}${key === c.key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th>Theo dõi</th></tr></thead><tbody>` +
      rows.map((p) => `<tr><td><input type="checkbox" data-sel="${p.key}" ${this.selected.has(p.key) ? 'checked' : ''}></td>
        <td><img class="pimg" src="${esc(SPA.img(p.image))}" loading="lazy" alt=""></td>
        <td class="name"><a data-open="${p.key}">${esc(p.name)}</a>${pills(p)}</td>
        ${PCOLS.map((c) => `<td>${c.fmt(c.get ? c.get(p) : p[c.key])}</td>`).join('')}
        <td><button class="star" data-watch="${p.key}">${isWatched(p.key) ? '★' : '☆'}</button></td></tr>`).join('') + '</tbody>';
  },

  compare() {
    const ps = [...this.selected].map((k) => DB.products[k]).filter(Boolean);
    if (ps.length < 2) { alert('Tick chọn 2–5 sản phẩm trong bảng để so sánh.'); return; }
    const rows = [
      ['Ảnh', (p) => `<img class="pimg" src="${esc(SPA.img(p.image))}" style="width:72px;height:72px">`],
      ['Tên', (p) => `<a data-open="${p.key}" href="#">${esc(p.name.slice(0, 80))}</a>`],
      ['Shop', (p) => esc(DB.shops[p.shopid]?.name || p.shopName || p.shopid) + pills(p)],
      ['Giá', (p) => SPA.vnd(p.price)], ['Giá gốc', (p) => SPA.vnd(p.priceBefore)],
      ['Đã bán/tháng', (p) => SPA.fmt(p.sold30)], ['Tổng đã bán', (p) => SPA.fmt(p.hsold)],
      ['DT/tháng (ước tính)', (p) => SPA.vnd(SPA.rev30(p))], ['Sao', (p) => (p.rating ? p.rating.toFixed(2) : '–')],
      ['Số đánh giá', (p) => SPA.fmt(p.ratingCount)], ['Lượt thích', (p) => SPA.fmt(p.likes)],
      ['Số phân loại', (p) => (p.models ? p.models.length : '–')], ['Tồn kho', (p) => SPA.fmt(p.stock)],
      ['Ngày đăng', (p) => SPA.fmtDate(p.ctime)], ['Nơi bán', (p) => esc(p.location || '–')],
      ['Freeship', (p) => (p.freeship ? 'Có' : p.freeship === false ? 'Không' : '–')],
      ['Tốc độ bán thực tế', (p) => { const v = SPA.velocity(p); return v == null ? '–' : v.toFixed(1) + ' đơn/ngày'; }],
    ];
    showDialog('So sánh sản phẩm', `<div class="tablewrap"><table><tbody>${rows.map(([l, f]) => `<tr><th class="l">${l}</th>${ps.map((p) => `<td class="l" style="white-space:normal">${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
  },
};

TABS.shops = {
  render(el) {
    const agg = {};
    Object.values(DB.products).forEach((p) => {
      const s = (agg[p.shopid] ||= { shopid: p.shopid, n: 0, rev: 0, sold: 0, best: null, mall: p.mall, name: p.shopName });
      s.n++; s.rev += SPA.rev30(p) || 0; s.sold += p.sold30 || 0;
      if (!s.best || (p.sold30 || 0) > (s.best.sold30 || 0)) s.best = p;
    });
    const rows = Object.values(agg).map((s) => ({ ...s, info: DB.shops[s.shopid] })).sort((a, b) => b.rev - a.rev);
    el.innerHTML = `
      <section class="card"><h2>🏪 Danh sách shop</h2>
      <p class="muted small">Doanh thu tính trên các sản phẩm của shop mà bạn đã quét. Mở trang shop trên Shopee và bấm "Quét trang này" để có đủ sản phẩm của shop. Bấm vào tên shop để xem sản phẩm.</p>
      <div class="toolbar"><button id="sCsv">Xuất CSV</button><button id="sSheets">Gửi Google Sheets</button></div>
      <div class="tablewrap"><table><thead><tr><th class="l">Shop</th><th>Người theo dõi</th><th>Sao shop</th><th>Phản hồi chat</th><th>Tham gia</th><th>SP đã quét</th><th>Bán/tháng</th><th>DT/tháng</th><th class="l">SP bán chạy nhất</th></tr></thead><tbody>
      ${rows.slice(0, 500).map((s) => `<tr>
        <td class="name"><a href="#products&shop=${s.shopid}">${esc(s.info?.name || s.name || s.shopid)}</a>${s.info?.mall || s.mall ? '<span class="pill mall">Mall</span>' : ''}${s.info?.preferred ? '<span class="pill">Yêu thích</span>' : ''}
          <div class="muted small">${esc(s.info?.location || '')} · <a href="https://shopee.vn/shop/${s.shopid}" target="_blank">mở shop</a></div></td>
        <td>${SPA.fmt(s.info?.followers)}</td><td>${s.info?.rating ? s.info.rating.toFixed(1) : '–'}</td>
        <td>${s.info?.responseRate != null ? s.info.responseRate + '%' : '–'}</td><td>${SPA.fmtDate(s.info?.ctime)}</td>
        <td>${s.n}</td><td>${SPA.fmt(s.sold)}</td><td>${SPA.fmt(s.rev)}đ</td>
        <td class="name"><a data-open="${s.best.key}">${esc(s.best.name.slice(0, 60))}</a></td></tr>`).join('') || '<tr><td colspan="9" class="muted">Chưa có dữ liệu</td></tr>'}
      </tbody></table></div></section>`;
    const cols = [
      { label: 'Shop', get: (s) => s.info?.name || s.name || s.shopid }, { label: 'Shop ID', get: (s) => s.shopid },
      { label: 'Mall', get: (s) => (s.info?.mall || s.mall ? 'Có' : '') }, { label: 'Người theo dõi', get: (s) => s.info?.followers },
      { label: 'Sao shop', get: (s) => s.info?.rating }, { label: 'SP đã quét', get: (s) => s.n },
      { label: 'Bán/tháng', get: (s) => s.sold }, { label: 'DT/tháng (ước tính)', get: (s) => Math.round(s.rev) },
      { label: 'Link', get: (s) => `https://shopee.vn/shop/${s.shopid}` },
    ];
    $('#sCsv').onclick = () => SPA.download(`shopee-shop-${new Date().toISOString().slice(0, 10)}.csv`, SPA.toCSV(rows, cols));
    $('#sSheets').onclick = () => pushSheets('Shop', cols.map((c) => c.label), rows.map((s) => cols.map((c) => c.get(s) ?? '')));
  },
};
