// Khung Dashboard: tải dữ liệu, điều hướng tab, hộp thoại chi tiết sản phẩm.
const $ = (s, el = document) => el.querySelector(s);
const TABS = {};
let DB = null;

const view = $('#view');
const hashParams = () => new URLSearchParams(location.hash.slice(1).replace(/^[a-z]+(?=&|$)/, (m) => m + '='));
const currentTab = () => (location.hash.slice(1).match(/^[a-z]+/) || ['market'])[0];

async function reload() {
  DB = await SPA.loadAll();
  const ps = Object.values(DB.products);
  $('#subtitle').textContent = `${ps.length} sản phẩm · ${new Set(ps.map((p) => p.shopid)).size} shop · ${Object.keys(DB.keywords).length} phiên quét · ${DB.watch.length} đang theo dõi`;
}

let lastTab = null;
function render() {
  let tab = currentTab();
  const hp = hashParams();
  if (tab === 'product') tab = 'products';
  if (!TABS[tab]) tab = 'market';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  // Giữ nguyên bộ lọc khi chỉ làm mới dữ liệu
  const keep = lastTab === tab && view.firstChild;
  TABS[tab].render(view, hp, keep);
  lastTab = tab;
  if (hp.get('product')) { openProduct(hp.get('product')); history.replaceState(null, '', '#products'); }
}

window.addEventListener('hashchange', () => { lastTab = null; render(); });
let rt;
chrome.storage.onChanged.addListener(() => { clearTimeout(rt); rt = setTimeout(async () => { await reload(); if (!document.querySelector('dialog[open]')) render(); }, 1200); });

// ---------- dùng chung ----------
const isWatched = (key) => DB.watch.includes(key);
async function toggleWatch(key) {
  const w = new Set(DB.watch);
  w.has(key) ? w.delete(key) : w.add(key);
  DB.watch = [...w];
  await chrome.storage.local.set({ watch: DB.watch });
}

function pills(p) {
  const age = SPA.ageDays(p.ctime);
  return (p.mall ? '<span class="pill mall">Mall</span>' : '') +
    (p.preferred ? '<span class="pill">Yêu thích</span>' : '') +
    (age != null && age <= 90 && (p.sold30 || 0) >= 100 ? '<span class="pill hot">🔥 Mới & bán chạy</span>' : '');
}

function plistItem(p, right) {
  return `<li><img src="${esc(SPA.img(p.image))}" alt="" loading="lazy">
    <div class="t"><div><a href="#" data-open="${p.key}" style="color:inherit">${esc(p.name)}</a></div>
    <div class="muted small">${SPA.vnd(p.price)} · ${SPA.fmt(p.sold30)}/tháng · ⭐ ${p.rating ? p.rating.toFixed(1) : '–'}${pills(p)}</div></div>
    <b class="small">${right}</b></li>`;
}

document.addEventListener('click', (e) => {
  const o = e.target.closest?.('[data-open]');
  if (o) { e.preventDefault(); openProduct(o.dataset.open); }
  const w = e.target.closest?.('[data-watch]');
  if (w) { e.preventDefault(); toggleWatch(w.dataset.watch).then(() => { w.textContent = isWatched(w.dataset.watch) ? '★' : '☆'; }); }
});
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);

// ---------- hộp thoại ----------
const dlg = $('#dlg');
$('#dlgClose').onclick = () => dlg.close();
function showDialog(title, html) {
  $('#dlgTitle').textContent = title;
  $('#dlgBody').innerHTML = html;
  if (!dlg.open) dlg.showModal();
}

function openProduct(key) {
  const p = DB.products[key];
  if (!p) { showDialog('Không tìm thấy', '<p>Sản phẩm này chưa có trong dữ liệu. Hãy mở lại trang sản phẩm trên Shopee.</p>'); return; }
  const shop = DB.shops[p.shopid];
  const hist = p.hist || [];
  const v = SPA.velocity(p);
  const reviews = DB.reviews[key] || [];
  const kws = Object.values(DB.keywords).filter((k) => key in k.items).map((k) => `<span class="pill">${esc(k.keyword)} #${k.items[key]}</span>`).join(' ');
  showDialog('Chi tiết sản phẩm', `
    <div class="prodhead"><img src="${esc(SPA.img(p.image))}" alt="">
      <div style="flex:1">
        <h3 style="margin:0 0 4px">${esc(p.name)} ${pills(p)}</h3>
        <div class="muted small">Shop: ${esc(shop?.name || p.shopName || p.shopid)}${shop?.followers ? ` · ${SPA.fmt(shop.followers)} người theo dõi` : ''} · ${esc(p.location || '')} · Đăng ${SPA.fmtDate(p.ctime)}</div>
        ${kws ? `<div class="small" style="margin-top:4px">Thứ hạng từ khoá: ${kws}</div>` : ''}
        <div class="toolbar">
          <a class="btn primary" href="${SPA.url(p)}" target="_blank">Mở trên Shopee</a>
          <button data-watch="${key}">${isWatched(key) ? '★' : '☆'}</button>
          <a class="btn" href="#reviews=${key}">💬 Đánh giá (${reviews.length})</a>
          <a class="btn" href="#profit=${p.price || ''}&key=${key}">🧮 Tính lãi</a>
        </div>
      </div></div>
    <section class="kpis">
      ${[['Giá', SPA.vnd(p.price) + (p.priceMax && p.priceMax !== p.price ? ' – ' + SPA.vnd(p.priceMax) : '')],
        ['Giá gốc / giảm', p.priceBefore ? `${SPA.vnd(p.priceBefore)} · -${p.discount || Math.round((1 - p.price / p.priceBefore) * 100)}%` : '–'],
        [`Đã bán / tháng${p.m30src && p.m30src !== 'shopee' ? ' (ước tính: ' + SPA.M30_SRC[p.m30src] + ')' : ''}`, SPA.fmt(p.sold30)], ['Tổng đã bán', SPA.fmt(p.hsold)],
        ['Doanh thu / tháng (ước tính)', SPA.vnd(SPA.rev30(p))], ['Doanh thu tích luỹ (ước tính)', SPA.vnd(SPA.revAll(p))],
        ['Đánh giá', `⭐ ${p.rating ? p.rating.toFixed(2) : '–'} · ${SPA.fmt(p.ratingCount)}`], ['Tồn kho', SPA.fmt(p.stock)],
        ['Tốc độ bán thực tế', v != null ? v.toFixed(1) + ' đơn/ngày' : 'cần ≥ 2 lần ghi nhận'], ['Lượt thích', SPA.fmt(p.likes)]]
        .map(([l, x]) => `<div class="kpi"><div class="v" style="font-size:16px">${x}</div><div class="l">${l}</div></div>`).join('')}
    </section>
    ${p.stars ? `<section class="card"><h2>Phân bố sao</h2>${Charts.hbars([5, 4, 3, 2, 1].map((s) => ({ label: s + ' sao', value: p.stars[s - 1] })), { left: 60, W: 1000 })}</section>` : ''}
    <div class="grid2">
      <section class="card"><h2>Lịch sử giá</h2>${Charts.line(hist.map((h) => ({ t: h.t, v: h.price })), { fmt: SPA.fmt, step: true, label: 'Lịch sử giá' })}</section>
      <section class="card"><h2>Tổng đã bán theo thời gian</h2>${Charts.line(hist.map((h) => ({ t: h.t, v: h.hsold })), { label: 'Tổng đã bán' })}</section>
    </div>
    ${p.models ? `<section class="card" style="margin-top:16px"><h2>Phân loại (${p.models.length})</h2><div class="tablewrap"><table>
      <thead><tr><th>Phân loại</th><th>Giá</th><th>Tồn kho</th><th>Đã bán</th></tr></thead><tbody>
      ${[...p.models].sort((a, b) => (b.sold || 0) - (a.sold || 0)).map((m) => `<tr><td>${esc(m.name)}</td><td>${SPA.vnd(m.price)}</td><td>${SPA.fmt(m.stock)}</td><td>${SPA.fmt(m.sold)}</td></tr>`).join('')}
      </tbody></table></div></section>` : ''}
    <p class="muted small">Ghi nhận lần đầu ${p.firstSeen ? new Date(p.firstSeen).toLocaleString('vi-VN') : '–'} · cập nhật ${p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN') : '–'} · ${hist.length} mốc lịch sử</p>`);
}

// Gửi bảng lên Google Sheets qua Apps Script Web App
async function pushSheets(sheet, header, rows) {
  const url = DB.settings.sheetsUrl;
  if (!url) { alert('Chưa cài đặt Google Sheets. Vào tab ⚙️ Cài đặt để dán link Web App.'); location.hash = 'settings'; return; }
  const res = await chrome.runtime.sendMessage({ type: 'pushSheets', url, payload: { sheet, header, rows } });
  alert(res?.ok ? `Đã gửi ${rows.length} dòng lên sheet "${sheet}".` : 'Gửi thất bại: ' + (res?.error || 'không rõ lỗi'));
}

(async () => { await reload(); setTimeout(render, 0); })();
