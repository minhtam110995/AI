// Dashboard Facebook Analyzer: Fanpage, Reels, Theo dõi đối thủ.
const $ = (s) => document.querySelector(s);
const DAYS = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const S = { posts: [], pages: {}, watch: [], settings: {}, sort: { key: 'time', dir: -1 } };
const isReel = (p) => p.type === 'reel' || p.type === 'video';
const median = FBA.median;

// ---------- dữ liệu ----------
async function load() {
  const all = await chrome.storage.local.get(null);
  S.posts = Object.values(all.posts || {});
  S.pages = all.pages || {};
  S.watch = all.watchPages || [];
  S.settings = all.fbSettings || {};
  S.lastRefresh = all.lastRefresh;
  const names = [...new Set(S.posts.map((p) => p.page).filter(Boolean))].sort();
  const sel = $('#fPage');
  const cur = sel.value || new URLSearchParams(location.search).get('page') || '';
  sel.innerHTML = '<option value="">Tất cả fanpage</option>' + names.map((n) => `<option value="${esc(n)}">${esc(n)} (${S.posts.filter((p) => p.page === n).length})</option>`).join('');
  sel.value = names.includes(cur) ? cur : '';
  $('#subtitle').textContent = `${S.posts.length} bài · ${S.posts.filter(isReel).length} Reels/video · ${names.length} fanpage · ${S.watch.length} đang theo dõi`;
  render();
}

function filtered({ ignoreType = false } = {}) {
  const page = $('#fPage').value, days = Number($('#fRange').value), type = $('#fType').value;
  const q = $('#fSearch').value.trim().toLowerCase().replace(/^#/, '');
  const since = days ? Date.now() / 1000 - days * 86400 : 0;
  return S.posts.filter((p) => (!page || p.page === page) && (!since || !p.time || p.time >= since) &&
    (ignoreType || !type || p.type === type) && (!q || (p.text || '').toLowerCase().includes(q) || (p.hashtags || []).some((h) => h.includes(q))));
}

// Bứt phá = chỉ số của bài ÷ trung vị của trang (Reels/video so theo lượt xem, bài khác theo tương tác)
const medCache = new Map();
function pageMedian(page, kind) {
  const k = page + '|' + kind;
  if (!medCache.has(k)) {
    const vs = S.posts.filter((p) => p.page === page && FBA.metricKind(p) === kind).map(FBA.metric);
    medCache.set(k, vs.length >= 3 ? median(vs) : null);
  }
  return medCache.get(k);
}
const ratio = (p) => { const m = pageMedian(p.page, FBA.metricKind(p)); return m ? FBA.metric(p) / m : null; };
const pill = (p) => { const r = ratio(p); return r >= 3 ? `<span class="pill hot">🔥 ${r.toFixed(1)}×</span>` : r >= 2 ? `<span class="pill warm">🔥 ${r.toFixed(1)}×</span>` : ''; };
const link = (p, text) => p.url ? `<a href="${esc(p.url)}" target="_blank">${esc(text)}</a>` : esc(text);
const kpis = (items) => `<section class="kpis">${items.map(([l, v, t]) => `<div class="kpi" ${t ? `title="${esc(t)}"` : ''}><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</section>`;
const tbl = (head, rows, emptyMsg = 'Chưa có dữ liệu') => `<div class="tablewrap"><table><thead><tr>${head.map((h, i) => `<th class="${i ? '' : 'l'}">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? '' : 'desc'}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td class="desc muted" colspan="${head.length}">${emptyMsg}</td></tr>`}</tbody></table></div>`;
const followersOf = (page) => S.pages[page]?.followers || null;
const postsPerWeek = (list) => {
  const ts = list.map((p) => p.time).filter(Boolean);
  if (ts.length < 2) return null;
  const w = (Math.max(...ts) - Math.min(...ts)) / (7 * 86400);
  return w > 0 ? ts.length / w : null;
};

// ---------- biểu đồ dùng chung ----------
function timeline(list, label, M = FBA.engagement) {
  const vs = list.filter((p) => p.time).sort((a, b) => a.time - b.time);
  if (vs.length < 2) return Charts.empty('Cần ít nhất 2 bài có thời gian đăng.');
  const rows = vs.map((p) => ({ label: FBA.fmtDate(p.time).slice(0, 5), value: M(p),
    tip: `<b>${FBA.fmtDate(p.time)}</b> · ${esc(FBA.TYPE_LABEL[p.type])}<br>${esc((p.text || '').slice(0, 90))}<br>${isReel(p) && p.views ? `▶ ${FBA.fmt(p.views)} · ` : ''}👍 ${FBA.fmt(p.reactions)} · 💬 ${FBA.fmt(p.comments)} · ↗ ${FBA.fmt(p.shares)}` }));
  return Charts.bars(rows, { W: 960, H: 250, label });
}

function heatmap(list, M = FBA.engagement) {
  const cells = {};
  list.forEach((p) => { if (p.time) { const d = new Date(p.time * 1000); (cells[d.getDay() + '-' + d.getHours()] ||= []).push(M(p)); } });
  if (!Object.keys(cells).length) return Charts.empty('Chưa có bài nào có thời gian đăng.');
  const meds = Object.fromEntries(Object.entries(cells).map(([k, a]) => [k, median(a)]));
  const max = Math.max(...Object.values(meds));
  const cw = 20, ch = 22, left = 30, top = 4, W = left + 24 * cw, H = top + 7 * ch + 22;
  let s = '';
  DAY_ORDER.forEach((d, r) => {
    s += `<text x="${left - 6}" y="${top + r * ch + ch / 2 + 4}" text-anchor="end">${DAYS[d]}</text>`;
    for (let h = 0; h < 24; h++) {
      const k = d + '-' + h, m = meds[k];
      const lvl = m == null ? 0 : 1 + Math.min(6, Math.floor((m / max) * 7));
      const t = m == null ? `${DAYS[d]}, ${h}h: chưa có bài` : `<b>${DAYS[d]}, ${h}h–${h + 1}h</b><br>${cells[k].length} bài · trung vị ${FBA.fmt(m)}`;
      s += `<rect x="${left + h * cw + 1}" y="${top + r * ch + 1}" width="${cw - 2}" height="${ch - 2}" rx="3" fill="var(--h${lvl})" data-tip="${esc(t)}"/>`;
    }
  });
  for (let h = 0; h < 24; h += 3) s += `<text x="${left + h * cw + cw / 2}" y="${H - 6}" text-anchor="middle">${h}h</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Giờ đăng hiệu quả">${s}</svg>`;
}
function bestSlots(list, M = FBA.engagement, n = 5) {
  const cells = {};
  list.forEach((p) => { if (p.time) { const d = new Date(p.time * 1000); (cells[d.getDay() + '-' + d.getHours()] ||= []).push(M(p)); } });
  return Object.entries(cells).filter(([, a]) => a.length >= 2).map(([k, a]) => ({ k, n: a.length, m: median(a) })).sort((a, b) => b.m - a.m).slice(0, n);
}
function groupBy(list, keyFn, M = FBA.engagement) {
  const g = {};
  list.forEach((p) => (g[keyFn(p)] ||= []).push(p));
  const all = median(list.map(M)) || 1;
  return Object.entries(g).map(([name, vs]) => ({ name, vs, n: vs.length, med: median(vs.map(M)), best: [...vs].sort((a, b) => M(b) - M(a))[0] }))
    .map((x) => ({ ...x, ratio: x.med / all })).sort((a, b) => b.med - a.med);
}
const groupBars = (groups, unit) => Charts.hbars(groups.map((g) => ({ label: `${g.name} (${g.n})`, value: g.med, tip: `<b>${esc(g.name)}</b> · ${g.n} bài<br>Trung vị ${FBA.fmt(g.med)} ${unit} (${g.ratio.toFixed(1)}× mức chung)` })), { left: 190 });

function profileCard(page) {
  const info = S.pages[page];
  if (!info) return '';
  const h = info.history || [];
  const wk = h.filter((x) => x.t <= Date.now() - 7 * 864e5).pop() || h[0];
  const g = wk && info.followers != null ? info.followers - wk.followers : null;
  return `<section class="card"><h2>📘 ${esc(page)} <a class="small" href="${esc(info.url)}" target="_blank">mở trang</a></h2>
    <div class="small">${info.followers != null ? FBA.fmt(info.followers) + ' người theo dõi' : 'Chưa đọc được số người theo dõi'}${info.likes ? ' · ' + FBA.fmt(info.likes) + ' lượt thích' : ''}${g != null && h.length > 1 ? ` · ${g >= 0 ? '+' : ''}${FBA.fmt(g)} trong 7 ngày` : ''} · cập nhật ${new Date(info.updatedAt).toLocaleString('vi-VN')}</div></section>`;
}

// ================= 📊 Fanpage =================
function renderPage(el) {
  const page = $('#fPage').value;
  const list = filtered();
  if (!list.length) {
    el.innerHTML = `<section class="card"><h2>Chưa có dữ liệu</h2><ol class="small"><li>Mở fanpage đối thủ trên facebook.com.</li><li>Bấm biểu tượng tiện ích → <b>⬇ Quét bài viết</b> (và <b>🎬 Quét Reels</b>).</li><li>Quay lại đây để xem phân tích.</li></ol></section>`;
    return;
  }
  const posts = list.filter((p) => !isReel(p));
  const eng = list.map(FBA.engagement);
  const brk = list.filter((p) => ratio(p) >= 3);
  const fl = page ? followersOf(page) : null;
  const typesEng = groupBy(list.filter((p) => p.reactions != null), (p) => FBA.TYPE_LABEL[p.type]);
  const hooks = groupBy(posts.length >= 3 ? posts : list, (p) => FBA.hookType(p.text));
  const slots = bestSlots(posts.length >= 3 ? posts : list);
  const top = [...list].sort((a, b) => FBA.engagement(b) - FBA.engagement(a))[0];
  const tags = {};
  list.forEach((p) => (p.hashtags || []).forEach((h) => (tags[h] ||= []).push(FBA.engagement(p))));
  const tagRows = Object.entries(tags).filter(([, a]) => a.length >= 2).map(([h, a]) => ({ label: '#' + h, value: median(a), n: a.length })).sort((a, b) => b.value - a.value).slice(0, 10);
  const lenG = groupBy(posts.length >= 3 ? posts : list, (p) => { const n = (p.text || '').length; return n < 80 ? 'Ngắn (< 80 ký tự)' : n < 300 ? 'Vừa (80–300)' : 'Dài (> 300)'; });

  const ins = [];
  if (typesEng[0] && typesEng.length > 1) ins.push(`Định dạng nhiều tương tác nhất: <b>${typesEng[0].name}</b> (trung vị ${FBA.fmt(typesEng[0].med)} tương tác/bài, ${typesEng[0].n} bài).`);
  if (slots[0]) { const [d, h] = slots[0].k.split('-').map(Number); ins.push(`Khung giờ tốt nhất: <b>${DAYS[d]}, ${h}h–${h + 1}h</b> (trung vị ${FBA.fmt(slots[0].m)}, ${slots[0].n} bài).`); }
  const bh = hooks.find((h) => h.n >= 2 && !['Khác', 'Không có caption'].includes(h.name));
  if (bh) ins.push(`Kiểu câu mở đầu hiệu quả: <b>${bh.name}</b> (gấp ${bh.ratio.toFixed(1)}× mức chung).`);
  if (lenG.length > 1) ins.push(`Độ dài nội dung tốt nhất: <b>${lenG[0].name}</b>.`);
  ins.push(`<b>${brk.length}</b> bài bứt phá (≥ 3× trung vị của trang) — ${FBA.pct(brk.length / list.length, 0)} số bài.`);
  if (top) ins.push(`Bài nhiều tương tác nhất: ${link(top, (top.text || '(không có chữ)').slice(0, 70))} (${FBA.fmt(FBA.engagement(top))} tương tác).`);
  if (list.some((p) => !p.time)) ins.push(`<span class="muted">${list.filter((p) => !p.time).length} bài chỉ đọc được từ giao diện (chưa có giờ đăng) nên không có trong biểu đồ thời gian.</span>`);

  // So sánh fanpage
  const byPage = {};
  S.posts.forEach((p) => (byPage[p.page] ||= []).push(p));
  const cmp = Object.entries(byPage).map(([n, ps]) => {
    const pp = ps.filter((p) => !isReel(p)), rr = ps.filter(isReel);
    return [`<a href="?page=${encodeURIComponent(n)}#page">${esc(n)}</a>${S.watch.includes(n) ? ' ⭐' : ''}`, FBA.fmt(followersOf(n)), ps.length,
      FBA.fmt(median(pp.map(FBA.engagement))), FBA.fmt(median(rr.map((p) => p.views))), postsPerWeek(ps)?.toFixed(1) ?? '–',
      FBA.pct(ps.filter((p) => ratio(p) >= 3).length / ps.length, 0)];
  });

  el.innerHTML = `
    ${page ? profileCard(page) : ''}
    ${kpis([['Bài viết', list.length], ['Tương tác trung vị / bài', FBA.fmt(median(eng)), 'Cảm xúc + bình luận + chia sẻ'],
      ['Tương tác / người theo dõi', fl ? FBA.pct(median(eng) / fl, 2) : '–', 'Tương tác trung vị ÷ số người theo dõi'],
      ['Tần suất đăng', postsPerWeek(list) ? postsPerWeek(list).toFixed(1) + ' bài/tuần' : '–'],
      ['Bài bứt phá (≥ 3×)', `${brk.length} (${FBA.pct(brk.length / list.length, 0)})`],
      ['Tỉ lệ Reels/video', FBA.pct(list.filter(isReel).length / list.length, 0)]])}
    <section class="card insights"><h2>💡 Nhận định</h2><ul>${ins.map((x) => `<li>${x}</li>`).join('')}</ul></section>
    <section class="card"><h2>Tương tác từng bài theo ngày đăng</h2><p class="muted small">Tương tác = cảm xúc + bình luận + chia sẻ. Lượt xem Reels xem ở tab 🎬 Reels.</p><div class="chart">${timeline(list.filter((p) => p.reactions != null), 'Tương tác từng bài')}</div></section>
    <div class="grid2">
      <section class="card"><h2>Giờ & ngày đăng hiệu quả</h2><p class="muted small">Tương tác trung vị theo khung giờ đăng (giờ máy bạn).</p><div class="chart">${heatmap(list.filter((p) => p.reactions != null))}</div></section>
      <section class="card"><h2>Định dạng nào ăn tương tác?</h2><p class="muted small">Tương tác trung vị theo định dạng bài.</p><div class="chart">${Charts.hbars(typesEng.map((g) => ({ label: `${g.name} (${g.n})`, value: g.med })), { left: 150 })}</div></section>
      <section class="card"><h2>Kiểu câu mở đầu</h2><p class="muted small">Phân loại theo dòng đầu tiên của bài.</p><div class="chart">${groupBars(hooks, 'tương tác')}</div></section>
      <section class="card"><h2>Độ dài nội dung & hashtag</h2><div class="chart">${groupBars(lenG, 'tương tác')}</div>
        ${tagRows.length ? `<div class="chart">${Charts.hbars(tagRows.map((t) => ({ label: `${t.label} (${t.n})`, value: t.value })), { left: 150 })}</div>` : ''}</section>
    </div>
    <section class="card" style="margin-top:16px"><h2>So sánh fanpage</h2>${tbl(['Fanpage', 'Người theo dõi', 'Bài đã lưu', 'Tương tác TV/bài', 'View TV/Reels', 'Bài/tuần', 'Tỉ lệ bứt phá'], cmp)}</section>
    <section class="card"><div class="tablehead"><h2>Danh sách bài</h2><span class="muted small">${list.length} bài · bấm tiêu đề cột để sắp xếp</span></div><div id="postTable"></div></section>`;
  postTable(list);
}

const PCOLS = [
  ['time', 'Ngày đăng', (p) => FBA.fmtDate(p.time)], ['type', 'Loại', (p) => FBA.TYPE_LABEL[p.type]],
  ['reactions', 'Cảm xúc', (p) => FBA.fmt(p.reactions)], ['comments', 'Bình luận', (p) => FBA.fmt(p.comments)],
  ['shares', 'Chia sẻ', (p) => FBA.fmt(p.shares)], ['views', 'Lượt xem', (p) => FBA.fmt(p.views)],
  ['ratio', 'So với TV trang', (p) => { const r = ratio(p); return r == null ? '–' : r.toFixed(1) + '×'; }],
];
function postTable(list) {
  const { key, dir } = S.sort;
  const val = (p) => (key === 'ratio' ? ratio(p) : p[key]) ?? -Infinity;
  const rows = [...list].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0)).slice(0, 300);
  $('#postTable').innerHTML = `<div class="tablewrap"><table><thead><tr><th class="l">Bài viết</th><th>Fanpage</th>${PCOLS.map(([k, l]) => `<th data-key="${k}">${l}${key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((p) => `<tr><td class="desc">${link(p, (p.text || '(không có chữ)').slice(0, 110))}${pill(p)}</td><td>${esc(p.page)}</td>${PCOLS.map(([, , f]) => `<td>${f(p)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  $('#postTable thead').onclick = (e) => {
    const th = e.target.closest('th[data-key]');
    if (!th) return;
    S.sort = { key: th.dataset.key, dir: S.sort.key === th.dataset.key ? -S.sort.dir : -1 };
    postTable(list);
  };
}

// ================= 🎬 Reels =================
function renderReels(el) {
  const page = $('#fPage').value;
  const list = filtered({ ignoreType: true }).filter((p) => isReel(p) && p.views != null);
  const V = (p) => p.views || 0;
  if (!list.length) {
    el.innerHTML = `<section class="card"><h2>Chưa có Reels</h2><p class="small">Mở fanpage → bấm biểu tượng tiện ích → <b>🎬 Quét Reels</b>. Tiện ích mở tab Reels của trang, tự cuộn và ghi lượt xem từng Reels.</p></section>`;
    return;
  }
  const views = list.map((p) => p.views);
  const ers = list.map(FBA.er).filter((x) => x != null);
  const sorted = [...list].sort((a, b) => (b.views || 0) - (a.views || 0));
  const nTop = Math.max(3, Math.round(list.length * 0.2));
  const topR = sorted.slice(0, nTop), rest = sorted.slice(nTop);
  const share = (vs, f) => (vs.length ? vs.filter(f).length / vs.length : 0);
  const capLen = (p) => (p.text || '').replace(/#\S+/g, '').trim().length;
  const hourMode = (vs) => {
    const c = {};
    vs.forEach((p) => { if (p.time) { const h = new Date(p.time * 1000).getHours(); c[h] = (c[h] || 0) + 1; } });
    const b = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return b ? `${b[0]}h–${+b[0] + 1}h` : '–';
  };
  const metrics = [
    ['Độ dài trung vị', (vs) => median(vs.map((p) => p.duration)), (x) => (x == null ? '–' : Math.round(x) + 's')],
    ['Độ dài caption (ký tự)', (vs) => median(vs.map(capLen)), (x) => (x == null ? '–' : Math.round(x))],
    ['Số hashtag trung vị', (vs) => median(vs.map((p) => (p.hashtags || []).length)), (x) => (x == null ? '–' : x.toFixed(0))],
    ['Caption mở đầu bằng câu hỏi', (vs) => share(vs, (p) => FBA.hookType(p.text) === 'Câu hỏi'), (x) => FBA.pct(x, 0)],
    ['Tỉ lệ tương tác (ER)', (vs) => median(vs.map(FBA.er)), (x) => FBA.pct(x)],
    ['Tỉ lệ chia sẻ / lượt xem', (vs) => median(vs.map((p) => (p.views && p.shares != null ? p.shares / p.views : null))), (x) => FBA.pct(x, 2)],
  ];
  const formula = [];
  const dT = median(topR.map((p) => p.duration)), dR = median(rest.map((p) => p.duration));
  if (dT && dR && Math.abs(dT - dR) / dR > 0.2) formula.push(`Reels top thường <b>${dT > dR ? 'dài' : 'ngắn'} hơn</b> (${Math.round(dT)}s so với ${Math.round(dR)}s).`);
  const qT = share(topR, (p) => FBA.hookType(p.text) === 'Câu hỏi'), qR = share(rest, (p) => FBA.hookType(p.text) === 'Câu hỏi');
  if (Math.abs(qT - qR) > 0.15) formula.push(`${FBA.pct(qT, 0)} Reels top ${qT > qR ? '<b>mở đầu caption bằng câu hỏi</b>' : 'không dùng câu hỏi ở caption'} (nhóm còn lại ${FBA.pct(qR, 0)}).`);
  const cT = median(topR.map(capLen)), cR = median(rest.map(capLen));
  if (cT != null && cR != null && Math.abs(cT - cR) > 20) formula.push(`Caption Reels top <b>${cT > cR ? 'dài' : 'ngắn'} hơn</b> (${Math.round(cT)} so với ${Math.round(cR)} ký tự).`);
  formula.push(`Giờ đăng hay gặp nhất ở nhóm Reels top: <b>${hourMode(topR)}</b>.`);
  const hooks = groupBy(list, (p) => FBA.hookType(p.text), V);
  const bh = hooks.find((h) => h.n >= 2 && !['Khác', 'Không có caption'].includes(h.name));
  if (bh) formula.push(`Kiểu caption hiệu quả: <b>${bh.name}</b> (gấp ${bh.ratio.toFixed(1)}× mức chung).`);
  const DUR = [['< 15s', 15], ['15–30s', 30], ['30–60s', 60], ['1–3 phút', 180], ['> 3 phút', Infinity]];
  const durRows = DUR.map(([l, max], i) => { const min = i ? DUR[i - 1][1] : 0; const vs = list.filter((p) => p.duration > 0 && p.duration >= min && p.duration < max); return { label: l, value: median(vs.map((p) => p.views)) || 0, tip: `<b>${l}</b><br>${vs.length} Reels · trung vị ${FBA.fmt(median(vs.map((p) => p.views)))} view` }; });
  const fl = page ? followersOf(page) : null;
  const outl = list.map((p) => ({ p, f: followersOf(p.page) })).filter((x) => x.f && x.p.views).map((x) => ({ ...x, r: x.p.views / x.f })).sort((a, b) => b.r - a.r).slice(0, 10);
  const slots = bestSlots(list, V);

  el.innerHTML = `
    ${page ? profileCard(page) : ''}
    ${kpis([['Reels / video', list.length], ['Lượt xem trung vị', FBA.fmt(median(views))], ['ER trung vị', FBA.pct(median(ers)), '(cảm xúc + bình luận + chia sẻ) ÷ lượt xem'],
      ['Độ dài trung vị', median(list.map((p) => p.duration)) ? Math.round(median(list.map((p) => p.duration))) + 's' : '–'],
      ['Reels bứt phá (≥ 3×)', `${list.filter((p) => ratio(p) >= 3).length}`], ['View trung vị / người theo dõi', fl ? FBA.pct(median(views) / fl) : '–']])}
    <section class="card insights"><h2>🧪 Công thức viral (top ${nTop} Reels so với phần còn lại)</h2><ul>${formula.map((x) => `<li>${x}</li>`).join('')}</ul>
      ${tbl(['Chỉ số', `Top ${nTop} Reels`, 'Còn lại'], metrics.map(([l, f, fm]) => [l, `<b>${fm(f(topR))}</b>`, fm(f(rest))]))}</section>
    <section class="card"><h2>Lượt xem từng Reels theo ngày đăng</h2><div class="chart">${timeline(list, 'Lượt xem Reels', V)}</div></section>
    <div class="grid2">
      <section class="card"><h2>Giờ & ngày đăng Reels hiệu quả</h2><p class="muted small">Lượt xem trung vị theo khung giờ đăng.</p><div class="chart">${heatmap(list, V)}</div>
        ${slots.length ? `<p class="small"><b>Lịch đăng gợi ý:</b> ${slots.map((s) => { const [d, h] = s.k.split('-').map(Number); return `${DAYS[d]} ${h}h`; }).join(' · ')}</p>` : ''}</section>
      <section class="card"><h2>Độ dài Reels tối ưu</h2><p class="muted small">Lượt xem trung vị theo độ dài.</p><div class="chart">${Charts.bars(durRows, { label: 'Độ dài Reels' })}</div></section>
      <section class="card"><h2>Kiểu caption mở đầu</h2><div class="chart">${groupBars(hooks, 'view')}</div></section>
      <section class="card"><h2>🎯 Reels "vượt tầm" (view so với người theo dõi)</h2>${tbl(['Reels', 'Fanpage', 'View', 'Tỉ lệ'], outl.map(({ p, r }) => [link(p, (p.text || 'Reels').slice(0, 60)), esc(p.page), FBA.fmt(p.views), `<b>${r.toFixed(1)}×</b>`]), 'Cần số người theo dõi (mở trang chủ fanpage)')}</section>
    </div>
    <section class="card" style="margin-top:16px"><div class="tablehead"><h2>Top Reels</h2><button id="copyHooks">Copy caption top 10</button></div>
      ${tbl(['Caption', 'Fanpage', 'Ngày', 'View', 'Cảm xúc', 'Bình luận', 'Chia sẻ', 'ER', 'Độ dài'], sorted.slice(0, 50).map((p) => [link(p, (p.text || '(không có caption)').slice(0, 90)) + pill(p), esc(p.page), FBA.fmtDate(p.time), FBA.fmt(p.views), FBA.fmt(p.reactions), FBA.fmt(p.comments), FBA.fmt(p.shares), FBA.pct(FBA.er(p)), p.duration ? p.duration + 's' : '–']))}</section>`;
  $('#copyHooks').onclick = (e) => navigator.clipboard.writeText(sorted.slice(0, 10).map((p) => `${FBA.firstLine(p.text) || '(không có caption)'} — ${FBA.fmt(p.views)} view`).join('\n')).then(() => (e.target.textContent = '✓ Đã copy'));
}

// ================= 📡 Theo dõi =================
function renderTrack(el) {
  const page = $('#fPage').value;
  const now = Date.now() / 1000;
  const rows = S.watch.map((n) => {
    const ps = S.posts.filter((p) => p.page === n);
    const info = S.pages[n];
    const h = info?.history || [];
    const wk = h.filter((x) => x.t <= Date.now() - 7 * 864e5).pop() || h[0];
    const g = wk && info?.followers != null && h.length > 1 ? info.followers - wk.followers : null;
    const last = Math.max(0, ...ps.map((p) => p.time || 0));
    const brk = ps.filter((p) => p.time && now - p.time <= 7 * 86400 && ratio(p) >= 3).length;
    return [`<a href="?page=${encodeURIComponent(n)}#page">${esc(n)}</a>`, FBA.fmt(info?.followers), g == null ? '–' : (g >= 0 ? '+' : '') + FBA.fmt(g), ps.length,
      FBA.fmt(median(ps.filter((p) => !isReel(p)).map(FBA.engagement))), FBA.fmt(median(ps.filter(isReel).map((p) => p.views))),
      last ? FBA.fmtDate(last) : '–', brk ? `<b>🔥 ${brk}</b>` : '0', `<button data-unwatch="${esc(n)}">Bỏ</button>`];
  });
  const vel = (p) => {
    const h = p.hist || [];
    if (h.length < 2) return null;
    const a = h[h.length - 2], b = h[h.length - 1];
    const hrs = (b.t - a.t) / 3600e3;
    const m = (x) => (isReel(p) && x.views ? x.views : (x.reactions || 0) + (x.comments || 0) + (x.shares || 0));
    return hrs >= 0.25 ? Math.max(0, (m(b) - m(a)) / hrs) : null;
  };
  const fast = S.posts.map((p) => ({ p, v: vel(p) })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).slice(0, 15);
  const recentBrk = S.posts.filter((p) => S.watch.includes(p.page) && p.time && now - p.time <= 14 * 86400 && ratio(p) >= 2).sort((a, b) => ratio(b) - ratio(a)).slice(0, 15);
  el.innerHTML = `
    <section class="card"><div class="tablehead"><h2>⭐ Fanpage đối thủ đang theo dõi (${S.watch.length})</h2>
      ${page && !S.watch.includes(page) ? `<button id="watchCur" class="primary">⭐ Theo dõi ${esc(page)}</button>` : ''}</div>
      <p class="muted small">Thêm fanpage: chọn ở bộ lọc phía trên rồi bấm “Theo dõi”, hoặc bấm ⭐ trong popup khi đang mở fanpage. Tiện ích thông báo khi fanpage có bài/Reels đăng ≤ 3 ngày đạt ≥ 3× trung vị của trang.</p>
      <div class="toolbar"><button id="refresh">🔄 Cập nhật ngay</button>
        <label class="small"><input type="checkbox" id="auto" ${S.settings.autoRefresh ? 'checked' : ''}> Tự cập nhật mỗi ngày (khi Chrome mở)</label>
        <label class="small"><input type="checkbox" id="notify" ${S.settings.notify !== false ? 'checked' : ''}> Thông báo bài bứt phá</label>
        <span class="muted small" id="rInfo">${S.lastRefresh ? 'Cập nhật lần cuối: ' + new Date(S.lastRefresh).toLocaleString('vi-VN') : ''}</span></div>
      ${tbl(['Fanpage', 'Người theo dõi', '+/− 7 ngày', 'Bài đã lưu', 'Tương tác TV/bài', 'View TV/Reels', 'Đăng gần nhất', 'Bứt phá 7 ngày', ''], rows, 'Chưa theo dõi fanpage nào')}</section>
    <div class="grid2">
      <section class="card"><h2>🔥 Bài bứt phá gần đây của đối thủ (14 ngày)</h2>${tbl(['Bài', 'Fanpage', 'Loại', 'So với TV'], recentBrk.map((p) => [link(p, (p.text || '(không có chữ)').slice(0, 70)), esc(p.page), FBA.TYPE_LABEL[p.type], `<b>${ratio(p).toFixed(1)}×</b>`]), 'Chưa có')}</section>
      <section class="card"><h2>🚀 Bài đang tăng nhanh</h2><p class="muted small">Tương tác (hoặc lượt xem với Reels) tăng thêm mỗi giờ, giữa 2 lần ghi nhận gần nhất.</p>
        ${tbl(['Bài', 'Fanpage', 'Tăng / giờ'], fast.map(({ p, v }) => [link(p, (p.text || '(không có chữ)').slice(0, 70)), esc(p.page), `<b>${FBA.fmt(v)}</b>`]), 'Cần ít nhất 2 lần ghi nhận cho cùng bài (mở lại fanpage sau vài giờ)')}</section>
    </div>`;
  const save = (arr) => chrome.storage.local.set({ watchPages: arr });
  if ($('#watchCur')) $('#watchCur').onclick = () => save([...S.watch, page]);
  el.querySelectorAll('[data-unwatch]').forEach((b) => (b.onclick = () => save(S.watch.filter((x) => x !== b.dataset.unwatch))));
  $('#auto').onchange = $('#notify').onchange = () => chrome.storage.local.set({ fbSettings: { ...S.settings, autoRefresh: $('#auto').checked, notify: $('#notify').checked } });
  $('#refresh').onclick = async () => {
    if (!S.watch.length) return;
    $('#rInfo').textContent = `Đang mở lần lượt ${S.watch.length} fanpage trong tab nền (~${Math.ceil(S.watch.length * 70 / 60)} phút)…`;
    const r = await chrome.runtime.sendMessage({ type: 'refreshPages' });
    $('#rInfo').textContent = `✓ Đã cập nhật ${r?.n || 0} fanpage.`;
  };
}

// ---------- điều hướng ----------
const TABS = { page: renderPage, reels: renderReels, track: renderTrack };
function render() {
  medCache.clear();
  const tab = TABS[location.hash.slice(1)] ? location.hash.slice(1) : 'page';
  document.querySelectorAll('#tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  $('#fType').closest('label').style.display = tab === 'page' ? '' : 'none';
  TABS[tab]($('#view'));
}
window.addEventListener('hashchange', render);
['#fPage', '#fRange', '#fType'].forEach((s) => $(s).addEventListener('change', render));
let st;
$('#fSearch').addEventListener('input', () => { clearTimeout(st); st = setTimeout(render, 250); });
let lt;
chrome.storage.onChanged.addListener(() => { clearTimeout(lt); lt = setTimeout(load, 1500); });

$('#exportCsv').onclick = () => FBA.download(`facebook-${$('#fPage').value || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, FBA.toCSV(filtered()));
$('#exportJson').onclick = async () => FBA.download(`facebook-analyzer-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await chrome.storage.local.get(null)), 'application/json');
$('#importJson').onchange = async (e) => {
  try {
    const d = JSON.parse(await e.target.files[0].text());
    const cur = await chrome.storage.local.get({ posts: {}, pages: {} });
    await chrome.storage.local.set({ ...d, posts: { ...cur.posts, ...(d.posts || {}) }, pages: { ...cur.pages, ...(d.pages || {}) } });
  } catch (_) { alert('File JSON không hợp lệ.'); }
  e.target.value = '';
};
load();
