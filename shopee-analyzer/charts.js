// Biểu đồ SVG thuần (không thư viện ngoài) + tooltip dùng chung.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const Charts = (() => {
  const tip = () => document.getElementById('tip');
  document.addEventListener('mousemove', (e) => {
    const t = e.target.closest?.('[data-tip]');
    const el = tip();
    if (!t) { el.classList.remove('show'); return; }
    el.innerHTML = t.getAttribute('data-tip');
    el.classList.add('show');
    const r = el.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  });

  function niceMax(v) {
    if (!(v > 0)) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }
  function barPath(x, y, w, h, r = 4) {
    r = Math.min(r, w / 2, h);
    if (h <= 0) return '';
    return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
  }
  function hbarPath(x, y, w, h, r = 4) {
    r = Math.min(r, h / 2, w);
    if (w <= 0) return '';
    return `M${x},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x}Z`;
  }
  const empty = (m) => `<div class="empty">${m}</div>`;

  // Cột dọc: rows = [{label, value, tip}]
  function bars(rows, { fmt = SPA.fmt, W = 560, H = 230, label = '' } = {}) {
    if (!rows.length || !rows.some((r) => r.value > 0)) return empty('Chưa có dữ liệu.');
    const pad = 52, top = 18, bottom = 30, plotH = H - top - bottom;
    const max = niceMax(Math.max(...rows.map((r) => r.value || 0)));
    const step = (W - pad) / rows.length, bw = Math.max(2, Math.min(56, step * 0.62));
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const y = top + plotH - (plotH * i) / 4;
      s += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${pad - 6}" y="${y + 4}" text-anchor="end">${fmt((max * i) / 4)}</text>`;
    }
    const every = Math.ceil(rows.length / 10);
    rows.forEach((r, i) => {
      const x = pad + i * step + (step - bw) / 2, h = ((r.value || 0) / max) * plotH;
      s += `<path d="${barPath(x, top + plotH - h, bw, h, bw >= 8 ? 4 : 1)}" fill="var(--series)"/>`;
      if (rows.length <= 10 && r.value) s += `<text x="${x + bw / 2}" y="${top + plotH - h - 5}" text-anchor="middle" style="fill:var(--text)">${fmt(r.value)}</text>`;
      if (i % every === 0) s += `<text x="${x + bw / 2}" y="${H - 10}" text-anchor="middle">${esc(r.label)}</text>`;
      s += `<rect class="hit" x="${pad + i * step}" y="${top}" width="${step}" height="${plotH}" data-tip="${esc(r.tip || `<b>${esc(r.label)}</b><br>${fmt(r.value)}`)}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${s}</svg>`;
  }

  // Thanh ngang: rows = [{label, value, tip}]
  function hbars(rows, { fmt = SPA.fmt, W = 560, left = 170, label = '' } = {}) {
    if (!rows.length) return empty('Chưa có dữ liệu.');
    const rowH = 26, right = 64, H = rows.length * rowH + 4;
    const max = Math.max(...rows.map((r) => r.value || 0)) || 1;
    let s = '';
    rows.forEach((r, i) => {
      const y = i * rowH + 3, w = ((W - left - right) * (r.value || 0)) / max;
      const lab = String(r.label);
      s += `<text x="${left - 8}" y="${y + 14}" text-anchor="end" style="fill:var(--text)">${esc(lab.length > 26 ? lab.slice(0, 25) + '…' : lab)}</text>`;
      s += `<path d="${hbarPath(left, y, Math.max(w, 2), rowH - 9)}" fill="var(--series)"/>`;
      s += `<text x="${left + w + 6}" y="${y + 14}">${fmt(r.value)}</text>`;
      s += `<rect class="hit" x="0" y="${y - 2}" width="${W}" height="${rowH}" data-tip="${esc(r.tip || `<b>${esc(lab)}</b><br>${fmt(r.value)}`)}"/>`;
    });
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${s}</svg>`;
  }

  // Đường theo thời gian: pts = [{t (ms), v}]
  function line(pts, { fmt = SPA.fmt, W = 560, H = 220, label = '', step = false } = {}) {
    pts = pts.filter((p) => p.v != null && Number.isFinite(p.v));
    if (pts.length < 2) return empty('Cần ít nhất 2 lần ghi nhận để vẽ (mở lại sản phẩm vào thời điểm khác).');
    const pad = 64, top = 14, bottom = 26, plotW = W - pad - 8, plotH = H - top - bottom;
    let lo = Math.min(...pts.map((p) => p.v)), hi = Math.max(...pts.map((p) => p.v));
    if (hi === lo) { hi += Math.max(1, hi * 0.05); lo = Math.max(0, lo - Math.max(1, lo * 0.05)); }
    const t0 = pts[0].t, t1 = pts[pts.length - 1].t;
    const X = (t) => pad + ((t - t0) / (t1 - t0 || 1)) * plotW;
    const Y = (v) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
    let s = '';
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4, y = Y(v);
      s += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${pad - 6}" y="${y + 4}" text-anchor="end">${fmt(v)}</text>`;
    }
    let d = '';
    pts.forEach((p, i) => {
      const x = X(p.t).toFixed(1), y = Y(p.v).toFixed(1);
      if (!i) d = `M${x},${y}`;
      else d += step ? `H${x}V${y}` : `L${x},${y}`;
    });
    s += `<path d="${d}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round"/>`;
    pts.forEach((p, i) => {
      const prev = pts[i - 1];
      const diff = prev ? p.v - prev.v : 0;
      if (pts.length <= 60) s += `<circle cx="${X(p.t)}" cy="${Y(p.v)}" r="4" fill="var(--series)" stroke="var(--card)" stroke-width="2"/>`;
      s += `<circle class="hit" cx="${X(p.t)}" cy="${Y(p.v)}" r="12" data-tip="${esc(`<b>${new Date(p.t).toLocaleString('vi-VN')}</b><br>${fmt(p.v)}${prev ? ` (${diff >= 0 ? '+' : ''}${fmt(diff)})` : ''}`)}"/>`;
    });
    s += `<text x="${pad}" y="${H - 6}">${new Date(t0).toLocaleDateString('vi-VN')}</text><text x="${W}" y="${H - 6}" text-anchor="end">${new Date(t1).toLocaleDateString('vi-VN')}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(label)}">${s}</svg>`;
  }

  const meter = (label, v, text) => `<div class="meter"><span>${label}</span><div class="track"><div class="fill" style="width:${Math.round(Math.max(0, Math.min(1, v)) * 100)}%"></div></div><b>${text ?? Math.round(v * 100)}</b></div>`;

  return { bars, hbars, line, meter, empty };
})();
