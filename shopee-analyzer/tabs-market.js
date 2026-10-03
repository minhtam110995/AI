// Tab Thị trường: quy mô, phân khúc giá, mức cạnh tranh, cơ hội theo từ khoá.

function productsFor(kw, topN) {
  if (!kw) return Object.values(DB.products);
  const k = DB.keywords[kw];
  if (!k) return [];
  return Object.entries(k.items).sort((a, b) => a[1] - b[1]).slice(0, topN || Infinity)
    .map(([key, rank]) => DB.products[key] && { ...DB.products[key], rank }).filter(Boolean);
}

function niceStep(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= x) return m * p;
  return 10 * p;
}

function priceBuckets(ps) {
  const prices = ps.map((p) => p.price).filter((x) => x > 0).sort((a, b) => a - b);
  if (prices.length < 3) return [];
  const q = (f) => prices[Math.min(prices.length - 1, Math.floor(f * prices.length))];
  const lo = q(0.05), hi = q(0.95);
  const step = niceStep(Math.max(1000, (hi - lo) / 7));
  const start = Math.floor(lo / step) * step;
  const n = Math.max(1, Math.ceil((hi - start) / step));
  const b = Array.from({ length: n }, (_, i) => ({ from: start + i * step, to: start + (i + 1) * step, items: [] }));
  ps.forEach((p) => {
    if (!(p.price > 0)) return;
    const i = Math.max(0, Math.min(n - 1, Math.floor((p.price - start) / step)));
    b[i].items.push(p);
  });
  return b.map((x, i) => ({
    ...x,
    label: `${i === 0 ? '≤' : ''}${SPA.fmt(i === 0 ? x.to : x.from)}${i === 0 ? '' : i === n - 1 ? '+' : '–' + SPA.fmt(x.to)}`,
    rev: SPA.sum(x.items.map(SPA.rev30)), sold: SPA.sum(x.items.map((p) => p.sold30)),
  }));
}

// Điểm cơ hội 0–100 (tham khảo): nhu cầu cao, rào cản đánh giá thấp, thị trường phân mảnh, ít Mall.
function opportunity(ps) {
  const withSold = ps.filter((p) => p.sold30 != null);
  if (withSold.length < 5) return null;
  const byRev = [...withSold].sort((a, b) => (SPA.rev30(b) || 0) - (SPA.rev30(a) || 0));
  const top10 = byRev.slice(0, 10);
  const total = SPA.sum(withSold.map(SPA.rev30)) || 1;
  const demand = Math.min(1, Math.log10(1 + (SPA.median(top10.map((p) => p.sold30)) || 0)) / 3.5);
  const barrier = Math.min(1, Math.log10(1 + (SPA.median(top10.map((p) => p.ratingCount)) || 0)) / 4.5);
  const conc = SPA.sum(byRev.slice(0, 3).map(SPA.rev30)) / total;
  const mall = ps.filter((p) => p.mall).length / ps.length;
  const score = 100 * (0.45 * demand + 0.2 * (1 - barrier) + 0.2 * (1 - conc) + 0.15 * (1 - mall));
  return { score, demand, barrier, conc, mall };
}

TABS.market = {
  render(el, hp, keep) {
    const kws = Object.values(DB.keywords).sort((a, b) => b.updatedAt - a.updatedAt);
    const prevKw = keep ? $('#mKw')?.value : undefined;
    const prevTop = keep ? $('#mTop')?.value : '0';
    el.innerHTML = `
      <section class="filters">
        <label>Từ khoá đã quét
          <select id="mKw"><option value="">Tất cả sản phẩm đã lưu</option>
          ${kws.map((k) => `<option value="${esc(k.keyword)}">${esc(k.keyword)} (${Object.keys(k.items).length} SP)</option>`).join('')}</select></label>
        <label>Phạm vi
          <select id="mTop"><option value="0">Toàn bộ kết quả</option><option value="20">Top 20</option><option value="50">Top 50</option><option value="100">Top 100</option></select></label>
      </section>
      <div id="mBody"></div>`;
    $('#mKw').value = prevKw ?? (kws[0]?.keyword || '');
    $('#mTop').value = prevTop || '0';
    $('#mKw').onchange = $('#mTop').onchange = () => this.body();
    this.body();
  },

  body() {
    const kw = $('#mKw').value;
    const ps = productsFor(kw, Number($('#mTop').value));
    const box = $('#mBody');
    if (!ps.length) {
      box.innerHTML = `<section class="card"><h2>Chưa có dữ liệu</h2><p>Mở <a href="https://shopee.vn" target="_blank">shopee.vn</a>, tìm một từ khoá, rồi bấm biểu tượng tiện ích → <b>Quét trang này</b> (3–5 trang). Dữ liệu sẽ hiện ở đây.</p></section>`;
      return;
    }
    const rev = SPA.sum(ps.map(SPA.rev30));
    const shops = {};
    ps.forEach((p) => { const s = (shops[p.shopid] ||= { shopid: p.shopid, items: [], rev: 0 }); s.items.push(p); s.rev += SPA.rev30(p) || 0; });
    const shopList = Object.values(shops).sort((a, b) => b.rev - a.rev);
    const opp = opportunity(ps);
    const buckets = priceBuckets(ps);
    const bestBucket = [...buckets].sort((a, b) => b.rev - a.rev)[0];
    const newHot = ps.filter((p) => SPA.ageDays(p.ctime) != null && SPA.ageDays(p.ctime) <= 90 && p.sold30 > 0).sort((a, b) => b.sold30 - a.sold30).slice(0, 10);
    const weak = ps.filter((p) => (p.sold30 || 0) >= 50 && p.rating && p.rating < 4.7).sort((a, b) => a.rating - b.rating || b.sold30 - a.sold30).slice(0, 10);
    const phr = SPA.phrases(ps.map((p) => ({ text: p.name, sold: p.sold30 || 0 })), (it) => 1 + it.sold, 25);
    const locs = {};
    ps.forEach((p) => p.location && (locs[p.location] = (locs[p.location] || 0) + (SPA.rev30(p) || 0)));
    const top3share = rev ? SPA.sum(shopList.slice(0, 3).map((s) => s.rev)) / rev : null;

    const ins = [];
    if (opp) ins.push(`Điểm cơ hội <b>${Math.round(opp.score)}/100</b>: ${opp.score >= 65 ? 'thị trường hấp dẫn, nên thử' : opp.score >= 45 ? 'cạnh tranh vừa phải, cần điểm khác biệt rõ' : 'cạnh tranh gắt hoặc nhu cầu thấp, cân nhắc kỹ'}.`);
    if (bestBucket) ins.push(`Phân khúc giá bán chạy nhất: <b>${bestBucket.label}đ</b>, chiếm ${SPA.pct(bestBucket.rev / (rev || 1), 0)} doanh thu (${bestBucket.items.length} SP).`);
    if (top3share != null) ins.push(`Top 3 shop chiếm <b>${SPA.pct(top3share, 0)}</b> doanh thu. ${top3share > 0.6 ? 'Thị trường tập trung, khó chen chân.' : 'Thị trường còn phân mảnh, shop mới vẫn có cơ hội.'}`);
    if (newHot.length) ins.push(`Có <b>${newHot.length}</b> sản phẩm mới (≤ 90 ngày) đã có đơn. Mẫu bán tốt nhất: ${esc(newHot[0].name.slice(0, 60))} (${SPA.fmt(newHot[0].sold30)}/tháng).`);
    if (weak.length) ins.push(`<b>${weak.length}</b> sản phẩm bán khá nhưng sao dưới 4,7. Xem đánh giá xấu của chúng để làm sản phẩm tốt hơn.`);
    if (phr.length) ins.push(`Cụm từ trong tiêu đề của sản phẩm bán chạy: ${phr.slice(0, 6).map((p) => `<b>${esc(p.phrase)}</b>`).join(', ')}.`);
    const mallShare = ps.filter((p) => p.mall).length / ps.length;
    ins.push(`Shop Mall chiếm ${SPA.pct(mallShare, 0)} số sản phẩm; Shop Yêu thích ${SPA.pct(ps.filter((p) => p.preferred).length / ps.length, 0)}.`);

    box.innerHTML = `
      <section class="kpis">
        ${[['Sản phẩm', SPA.fmt(ps.length)], ['Doanh thu/tháng (ước tính)', SPA.fmt(rev) + 'đ'], ['Số shop', SPA.fmt(shopList.length)],
          ['Giá trung vị', SPA.vnd(SPA.median(ps.map((p) => p.price)))], ['Đã bán/tháng trung vị', SPA.fmt(SPA.median(ps.map((p) => p.sold30)))],
          ['Sao trung bình', (SPA.median(ps.map((p) => p.rating)) || 0).toFixed(2)], ['Đánh giá trung vị (top 10)', SPA.fmt(SPA.median([...ps].sort((a, b) => (b.sold30 || 0) - (a.sold30 || 0)).slice(0, 10).map((p) => p.ratingCount)))],
          ['Tỉ lệ Mall', SPA.pct(mallShare, 0)]]
          .map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}
      </section>
      ${opp ? `<section class="card"><h2>🎯 Điểm cơ hội thị trường</h2>
        <div class="score"><div><div class="big">${Math.round(opp.score)}</div><div class="muted small">/ 100</div></div>
        <div class="grow">
          ${Charts.meter('Nhu cầu (càng cao càng tốt)', opp.demand)}
          ${Charts.meter('Rào cản đánh giá (thấp = dễ)', opp.barrier)}
          ${Charts.meter('Độ tập trung top 3', opp.conc, SPA.pct(opp.conc, 0))}
          ${Charts.meter('Tỉ lệ Mall', opp.mall, SPA.pct(opp.mall, 0))}
        </div></div>
        <p class="muted small">Điểm tham khảo = 45% nhu cầu + 20% (1 − rào cản đánh giá) + 20% (1 − độ tập trung) + 15% (1 − tỉ lệ Mall). Doanh thu = giá × đã bán/tháng do Shopee hiển thị, chỉ là ước tính.</p></section>` : ''}
      <section class="card insights"><h2>💡 Nhận định</h2><ul>${ins.map((x) => `<li>${x}</li>`).join('')}</ul></section>
      <div class="grid2">
        <section class="card"><h2>Phân khúc giá</h2><p class="muted small">Doanh thu/tháng ước tính theo khoảng giá (đ).</p><div class="chart">${Charts.bars(buckets.map((b) => ({ label: b.label, value: b.rev, tip: `<b>${b.label}đ</b><br>${b.items.length} SP · ${SPA.fmt(b.sold)} đơn/tháng<br>Doanh thu ${SPA.fmt(b.rev)}đ` })), { label: 'Phân khúc giá' })}</div></section>
        <section class="card"><h2>Doanh thu theo nơi bán</h2><p class="muted small">Doanh thu/tháng ước tính theo tỉnh/thành của shop.</p><div class="chart">${Charts.hbars(Object.entries(locs).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([l, v]) => ({ label: l, value: v })), { left: 130 })}</div></section>
      </div>
      <section class="card" style="margin-top:16px"><h2>🏪 Top shop trong thị trường</h2><div class="tablewrap"><table>
        <thead><tr><th>Shop</th><th>Số SP</th><th>Doanh thu/tháng</th><th>Thị phần</th><th>SP bán chạy nhất</th></tr></thead><tbody>
        ${shopList.slice(0, 15).map((s) => {
          const info = DB.shops[s.shopid];
          const best = [...s.items].sort((a, b) => (b.sold30 || 0) - (a.sold30 || 0))[0];
          return `<tr><td>${esc(info?.name || best?.shopName || s.shopid)}${info?.mall || best?.mall ? '<span class="pill mall">Mall</span>' : ''}</td><td>${s.items.length}</td><td>${SPA.fmt(s.rev)}đ</td><td>${SPA.pct(s.rev / (rev || 1))}</td>
            <td class="name"><a data-open="${best.key}">${esc(best.name.slice(0, 70))}</a></td></tr>`;
        }).join('')}</tbody></table></div></section>
      <div class="lists">
        <section class="card"><h2>🔥 Sản phẩm mới bán chạy (≤ 90 ngày)</h2><ul class="plist">${newHot.map((p) => plistItem(p, SPA.ageDays(p.ctime) + ' ngày')).join('') || '<li class="muted">Chưa có</li>'}</ul></section>
        <section class="card"><h2>🛠 Bán chạy nhưng bị chê (sao &lt; 4,7)</h2><ul class="plist">${weak.map((p) => plistItem(p, '⭐ ' + p.rating.toFixed(1))).join('') || '<li class="muted">Chưa có</li>'}</ul></section>
      </div>
      <section class="card"><h2>🔤 Cụm từ khoá trong tiêu đề sản phẩm bán chạy</h2><p class="muted small">Dùng để đặt tên sản phẩm chuẩn SEO. Xếp theo tổng lượng bán của các sản phẩm chứa cụm từ.</p>
        <div class="tablewrap"><table><thead><tr><th>Cụm từ</th><th>Số SP chứa</th><th>Điểm (theo lượng bán)</th></tr></thead><tbody>
        ${phr.map((p) => `<tr><td>${esc(p.phrase)}</td><td>${p.count}</td><td>${SPA.fmt(p.weight)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Chưa đủ dữ liệu</td></tr>'}
        </tbody></table></div>
        <div class="toolbar"><button id="copyKw">Copy danh sách cụm từ</button></div></section>`;
    $('#copyKw').onclick = (e) => navigator.clipboard.writeText(phr.map((p) => p.phrase).join('\n')).then(() => (e.target.textContent = '✓ Đã copy'));
  },
};
