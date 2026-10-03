// Tab Theo dõi, Đánh giá, Tính lãi, Cài đặt.

TABS.watch = {
  render(el) {
    const ps = DB.watch.map((k) => DB.products[k] || { key: k, name: k, missing: true });
    const s = DB.settings;
    el.innerHTML = `
      <section class="card"><h2>⭐ Sản phẩm đang theo dõi (${ps.length})</h2>
        <p class="muted small">Bấm ☆ trên nhãn sản phẩm ở Shopee hoặc trong bảng Sản phẩm để thêm. Mỗi lần sản phẩm được mở lại, tiện ích ghi một mốc mới để tính <b>tốc độ bán thực tế</b> và <b>lịch sử giá</b>.</p>
        <div class="toolbar">
          <button id="wRefresh" class="primary">🔄 Cập nhật ngay</button>
          <label class="small"><input type="checkbox" id="wAuto" ${s.autoRefresh ? 'checked' : ''}> Tự cập nhật mỗi ngày (khi Chrome đang mở)</label>
          <label class="small"><input type="checkbox" id="wNotify" ${s.notify !== false ? 'checked' : ''}> Thông báo khi đổi giá / hết hàng</label>
          <span class="muted small" id="wInfo">${DB.lastRefresh ? 'Cập nhật lần cuối: ' + new Date(DB.lastRefresh).toLocaleString('vi-VN') : ''}</span>
        </div>
        <div class="tablewrap"><table><thead><tr><th></th><th class="l">Sản phẩm</th><th>Giá hiện tại</th><th>Đổi giá từ lúc theo dõi</th><th>Tồn kho</th><th>Bán/tháng</th><th>Tốc độ bán thực tế</th><th>Mốc ghi nhận</th><th>Cập nhật</th><th></th></tr></thead><tbody>
        ${ps.map((p) => {
          if (p.missing) return `<tr><td></td><td class="name">${esc(p.key)} <span class="muted">(chưa có dữ liệu)</span></td><td colspan="7"></td><td><button class="star" data-watch="${p.key}">★</button></td></tr>`;
          const h = (p.hist || []).filter((x) => x.price != null);
          const d = h.length ? (p.price - h[0].price) / h[0].price : null;
          const v = SPA.velocity(p);
          return `<tr><td><img class="pimg" src="${esc(SPA.img(p.image))}" alt=""></td>
            <td class="name"><a data-open="${p.key}">${esc(p.name)}</a></td><td>${SPA.vnd(p.price)}</td>
            <td class="${d > 0 ? 'down' : d < 0 ? 'up' : ''}">${d ? (d > 0 ? '+' : '') + SPA.pct(d) : '–'}</td>
            <td>${p.stock === 0 ? '<b class="badge-neg">Hết hàng</b>' : SPA.fmt(p.stock)}</td><td>${SPA.fmt(p.sold30)}</td>
            <td>${v != null ? v.toFixed(1) + ' đơn/ngày<div class="muted small">≈ ' + SPA.fmt(v * 30 * (p.price || 0)) + 'đ/tháng</div>' : '–'}</td>
            <td>${(p.hist || []).length}</td><td class="small">${p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN') : '–'}</td>
            <td><button class="star" data-watch="${p.key}" title="Bỏ theo dõi">★</button></td></tr>`;
        }).join('') || '<tr><td colspan="10" class="muted">Chưa theo dõi sản phẩm nào.</td></tr>'}
        </tbody></table></div></section>`;
    $('#wRefresh').onclick = async () => {
      if (!DB.watch.length) return;
      $('#wInfo').textContent = `Đang mở lần lượt ${DB.watch.length} sản phẩm trong tab nền (~${Math.ceil(DB.watch.length * 18 / 60)} phút)…`;
      const r = await chrome.runtime.sendMessage({ type: 'refreshWatch' });
      $('#wInfo').textContent = `✓ Đã cập nhật ${r?.n || 0} sản phẩm.`;
    };
    const save = () => chrome.storage.local.set({ settings: { ...DB.settings, autoRefresh: $('#wAuto').checked, notify: $('#wNotify').checked } });
    $('#wAuto').onchange = $('#wNotify').onchange = save;
  },
};

TABS.reviews = {
  render(el, hp, keep) {
    const prevKey = keep ? $('#rKey')?.value : null;
    const keys = Object.keys(DB.reviews).filter((k) => DB.reviews[k].length).sort((a, b) => DB.reviews[b].length - DB.reviews[a].length);
    const sel = prevKey || hp.get('reviews') || keys[0];
    el.innerHTML = `
      <section class="filters"><label class="grow">Sản phẩm đã lấy đánh giá
        <select id="rKey">${keys.map((k) => `<option value="${k}">${esc((DB.products[k]?.name || k).slice(0, 90))} (${DB.reviews[k].length} đánh giá)</option>`).join('')}</select></label></section>
      <div id="rBody"></div>`;
    if (!keys.length) {
      $('#rBody').innerHTML = `<section class="card"><h2>Chưa có đánh giá</h2><p>Mở một trang sản phẩm trên Shopee → bấm <b>💬 Lấy đánh giá</b> ở khung Shopee Analyzer góc phải (hoặc trong popup tiện ích).</p></section>`;
      return;
    }
    $('#rKey').value = keys.includes(sel) ? sel : keys[0];
    $('#rKey').onchange = () => this.body($('#rKey').value);
    this.body($('#rKey').value);
  },

  body(key) {
    const rs = DB.reviews[key] || [];
    const p = DB.products[key];
    const neg = rs.filter((r) => r.star <= 3), pos = rs.filter((r) => r.star >= 5);
    const avg = SPA.sum(rs.map((r) => r.star)) / (rs.length || 1);
    const months = {};
    rs.forEach((r) => { if (r.ctime) { const d = new Date(r.ctime * 1000); const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; months[m] = (months[m] || 0) + 1; } });
    const mKeys = Object.keys(months).sort().slice(-18);
    const variants = {};
    rs.forEach((r) => r.variant && r.variant.split(', ').forEach((v) => (variants[v] = (variants[v] || 0) + 1)));
    const tags = {};
    rs.forEach((r) => r.tags.forEach((t) => (tags[t] = (tags[t] || 0) + 1)));
    const pain = SPA.phrases(neg.map((r) => ({ text: r.comment })), () => 1, 20);
    const praise = SPA.phrases(pos.map((r) => ({ text: r.comment })), () => 1, 20);
    const phrTable = (list, cls) => `<table><thead><tr><th class="l">Cụm từ</th><th>Số lần</th></tr></thead><tbody>${list.map((x) => `<tr><td class="l ${cls}">${esc(x.phrase)}</td><td>${x.count}</td></tr>`).join('') || '<tr><td colspan="2" class="muted l">Chưa đủ dữ liệu</td></tr>'}</tbody></table>`;

    $('#rBody').innerHTML = `
      ${p ? `<p class="small"><a data-open="${key}" href="#">${esc(p.name)}</a> · <a href="${SPA.url(p)}" target="_blank">mở trên Shopee</a></p>` : ''}
      <section class="kpis">
        ${[['Đánh giá đã lấy', SPA.fmt(rs.length) + (p?.ratingCount ? ' / ' + SPA.fmt(p.ratingCount) : '')], ['Sao trung bình (mẫu)', avg.toFixed(2)],
          ['Tỉ lệ 1–3 sao', SPA.pct(neg.length / (rs.length || 1))], ['Có ảnh', SPA.pct(rs.filter((r) => r.images).length / (rs.length || 1), 0)],
          ['Có video', SPA.pct(rs.filter((r) => r.video).length / (rs.length || 1), 0)], ['Có nội dung chữ', SPA.pct(rs.filter((r) => r.comment.trim()).length / (rs.length || 1), 0)]]
          .map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}
      </section>
      <div class="phr">
        <section class="card"><h2>😣 Nỗi đau khách hàng (đánh giá 1–3 sao)</h2><p class="muted small">Cụm từ hay gặp. Dùng để cải tiến sản phẩm và viết nội dung "giải quyết đúng nỗi đau".</p><div class="tablewrap">${phrTable(pain, 'badge-neg')}</div></section>
        <section class="card"><h2>😍 Điều khách thích (đánh giá 5 sao)</h2><p class="muted small">Dùng làm USP, hook video và tiêu đề quảng cáo.</p><div class="tablewrap">${phrTable(praise, 'badge-pos')}</div></section>
      </div>
      <div class="grid2" style="margin-top:16px">
        <section class="card"><h2>Phân bố sao (mẫu đã lấy)</h2>${Charts.hbars([5, 4, 3, 2, 1].map((s) => ({ label: s + ' sao', value: rs.filter((r) => r.star === s).length })), { left: 60 })}</section>
        <section class="card"><h2>Số đánh giá theo tháng</h2><p class="muted small">Gần đúng với số đơn theo thời gian (không phải khách nào cũng đánh giá).</p>${Charts.bars(mKeys.map((m) => ({ label: m.slice(2).replace('-', '/'), value: months[m] })), { label: 'Đánh giá theo tháng' })}</section>
        <section class="card"><h2>Phân loại được mua nhiều</h2>${Charts.hbars(Object.entries(variants).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([l, v]) => ({ label: l, value: v })))}</section>
        <section class="card"><h2>Nhãn đánh giá của Shopee</h2>${Charts.hbars(Object.entries(tags).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([l, v]) => ({ label: l, value: v })))}</section>
      </div>
      <section class="card" style="margin-top:16px"><div class="tablehead"><h2>Nội dung đánh giá</h2>
        <span class="toolbar" style="margin:0"><select id="rStar"><option value="">Tất cả sao</option><option value="neg">1–3 sao</option>${[5, 4, 3, 2, 1].map((s) => `<option value="${s}">${s} sao</option>`).join('')}</select>
        <button id="rCsv">Xuất CSV</button><button id="rCopy">Copy cho AI phân tích</button></span></div>
        <div class="tablewrap"><table id="rTable"></table></div></section>`;

    const table = () => {
      const f = $('#rStar').value;
      const list = rs.filter((r) => !f || (f === 'neg' ? r.star <= 3 : r.star === Number(f))).sort((a, b) => b.ctime - a.ctime);
      $('#rTable').innerHTML = `<thead><tr><th>Sao</th><th class="l">Nội dung</th><th class="l">Phân loại</th><th>Ảnh/Video</th><th>Ngày</th></tr></thead><tbody>${list.slice(0, 300).map((r) =>
        `<tr><td>${'★'.repeat(r.star)}</td><td class="name">${esc(r.comment) || '<span class="muted">(không có chữ)</span>'}</td><td class="l small">${esc(r.variant)}</td><td>${r.images ? '🖼 ' + r.images : ''}${r.video ? ' 🎬' : ''}</td><td>${SPA.fmtDate(r.ctime)}</td></tr>`).join('')}</tbody>`;
      return list;
    };
    table();
    $('#rStar').onchange = table;
    const cols = [{ label: 'Sao', get: (r) => r.star }, { label: 'Nội dung', get: (r) => r.comment }, { label: 'Phân loại', get: (r) => r.variant },
      { label: 'Số ảnh', get: (r) => r.images }, { label: 'Video', get: (r) => (r.video ? 'Có' : '') }, { label: 'Ngày', get: (r) => (r.ctime ? new Date(r.ctime * 1000).toISOString().slice(0, 10) : '') }];
    $('#rCsv').onclick = () => SPA.download(`shopee-danh-gia-${key}.csv`, SPA.toCSV(table(), cols));
    $('#rCopy').onclick = (e) => {
      const list = table().filter((r) => r.comment.trim()).slice(0, 400);
      const text = `Phân tích các đánh giá sản phẩm "${p?.name || key}" dưới đây. Tóm tắt: 1) top nỗi đau / phàn nàn, 2) top điều khách thích, 3) gợi ý cải tiến sản phẩm, 4) 10 hook quảng cáo dựa trên insight.\n\n` +
        list.map((r) => `[${r.star}★${r.variant ? ' | ' + r.variant : ''}] ${r.comment.replace(/\s+/g, ' ')}`).join('\n');
      navigator.clipboard.writeText(text).then(() => (e.target.textContent = `✓ Đã copy ${list.length} đánh giá`));
    };
  },
};

TABS.profit = {
  render(view, hp, keep) {
    if (keep) return; // giữ nguyên số đang nhập khi dữ liệu nền thay đổi
    view.innerHTML = '<div id="profitWrap"></div>';
    const el = $('#profitWrap');
    const f = DB.settings.fees;
    const p = hp.get('key') ? DB.products[hp.get('key')] : null;
    const price = Number(hp.get('profit')) || p?.price || 199000;
    const field = (id, label, val, hint = '') => `<label>${label}<input id="${id}" type="number" step="any" value="${val}">${hint ? `<span class="muted small">${hint}</span>` : ''}</label>`;
    el.innerHTML = `
      <section class="card"><h2>🧮 Tính lãi bán hàng trên Shopee</h2>
        ${p ? `<p class="small">Sản phẩm tham chiếu: <a data-open="${p.key}" href="#">${esc(p.name)}</a> (bán ${SPA.fmt(p.sold30)}/tháng)</p>` : ''}
        <div class="form">
          ${field('cPrice', 'Giá bán (đ)', Math.round(price))}
          ${field('cCost', 'Giá vốn / sản phẩm (đ)', Math.round(price * 0.4))}
          ${field('cVoucher', 'Voucher shop tự trả / đơn (đ)', 0)}
          ${field('cQty', 'Số đơn dự kiến / tháng', p?.sold30 || 300)}
        </div>
        <h3 style="font-size:13px;margin:16px 0 8px">Phí & chi phí (lưu làm mặc định)</h3>
        <div class="form">
          ${field('fFixed', 'Phí cố định (%)', f.fixed, 'Tuỳ ngành hàng, Mall/không Mall')}
          ${field('fPayment', 'Phí thanh toán (%)', f.payment)}
          ${field('fFreeship', 'Phí Freeship Xtra (%)', f.freeship, 'Nếu tham gia')}
          ${field('fVoucherXtra', 'Phí Voucher Xtra (%)', f.voucherXtra, 'Nếu tham gia')}
          ${field('fTax', 'Thuế (%)', f.tax, 'Hộ kinh doanh thường 1,5%')}
          ${field('fAds', 'Quảng cáo (% doanh thu)', f.ads)}
          ${field('fPerOrder', 'Phí cố định khác / đơn (đ)', f.perOrder, 'vd: phí hạ tầng, phí xử lý')}
          ${field('fPacking', 'Đóng gói / đơn (đ)', f.packing)}
        </div>
        <p class="muted small">⚠️ Mức phí mặc định chỉ để tham khảo. Shopee thay đổi biểu phí thường xuyên, hãy kiểm tra mức hiện hành trong Kênh Người Bán.</p>
      </section>
      <section class="kpis" id="cOut"></section>
      <section class="card"><h2>Chi tiết 1 đơn</h2><div class="tablewrap"><table id="cTable"></table></div></section>`;
    const calc = () => {
      const g = (id) => Number($('#' + id).value) || 0;
      const price = g('cPrice'), cost = g('cCost'), voucher = g('cVoucher'), qty = g('cQty');
      const net = Math.max(0, price - voucher);
      const pctFees = [['Phí cố định', g('fFixed')], ['Phí thanh toán', g('fPayment')], ['Phí Freeship Xtra', g('fFreeship')], ['Phí Voucher Xtra', g('fVoucherXtra')], ['Thuế', g('fTax')], ['Quảng cáo', g('fAds')]];
      const rate = SPA.sum(pctFees.map((x) => x[1])) / 100;
      const fixedCost = cost + g('fPerOrder') + g('fPacking');
      const profit = net * (1 - rate) - fixedCost;
      const margin = net ? profit / net : 0;
      const breakEven = rate < 1 ? fixedCost / (1 - rate) + voucher : null;
      const target = (m) => (1 - rate - m > 0 ? fixedCost / (1 - rate - m) + voucher : null);
      $('#cOut').innerHTML = [
        ['Lãi / đơn', `<span class="${profit >= 0 ? 'up' : 'down'}">${SPA.vnd(profit)}</span>`], ['Biên lợi nhuận', SPA.pct(margin)],
        ['ROI trên giá vốn', cost ? SPA.pct(profit / cost) : '–'], ['Lãi / tháng', SPA.vnd(profit * qty)],
        ['Giá hoà vốn', SPA.vnd(breakEven)], ['Giá để lãi 20%', SPA.vnd(target(0.2))], ['Giá để lãi 30%', SPA.vnd(target(0.3))],
      ].map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
      $('#cTable').innerHTML = `<tbody>
        <tr><td class="l">Giá bán</td><td>${SPA.vnd(price)}</td></tr>
        ${voucher ? `<tr><td class="l">− Voucher shop</td><td>${SPA.vnd(voucher)}</td></tr>` : ''}
        ${pctFees.filter((x) => x[1]).map(([l, r]) => `<tr><td class="l">− ${l} (${r}%)</td><td>${SPA.vnd(net * r / 100)}</td></tr>`).join('')}
        <tr><td class="l">− Giá vốn</td><td>${SPA.vnd(cost)}</td></tr>
        ${g('fPerOrder') ? `<tr><td class="l">− Phí khác / đơn</td><td>${SPA.vnd(g('fPerOrder'))}</td></tr>` : ''}
        ${g('fPacking') ? `<tr><td class="l">− Đóng gói</td><td>${SPA.vnd(g('fPacking'))}</td></tr>` : ''}
        <tr><th class="l">= Lãi</th><th>${SPA.vnd(profit)}</th></tr></tbody>`;
    };
    let st;
    el.addEventListener('input', (e) => {
      calc();
      if (e.target.id.startsWith('f')) {
        clearTimeout(st);
        st = setTimeout(() => {
          const g = (id) => Number($('#' + id).value) || 0;
          chrome.storage.local.set({ settings: { ...DB.settings, fees: { fixed: g('fFixed'), payment: g('fPayment'), freeship: g('fFreeship'), voucherXtra: g('fVoucherXtra'), tax: g('fTax'), ads: g('fAds'), perOrder: g('fPerOrder'), packing: g('fPacking') } } });
        }, 600);
      }
    });
    calc();
  },
};

const APPS_SCRIPT = `function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(d.sheet) || ss.insertSheet(d.sheet);
  sh.clearContents();
  var values = [d.header].concat(d.rows);
  if (values.length) sh.getRange(1, 1, values.length, d.header.length).setValues(values);
  sh.getRange(1, 1, 1, d.header.length).setFontWeight('bold');
  return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: d.rows.length }));
}`;

TABS.settings = {
  render(el, hp, keep) {
    if (keep) return; // tránh mất nội dung đang gõ khi dữ liệu nền thay đổi
    el.innerHTML = `
      <section class="card settings"><h2>📤 Kết nối Google Sheets</h2>
        <ol class="small">
          <li>Tạo một Google Sheet mới → menu <b>Tiện ích mở rộng → Apps Script</b>.</li>
          <li>Xoá code mẫu, dán đoạn code bên dưới, bấm 💾 Lưu.</li>
          <li>Bấm <b>Triển khai → Tùy chọn triển khai mới</b> → loại <b>Ứng dụng web</b>; "Người có quyền truy cập": <b>Bất kỳ ai</b> → Triển khai → cấp quyền.</li>
          <li>Copy <b>URL ứng dụng web</b> (dạng https://script.google.com/macros/s/…/exec) dán vào ô dưới.</li>
        </ol>
        <pre class="code" id="code"></pre>
        <div class="toolbar"><button id="copyCode">Copy code</button></div>
        <label class="small" style="display:grid;gap:4px;margin-top:12px">URL Web App<input type="url" id="sheetsUrl" placeholder="https://script.google.com/macros/s/.../exec"></label>
        <div class="toolbar"><button id="saveUrl" class="primary">Lưu</button><button id="testUrl">Gửi thử</button><span class="muted small" id="sInfo"></span></div>
        <p class="muted small">Ai có URL này đều ghi được vào Sheet, đừng chia sẻ công khai.</p>
      </section>
      <section class="card"><h2>💾 Sao lưu & khôi phục</h2>
        <div class="toolbar"><button id="bk">Sao lưu JSON</button><label class="btn">Nhập JSON<input type="file" id="imp" accept=".json" hidden></label></div>
      </section>
      <section class="card"><h2>🗑 Xoá dữ liệu</h2>
        <div class="toolbar"><button id="clrKw">Xoá từ khoá đã quét</button><button id="clrRv">Xoá đánh giá</button><button id="clrAll" style="color:var(--bad)">Xoá toàn bộ</button></div>
      </section>`;
    $('#code').textContent = APPS_SCRIPT;
    $('#sheetsUrl').value = DB.settings.sheetsUrl || '';
    $('#copyCode').onclick = (e) => navigator.clipboard.writeText(APPS_SCRIPT).then(() => (e.target.textContent = '✓ Đã copy'));
    $('#saveUrl').onclick = async () => {
      DB.settings.sheetsUrl = $('#sheetsUrl').value.trim();
      await chrome.storage.local.set({ settings: DB.settings });
      $('#sInfo').textContent = '✓ Đã lưu';
    };
    $('#testUrl').onclick = async () => { await $('#saveUrl').onclick(); pushSheets('KiemTra', ['Thời gian', 'Nội dung'], [[new Date().toLocaleString('vi-VN'), 'Shopee Analyzer kết nối thành công']]); };
    $('#bk').onclick = async () => SPA.download(`shopee-analyzer-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await chrome.storage.local.get(null)), 'application/json');
    $('#imp').onchange = async (e) => {
      try { await chrome.storage.local.set(JSON.parse(await e.target.files[0].text())); alert('Đã nhập dữ liệu.'); } catch (_) { alert('File không hợp lệ.'); }
    };
    const clear = async (prefix) => {
      const all = await chrome.storage.local.get(null);
      await chrome.storage.local.remove(Object.keys(all).filter((k) => k.startsWith(prefix)));
    };
    $('#clrKw').onclick = () => confirm('Xoá toàn bộ từ khoá đã quét?') && clear('k:');
    $('#clrRv').onclick = () => confirm('Xoá toàn bộ đánh giá đã lấy?') && clear('r:');
    $('#clrAll').onclick = () => confirm('Xoá TOÀN BỘ dữ liệu (sản phẩm, shop, theo dõi, đánh giá)? Cài đặt được giữ lại.') &&
      chrome.storage.local.get(null).then((all) => chrome.storage.local.remove(Object.keys(all).filter((k) => k !== 'settings')));
  },
};
