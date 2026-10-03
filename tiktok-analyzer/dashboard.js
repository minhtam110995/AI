const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const DUR = [
  { label: '< 15s', max: 15 }, { label: '15–30s', max: 30 }, { label: '30–60s', max: 60 },
  { label: '1–3 phút', max: 180 }, { label: '> 3 phút', max: Infinity },
];

const state = { videos: [], users: {}, sort: { key: 'createTime', dir: -1 } };

// ---------- dữ liệu ----------
async function loadData() {
  const { videos, users } = await TTA.load();
  state.videos = Object.values(videos).filter((v) => !v.isAd);
  state.users = users;
  const authors = [...new Set(state.videos.map((v) => v.author).filter(Boolean))].sort();
  const sel = $('#fAuthor');
  const cur = sel.value || new URLSearchParams(location.search).get('author') || '';
  sel.innerHTML = '<option value="">Tất cả kênh</option>' +
    authors.map((a) => `<option value="${esc(a)}">@${esc(a)} (${state.videos.filter((v) => v.author === a).length})</option>`).join('');
  sel.value = authors.includes(cur) ? cur : '';
  render();
}

function filtered() {
  const author = $('#fAuthor').value;
  const days = Number($('#fRange').value);
  const q = $('#fSearch').value.trim().toLowerCase().replace(/^#/, '');
  const since = days ? Date.now() / 1000 - days * 86400 : 0;
  return state.videos.filter((v) =>
    (!author || v.author === author) &&
    (!since || v.createTime >= since) &&
    (!q || v.desc.toLowerCase().includes(q) || v.hashtags.some((h) => h.includes(q))));
}

// ---------- tooltip ----------
const tip = $('#tip');
document.addEventListener('mousemove', (e) => {
  const t = e.target.closest?.('[data-tip]');
  if (!t) { tip.classList.remove('show'); return; }
  tip.innerHTML = t.getAttribute('data-tip');
  tip.classList.add('show');
  const r = tip.getBoundingClientRect();
  let x = e.clientX + 14, y = e.clientY + 14;
  if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14;
  if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14;
  tip.style.left = x + 'px'; tip.style.top = y + 'px';
});
document.addEventListener('click', (e) => {
  const a = e.target.closest?.('[data-href]');
  if (a) window.open(a.getAttribute('data-href'), '_blank');
});

// ---------- tiện ích vẽ SVG ----------
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}
// Cột bo tròn 4px ở đầu, đáy vuông bám trục.
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
const empty = (msg) => `<div class="empty">${msg}</div>`;
const yGrid = (W, pad, top, plotH, max) => {
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const y = top + plotH - (plotH * i) / 4;
    s += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>` +
      `<text x="${pad - 6}" y="${y + 4}" text-anchor="end">${TTA.fmt((max * i) / 4)}</text>`;
  }
  return s;
};

// ---------- biểu đồ ----------
function chartTimeline(list) {
  const el = $('#chartTimeline');
  const vs = list.filter((v) => v.createTime).sort((a, b) => a.createTime - b.createTime);
  if (vs.length < 2) return (el.innerHTML = empty('Cần ít nhất 2 video. Hãy mở trang kênh trên TikTok và cuộn xuống.'));
  const W = 960, H = 260, pad = 48, top = 10, bottom = 28, plotW = W - pad, plotH = H - top - bottom;
  const max = niceMax(Math.max(...vs.map((v) => v.views)));
  const step = plotW / vs.length;
  const bw = Math.max(1, Math.min(24, step - 2));
  const med = TTA.median(vs.map((v) => v.views));
  let bars = '', hits = '';
  vs.forEach((v, i) => {
    const x = pad + i * step + (step - bw) / 2;
    const h = (v.views / max) * plotH;
    bars += `<path d="${barPath(x, top + plotH - h, bw, h, bw >= 8 ? 4 : 1)}" fill="var(--series)"/>`;
    const t = `<b>${esc(TTA.fmtDate(v.createTime))}</b> · @${esc(v.author)}<br>${esc(v.desc.slice(0, 80))}<br>👁 ${TTA.fmt(v.views)} · ❤ ${TTA.fmt(v.likes)} · 💬 ${TTA.fmt(v.comments)} · ER ${TTA.pct(TTA.er(v))}`;
    hits += `<rect class="hit" x="${pad + i * step}" y="${top}" width="${step}" height="${plotH}" data-tip="${esc(t)}" data-href="https://www.tiktok.com/@${esc(v.author)}/video/${v.id}"/>`;
  });
  const my = top + plotH - (med / max) * plotH;
  let xl = '';
  const ticks = Math.min(6, vs.length);
  for (let i = 0; i < ticks; i++) {
    const idx = Math.round((i * (vs.length - 1)) / Math.max(1, ticks - 1));
    const x = pad + idx * step + step / 2;
    xl += `<text x="${x}" y="${H - 8}" text-anchor="${i === 0 ? 'start' : i === ticks - 1 ? 'end' : 'middle'}">${TTA.fmtDate(vs[idx].createTime)}</text>`;
  }
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lượt xem từng video theo ngày đăng">
    ${yGrid(W, pad, top, plotH, max)}${bars}
    <line x1="${pad}" x2="${W}" y1="${my}" y2="${my}" stroke="var(--text2)" stroke-dasharray="4 4" stroke-width="1.5"/>
    <text x="${W}" y="${my - 6}" text-anchor="end" style="fill:var(--text)">Trung vị ${TTA.fmt(med)}</text>
    ${xl}${hits}</svg>`;
}

function heatData(list) {
  const cells = {};
  list.forEach((v) => {
    if (!v.createTime) return;
    const d = new Date(v.createTime * 1000);
    (cells[d.getDay() + '-' + d.getHours()] ||= []).push(v.views);
  });
  return cells;
}

function chartHeat(list) {
  const el = $('#chartHeat');
  const cells = heatData(list);
  if (!Object.keys(cells).length) return (el.innerHTML = empty('Chưa có dữ liệu.'));
  const meds = Object.fromEntries(Object.entries(cells).map(([k, a]) => [k, TTA.median(a)]));
  const max = Math.max(...Object.values(meds));
  const cw = 20, ch = 22, left = 30, top = 4;
  const W = left + 24 * cw, H = top + 7 * ch + 22;
  let s = '';
  DAY_ORDER.forEach((d, r) => {
    s += `<text x="${left - 6}" y="${top + r * ch + ch / 2 + 4}" text-anchor="end">${DAYS[d]}</text>`;
    for (let h = 0; h < 24; h++) {
      const k = d + '-' + h, m = meds[k];
      const lvl = m == null ? 0 : 1 + Math.min(6, Math.floor((m / max) * 7));
      const t = m == null ? `${DAYS[d]}, ${h}h: chưa có video` : `<b>${DAYS[d]}, ${h}h–${h + 1}h</b><br>${cells[k].length} video · trung vị ${TTA.fmt(m)} view`;
      s += `<rect x="${left + h * cw + 1}" y="${top + r * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="var(--h${lvl})" data-tip="${esc(t)}"/>`;
    }
  });
  for (let h = 0; h < 24; h += 3) s += `<text x="${left + h * cw + cw / 2}" y="${H - 6}" text-anchor="middle">${h}h</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Bản đồ nhiệt giờ đăng">${s}</svg>`;
}

function durationStats(list) {
  return DUR.map((b, i) => {
    const min = i ? DUR[i - 1].max : 0;
    const vs = list.filter((v) => v.duration > 0 && v.duration >= min && v.duration < b.max);
    return { ...b, n: vs.length, med: TTA.median(vs.map((v) => v.views)), er: vs.length ? vs.reduce((a, v) => a + TTA.er(v), 0) / vs.length : 0 };
  });
}

function chartDuration(list) {
  const el = $('#chartDuration');
  const st = durationStats(list);
  if (!st.some((b) => b.n)) return (el.innerHTML = empty('Chưa có dữ liệu độ dài video.'));
  const W = 480, H = 220, pad = 44, top = 18, bottom = 26, plotH = H - top - bottom;
  const max = niceMax(Math.max(...st.map((b) => b.med)));
  const step = (W - pad) / st.length, bw = Math.min(56, step * 0.6);
  let s = yGrid(W, pad, top, plotH, max);
  st.forEach((b, i) => {
    const x = pad + i * step + (step - bw) / 2, h = (b.med / max) * plotH;
    s += `<path d="${barPath(x, top + plotH - h, bw, h)}" fill="var(--series)"/>`;
    if (b.n) s += `<text x="${x + bw / 2}" y="${top + plotH - h - 5}" text-anchor="middle" style="fill:var(--text)">${TTA.fmt(b.med)}</text>`;
    s += `<text x="${x + bw / 2}" y="${H - 8}" text-anchor="middle">${b.label}</text>`;
    s += `<rect class="hit" x="${pad + i * step}" y="${top}" width="${step}" height="${plotH}" data-tip="${esc(`<b>${b.label}</b><br>${b.n} video · trung vị ${TTA.fmt(b.med)} view<br>ER TB ${TTA.pct(b.er)}`)}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Lượt xem theo độ dài video">${s}</svg>`;
}

function tagStats(list) {
  const m = {};
  list.forEach((v) => v.hashtags.forEach((h) => (m[h] ||= []).push(v)));
  return Object.entries(m).filter(([, vs]) => vs.length >= 2)
    .map(([tag, vs]) => ({ tag, n: vs.length, med: TTA.median(vs.map((v) => v.views)) }))
    .sort((a, b) => b.med - a.med);
}

function chartTags(list) {
  const el = $('#chartTags');
  const st = tagStats(list).slice(0, 10);
  if (!st.length) return (el.innerHTML = empty('Chưa đủ dữ liệu hashtag (cần hashtag xuất hiện ≥ 2 video).'));
  const W = 480, rowH = 24, left = 130, right = 56, H = st.length * rowH + 4;
  const max = Math.max(...st.map((t) => t.med));
  let s = '';
  st.forEach((t, i) => {
    const y = i * rowH + 3, w = ((W - left - right) * t.med) / max;
    s += `<text x="${left - 8}" y="${y + 13}" text-anchor="end" style="fill:var(--text)">#${esc(t.tag.length > 16 ? t.tag.slice(0, 15) + '…' : t.tag)}</text>`;
    s += `<path d="${hbarPath(left, y, Math.max(w, 2), rowH - 8)}" fill="var(--series)"/>`;
    s += `<text x="${left + w + 6}" y="${y + 13}">${TTA.fmt(t.med)}</text>`;
    s += `<rect class="hit" x="0" y="${y - 2}" width="${W}" height="${rowH}" data-tip="${esc(`<b>#${t.tag}</b><br>${t.n} video · trung vị ${TTA.fmt(t.med)} view`)}"/>`;
  });
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Hashtag hiệu quả">${s}</svg>`;
}

function chartGrowth(author) {
  const el = $('#chartGrowth');
  const hist = author ? state.users[author]?.history || [] : [];
  if (!author) return (el.innerHTML = empty('Chọn 1 kênh ở bộ lọc để xem tăng trưởng follower.'));
  if (hist.length < 2) return (el.innerHTML = empty('Cần ít nhất 2 lần ghi nhận (mở lại trang kênh vào ngày khác).'));
  const W = 480, H = 220, pad = 52, top = 14, bottom = 26, plotW = W - pad - 8, plotH = H - top - bottom;
  const ys = hist.map((p) => p.followers);
  let lo = Math.min(...ys), hi = Math.max(...ys);
  if (hi === lo) { hi += 1; lo = Math.max(0, lo - 1); }
  const t0 = hist[0].t, t1 = hist[hist.length - 1].t;
  const X = (t) => pad + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const Y = (v) => top + plotH - ((v - lo) / (hi - lo)) * plotH;
  let s = '';
  for (let i = 0; i <= 4; i++) {
    const v = lo + ((hi - lo) * i) / 4, y = Y(v);
    s += `<line x1="${pad}" x2="${W}" y1="${y}" y2="${y}" stroke="var(--grid)"/><text x="${pad - 6}" y="${y + 4}" text-anchor="end">${TTA.fmt(v)}</text>`;
  }
  s += `<path d="${hist.map((p, i) => (i ? 'L' : 'M') + X(p.t).toFixed(1) + ',' + Y(p.followers).toFixed(1)).join('')}" fill="none" stroke="var(--series)" stroke-width="2" stroke-linejoin="round"/>`;
  hist.forEach((p, i) => {
    const prev = hist[i - 1];
    const d = prev ? p.followers - prev.followers : 0;
    s += `<circle cx="${X(p.t)}" cy="${Y(p.followers)}" r="4" fill="var(--series)" stroke="var(--card)" stroke-width="2"/>`;
    s += `<circle class="hit" cx="${X(p.t)}" cy="${Y(p.followers)}" r="12" data-tip="${esc(`<b>${new Date(p.t).toLocaleString('vi-VN')}</b><br>${TTA.fmt(p.followers)} follower${prev ? ` (${d >= 0 ? '+' : ''}${TTA.fmt(d)})` : ''}`)}"/>`;
  });
  s += `<text x="${pad}" y="${H - 6}">${new Date(t0).toLocaleDateString('vi-VN')}</text><text x="${W}" y="${H - 6}" text-anchor="end">${new Date(t1).toLocaleDateString('vi-VN')}</text>`;
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Tăng trưởng follower">${s}</svg>`;
}

// ---------- KPI, gợi ý, bảng ----------
function postsPerWeek(list) {
  const ts = list.map((v) => v.createTime).filter(Boolean);
  if (ts.length < 2) return 0;
  const weeks = (Math.max(...ts) - Math.min(...ts)) / (7 * 86400);
  return weeks > 0 ? ts.length / weeks : 0;
}

function renderProfile(author) {
  const box = $('#profile');
  const u = author && state.users[author];
  if (!u) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  box.innerHTML = `<img src="${esc(u.avatar)}" alt="">
    <div><b>${esc(u.nickname)}</b> <span class="muted">@${esc(u.uniqueId)}${u.verified ? ' ✔' : ''}</span>
    <div class="muted small">${esc(u.signature)}</div>
    <div class="small">${TTA.fmt(u.followers)} follower · ${TTA.fmt(u.hearts)} tim · ${TTA.fmt(u.videoCount)} video · cập nhật ${new Date(u.updatedAt).toLocaleString('vi-VN')}</div></div>`;
}

function renderKpis(list, author) {
  const sum = (k) => list.reduce((a, v) => a + v[k], 0);
  const views = sum('views');
  const withViews = list.filter((v) => v.views > 0);
  const avgEr = withViews.reduce((a, v) => a + TTA.er(v), 0) / (withViews.length || 1);
  const med = TTA.median(list.map((v) => v.views));
  const viral = list.filter((v) => v.views >= 3 * med && med > 0).length;
  const u = author && state.users[author];
  const k = [
    ['Video', TTA.fmt(list.length)],
    ['Tổng lượt xem', TTA.fmt(views)],
    ['View trung vị / video', TTA.fmt(med)],
    ['Tỉ lệ tương tác TB', TTA.pct(avgEr)],
    ['Like / Bình luận', `${TTA.fmt(sum('likes'))} / ${TTA.fmt(sum('comments'))}`],
    ['Share / Lưu', `${TTA.fmt(sum('shares'))} / ${TTA.fmt(sum('saves'))}`],
    ['Tần suất đăng', postsPerWeek(list).toFixed(1) + ' video/tuần'],
    ['Video bứt phá (≥3× trung vị)', `${viral} (${TTA.pct(viral / (list.length || 1), 0)})`],
  ];
  if (u?.followers) k.push(['View trung vị / follower', TTA.pct(med / u.followers)]);
  $('#kpis').innerHTML = k.map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('');
}

function renderInsights(list, author) {
  const out = [];
  if (list.length < 5) {
    out.push('Mới có ít video. Mở trang kênh trên TikTok và bấm <b>“Tự cuộn để thu thập”</b> trong tiện ích để có phân tích chính xác hơn.');
  } else {
    const med = TTA.median(list.map((v) => v.views));
    const cells = Object.entries(heatData(list)).filter(([, a]) => a.length >= 2)
      .map(([k, a]) => ({ k, n: a.length, m: TTA.median(a) })).sort((a, b) => b.m - a.m);
    if (cells.length) {
      const [d, h] = cells[0].k.split('-').map(Number);
      out.push(`Khung giờ tốt nhất: <b>${DAYS[d]}, ${h}h–${h + 1}h</b> (trung vị ${TTA.fmt(cells[0].m)} view, ${cells[0].n} video, gấp ${(cells[0].m / (med || 1)).toFixed(1)}× mức chung).`);
    }
    const byDay = DAY_ORDER.map((d) => ({ d, a: list.filter((v) => v.createTime && new Date(v.createTime * 1000).getDay() === d).map((v) => v.views) }))
      .filter((x) => x.a.length >= 2).map((x) => ({ ...x, m: TTA.median(x.a) })).sort((a, b) => b.m - a.m);
    if (byDay.length >= 2) out.push(`Ngày đăng hiệu quả nhất: <b>${DAYS[byDay[0].d]}</b> (${TTA.fmt(byDay[0].m)} view trung vị); kém nhất: ${DAYS[byDay[byDay.length - 1].d]} (${TTA.fmt(byDay[byDay.length - 1].m)}).`);
    const dur = durationStats(list).filter((b) => b.n >= 2).sort((a, b) => b.med - a.med);
    if (dur.length) out.push(`Độ dài hiệu quả nhất: <b>${dur[0].label}</b> (${TTA.fmt(dur[0].med)} view trung vị, ${dur[0].n} video).`);
    const tags = tagStats(list).slice(0, 3);
    if (tags.length) out.push(`Hashtag kéo view tốt: ${tags.map((t) => `<b>#${esc(t.tag)}</b> (${TTA.fmt(t.med)})`).join(', ')}.`);
    const avgEr = list.reduce((a, v) => a + TTA.er(v), 0) / list.length;
    out.push(`Tỉ lệ tương tác trung bình <b>${TTA.pct(avgEr)}</b> = (like + bình luận + share + lưu) / view.`);
    const shareRate = list.reduce((a, v) => a + v.shares, 0) / (list.reduce((a, v) => a + v.views, 0) || 1);
    const saveRate = list.reduce((a, v) => a + v.saves, 0) / (list.reduce((a, v) => a + v.views, 0) || 1);
    out.push(`Tỉ lệ share ${TTA.pct(shareRate, 2)}, tỉ lệ lưu ${TTA.pct(saveRate, 2)}. Đây là 2 tín hiệu thuật toán đánh giá cao, hãy xem các video có share/lưu cao nhất trong bảng để nhân bản format.`);
    const top = [...list].sort((a, b) => b.views - a.views)[0];
    if (top) out.push(`Video nhiều view nhất: <a href="https://www.tiktok.com/@${esc(top.author)}/video/${top.id}" target="_blank">${esc(top.desc.slice(0, 70) || top.id)}</a> (${TTA.fmt(top.views)} view, gấp ${(top.views / (med || 1)).toFixed(1)}× trung vị).`);
    const music = {};
    list.forEach((v) => v.music && (music[v.music] ||= []).push(v.views));
    const tm = Object.entries(music).filter(([, a]) => a.length >= 2).sort((a, b) => TTA.median(b[1]) - TTA.median(a[1]))[0];
    if (tm) out.push(`Âm thanh hiệu quả: <b>${esc(tm[0])}</b> (${tm[1].length} video, ${TTA.fmt(TTA.median(tm[1]))} view trung vị).`);
  }
  if (!author && new Set(list.map((v) => v.author)).size > 1) out.push('Đang gộp nhiều kênh. Chọn 1 kênh ở bộ lọc để có gợi ý riêng cho kênh đó.');
  $('#insights').innerHTML = out.map((x) => `<li>${x}</li>`).join('');
}

function renderChannels(list) {
  const by = {};
  list.forEach((v) => (by[v.author] ||= []).push(v));
  const rows = Object.entries(by).map(([a, vs]) => {
    const u = state.users[a];
    return { a, u, n: vs.length, med: TTA.median(vs.map((v) => v.views)), er: vs.reduce((s, v) => s + TTA.er(v), 0) / vs.length, ppw: postsPerWeek(vs), last: Math.max(...vs.map((v) => v.createTime)) };
  }).sort((x, y) => y.med - x.med);
  $('#channelsCard').classList.toggle('hidden', rows.length < 2);
  $('#channels').innerHTML = `<thead><tr><th>Kênh</th><th>Follower</th><th>Video thu thập</th><th>View trung vị</th><th>ER TB</th><th>Video/tuần</th><th>Đăng gần nhất</th></tr></thead><tbody>` +
    rows.map((r) => `<tr data-author="${esc(r.a)}" style="cursor:pointer"><td>@${esc(r.a)}</td><td>${r.u ? TTA.fmt(r.u.followers) : '–'}</td><td>${r.n}</td><td>${TTA.fmt(r.med)}</td><td>${TTA.pct(r.er)}</td><td>${r.ppw.toFixed(1)}</td><td>${TTA.fmtDate(r.last)}</td></tr>`).join('') + '</tbody>';
}
$('#channels').addEventListener('click', (e) => {
  const tr = e.target.closest('tr[data-author]');
  if (tr) { $('#fAuthor').value = tr.dataset.author; render(); scrollTo({ top: 0, behavior: 'smooth' }); }
});

const COLS = [
  { key: 'desc', label: 'Video', cls: 'l' },
  { key: 'createTime', label: 'Ngày đăng', fmt: TTA.fmtDate },
  { key: 'views', label: 'View', fmt: TTA.fmt },
  { key: 'likes', label: 'Like', fmt: TTA.fmt },
  { key: 'comments', label: 'Bình luận', fmt: TTA.fmt },
  { key: 'shares', label: 'Share', fmt: TTA.fmt },
  { key: 'saves', label: 'Lưu', fmt: TTA.fmt },
  { key: 'er', label: 'ER', fmt: (x) => TTA.pct(x) },
  { key: 'duration', label: 'Độ dài', fmt: (x) => (x ? x + 's' : '–') },
];

function renderTable(list) {
  const med = TTA.median(list.map((v) => v.views));
  const { key, dir } = state.sort;
  const val = (v) => (key === 'er' ? TTA.er(v) : v[key]);
  const rows = [...list].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0)).slice(0, 300);
  $('#tableInfo').textContent = list.length > 300 ? `Hiển thị 300/${list.length} video (xuất CSV để xem đủ)` : `${list.length} video`;
  $('#videos').innerHTML = '<thead><tr><th class="l"></th>' + COLS.map((c) => `<th data-key="${c.key}" class="${c.cls || ''}">${c.label}${key === c.key ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('') + '</tr></thead><tbody>' +
    rows.map((v) => {
      const url = `https://www.tiktok.com/@${esc(v.author)}/video/${v.id}`;
      const badge = med > 0 && v.views >= 3 * med ? '<span class="tag">🔥 bứt phá</span>' : '';
      return `<tr><td><img class="thumb" loading="lazy" src="${esc(v.cover)}" alt=""></td>
        <td class="desc"><a href="${url}" target="_blank">${esc(v.desc.slice(0, 120) || '(không có mô tả)')}</a>${badge}<div class="muted small">@${esc(v.author)}</div></td>` +
        COLS.slice(1).map((c) => `<td>${c.fmt(c.key === 'er' ? TTA.er(v) : v[c.key])}</td>`).join('') + '</tr>';
    }).join('') + '</tbody>';
}
$('#videos').addEventListener('click', (e) => {
  const th = e.target.closest('th[data-key]');
  if (!th) return;
  const k = th.dataset.key;
  state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : -1 };
  renderTable(filtered());
});

function render() {
  const author = $('#fAuthor').value;
  const list = filtered();
  $('#subtitle').textContent = `${state.videos.length} video · ${Object.keys(state.users).length} kênh đã lưu${author ? ` · đang xem @${author}` : ''}`;
  renderProfile(author);
  renderKpis(list, author);
  renderInsights(list, author);
  chartTimeline(list);
  chartHeat(list);
  chartDuration(list);
  chartTags(list);
  chartGrowth(author);
  renderChannels(list);
  renderTable(list);
}

// ---------- xuất / nhập ----------
$('#exportCsv').onclick = () => TTA.download(`tiktok-${$('#fAuthor').value || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, TTA.toCSV(filtered()));
$('#exportJson').onclick = async () => TTA.download(`tiktok-analyzer-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await TTA.load()), 'application/json');
$('#importJson').onchange = async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    const cur = await TTA.load();
    chrome.storage.local.set({ videos: { ...cur.videos, ...(data.videos || {}) }, users: { ...cur.users, ...(data.users || {}) } }, loadData);
  } catch (_) { alert('File JSON không hợp lệ.'); }
  e.target.value = '';
};

['#fAuthor', '#fRange'].forEach((s) => $(s).addEventListener('change', render));
let st;
$('#fSearch').addEventListener('input', () => { clearTimeout(st); st = setTimeout(render, 200); });
let lt;
chrome.storage.onChanged.addListener(() => { clearTimeout(lt); lt = setTimeout(loadData, 1000); });
loadData();
// Ảnh bìa TikTok có hạn dùng: ẩn ảnh lỗi (không dùng onerror inline vì CSP của tiện ích).
document.addEventListener('error', (e) => { if (e.target.tagName === 'IMG') e.target.style.visibility = 'hidden'; }, true);
