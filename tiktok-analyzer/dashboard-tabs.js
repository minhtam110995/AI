// Các tab mở rộng: Nội dung & Hook, Bình luận, Theo dõi & Trend, TikTok Shop.
// Mọi phân tích chạy trên máy, không gọi dịch vụ bên ngoài.
const PANES = {};
const currentTab = () => (location.hash.slice(1).match(/^[a-z]+/) || ['overview'])[0];
const vurl = (v) => `https://www.tiktok.com/@${v.author}/video/${v.id}`;
const vlink = (v, text) => `<a href="${vurl(v)}" target="_blank">${esc((text || v.desc || v.id).slice(0, 90))}</a>`;
const kpiRow = (items) => `<section class="kpis">${items.map(([l, v]) => `<div class="kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`).join('')}</section>`;
const tbl = (head, rows, empty = 'Chưa có dữ liệu') => `<div class="tablewrap"><table><thead><tr>${head.map((h, i) => `<th class="${i ? '' : 'l'}">${h}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((r) => `<tr>${r.map((c, i) => `<td class="${i ? '' : 'desc'}">${c}</td>`).join('')}</tr>`).join('') : `<tr><td class="desc muted" colspan="${head.length}">${empty}</td></tr>`}</tbody></table></div>`;

function hbarsSVG(rows, { fmt = TTA.fmt, left = 200, W = 580 } = {}) {
  if (!rows.length) return '<div class="empty">Chưa có dữ liệu.</div>';
  const rowH = 26, right = 70, H = rows.length * rowH + 4;
  const max = Math.max(...rows.map((r) => r.value || 0)) || 1;
  let s = '';
  rows.forEach((r, i) => {
    const y = i * rowH + 3, w = ((W - left - right) * (r.value || 0)) / max;
    const lab = String(r.label);
    s += `<text x="${left - 8}" y="${y + 14}" text-anchor="end" style="fill:var(--text)">${esc(lab.length > 24 ? lab.slice(0, 23) + '…' : lab)}</text>`;
    s += `<path d="${hbarPath(left, y, Math.max(w, 2), rowH - 9)}" fill="var(--series)"/>`;
    s += `<text x="${left + w + 6}" y="${y + 14}">${fmt(r.value)}</text>`;
    s += `<rect class="hit" x="0" y="${y - 2}" width="${W}" height="${rowH}" data-tip="${esc(r.tip || `<b>${esc(lab)}</b><br>${fmt(r.value)}`)}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img">${s}</svg>`;
}

function groupStats(list, keyFn) {
  const g = {};
  list.forEach((v) => (g[keyFn(v)] ||= []).push(v));
  const all = TTA.median(list.map((v) => v.views)) || 1;
  return Object.entries(g).map(([name, vs]) => {
    const best = [...vs].sort((a, b) => b.views - a.views)[0];
    const med = TTA.median(vs.map((v) => v.views));
    return { name, vs, n: vs.length, med, ratio: med / all, best };
  }).sort((a, b) => b.med - a.med);
}

// ================= 🎬 Nội dung & Hook =================
PANES.content = (list) => {
  const el = $('#paneContent');
  if (list.length < 3) { el.innerHTML = '<section class="card"><p>Cần ít nhất 3 video. Mở trang kênh trên TikTok và bấm “Tự cuộn để thu thập”.</p></section>'; return; }
  const withTr = list.filter((v) => v.transcript).length;
  const hooks = groupStats(list, (v) => TTA.hookType(TTA.hookText(v)));
  const formats = groupStats(list, (v) => TTA.formatType(`${v.desc} ${v.transcript || ''}`));
  const sorted = [...list].sort((a, b) => b.views - a.views);
  const nTop = Math.max(3, Math.round(list.length * 0.2));
  const top = sorted.slice(0, nTop), rest = sorted.slice(nTop);
  const capLen = (v) => (v.desc || '').replace(/#\S+/g, '').trim().length;
  const share = (vs, f) => (vs.length ? vs.filter(f).length / vs.length : 0);
  const hourOf = (v) => new Date(v.createTime * 1000).getHours();
  const modeHour = (vs) => {
    const c = {};
    vs.forEach((v) => v.createTime && (c[hourOf(v)] = (c[hourOf(v)] || 0) + 1));
    const b = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return b ? `${b[0]}h–${+b[0] + 1}h` : '–';
  };
  const metrics = [
    ['Độ dài trung vị', (vs) => TTA.median(vs.map((v) => v.duration)), (x) => Math.round(x) + 's'],
    ['Số hashtag trung vị', (vs) => TTA.median(vs.map((v) => v.hashtags.length)), (x) => x.toFixed(0)],
    ['Độ dài caption (ký tự)', (vs) => TTA.median(vs.map(capLen)), (x) => Math.round(x)],
    ['Có lời nói / phụ đề', (vs) => share(vs, (v) => v.hasSpeech || v.transcript), (x) => TTA.pct(x, 0)],
    ['Dùng âm thanh gốc', (vs) => share(vs, (v) => v.musicOriginal), (x) => TTA.pct(x, 0)],
    ['Hook dạng câu hỏi', (vs) => share(vs, (v) => TTA.hookType(TTA.hookText(v)) === 'Câu hỏi'), (x) => TTA.pct(x, 0)],
    ['Tỉ lệ share', (vs) => TTA.median(vs.map((v) => (v.views ? v.shares / v.views : 0))), (x) => TTA.pct(x, 2)],
    ['Tỉ lệ lưu', (vs) => TTA.median(vs.map((v) => (v.views ? v.saves / v.views : 0))), (x) => TTA.pct(x, 2)],
  ];
  const formula = [];
  const dT = TTA.median(top.map((v) => v.duration)), dR = TTA.median(rest.map((v) => v.duration));
  if (dT && dR && Math.abs(dT - dR) / dR > 0.2) formula.push(`Video top thường <b>${dT > dR ? 'dài' : 'ngắn'} hơn</b> (${Math.round(dT)}s so với ${Math.round(dR)}s).`);
  const sT = share(top, (v) => v.hasSpeech || v.transcript), sR = share(rest, (v) => v.hasSpeech || v.transcript);
  if (Math.abs(sT - sR) > 0.15) formula.push(`${TTA.pct(sT, 0)} video top <b>${sT > sR ? 'có' : 'không có'} lời nói</b> (nhóm còn lại ${TTA.pct(sR, 0)}).`);
  const oT = share(top, (v) => v.musicOriginal), oR = share(rest, (v) => v.musicOriginal);
  if (Math.abs(oT - oR) > 0.15) formula.push(`Video top ${oT > oR ? '<b>hay dùng âm thanh gốc</b>' : '<b>hay dùng nhạc có sẵn / trend</b>'} (${TTA.pct(oT, 0)} so với ${TTA.pct(oR, 0)}).`);
  const bestHook = hooks.find((h) => h.n >= 2 && h.name !== 'Khác' && h.name !== 'Không rõ');
  if (bestHook) formula.push(`Kiểu hook hiệu quả nhất: <b>${bestHook.name}</b> (trung vị ${TTA.fmt(bestHook.med)} view, gấp ${bestHook.ratio.toFixed(1)}× mức chung).`);
  const bestFmt = formats.find((f) => f.n >= 2 && f.name !== 'Khác');
  if (bestFmt) formula.push(`Format hiệu quả nhất: <b>${bestFmt.name}</b> (${bestFmt.n} video, gấp ${bestFmt.ratio.toFixed(1)}× mức chung).`);
  formula.push(`Giờ đăng hay gặp nhất ở nhóm video top: <b>${modeHour(top)}</b>.`);

  // Lịch đăng gợi ý: 5 khung giờ có view trung vị cao nhất (≥ 2 video)
  const slots = Object.entries(heatData(list)).filter(([, a]) => a.length >= 2)
    .map(([k, a]) => ({ k, n: a.length, m: TTA.median(a) })).sort((a, b) => b.m - a.m).slice(0, 5);

  el.innerHTML = `
    <section class="card"><div class="tablehead"><h2>📝 Lời thoại</h2><span class="muted small">${withTr}/${list.length} video đã có lời thoại</span></div>
      <p class="muted small">Phân tích hook chính xác hơn khi có lời thoại (câu nói 3 giây đầu). Nếu chưa có, tiện ích dùng câu đầu của caption.</p>
      <div class="toolbar"><button id="trFetch" class="primary">Lấy lời thoại cho 20 video nhiều view nhất chưa có</button><span class="muted small" id="trInfo"></span></div></section>
    <section class="card insights"><h2>🧪 Công thức viral (top ${nTop} video so với phần còn lại)</h2><ul>${formula.map((f) => `<li>${f}</li>`).join('')}</ul>
      ${tbl(['Chỉ số', `Top ${nTop} video`, 'Các video còn lại'], metrics.map(([l, f, fm]) => [l, `<b>${fm(f(top))}</b>`, fm(f(rest))]))}</section>
    <div class="grid2">
      <section class="card"><h2>🎣 Kiểu hook mở đầu</h2><p class="muted small">View trung vị theo kiểu câu mở đầu.</p>
        ${hbarsSVG(hooks.map((h) => ({ label: `${h.name} (${h.n})`, value: h.med, tip: `<b>${esc(h.name)}</b> · ${h.n} video<br>Trung vị ${TTA.fmt(h.med)} view (${h.ratio.toFixed(1)}×)<br>VD: ${esc(TTA.hookText(h.best).slice(0, 90))}` })))}</section>
      <section class="card"><h2>🎞 Format video</h2><p class="muted small">Phân loại theo từ khoá trong caption và lời thoại.</p>
        ${hbarsSVG(formats.map((f) => ({ label: `${f.name} (${f.n})`, value: f.med, tip: `<b>${esc(f.name)}</b> · ${f.n} video<br>Trung vị ${TTA.fmt(f.med)} view (${f.ratio.toFixed(1)}×)` })))}</section>
    </div>
    <section class="card" style="margin-top:16px"><h2>📅 Lịch đăng gợi ý</h2><p class="muted small">5 khung giờ có view trung vị cao nhất (mỗi khung ≥ 2 video, giờ máy bạn).</p>
      ${tbl(['Khung giờ', 'Số video', 'View trung vị'], slots.map((s) => { const [d, h] = s.k.split('-').map(Number); return [`<b>${DAYS[d]}, ${h}h–${h + 1}h</b>`, s.n, TTA.fmt(s.m)]; }), 'Chưa đủ dữ liệu (cần nhiều video hơn).')}</section>
    <section class="card"><div class="tablehead"><h2>🎤 Câu mở đầu của 10 video nhiều view nhất</h2><button id="copyHooks">Copy danh sách</button></div>
      ${tbl(['Câu mở đầu', 'Kiểu hook', 'View', 'Nguồn'], sorted.slice(0, 10).map((v) => [vlink(v, TTA.hookText(v) || '(trống)'), TTA.hookType(TTA.hookText(v)), TTA.fmt(v.views), v.hookLine || v.transcript ? 'lời thoại' : 'caption']))}</section>`;

  $('#copyHooks').onclick = (e) => navigator.clipboard.writeText(sorted.slice(0, 10).map((v) => `${TTA.hookText(v)} — ${TTA.fmt(v.views)} view`).join('\n')).then(() => (e.target.textContent = '✓ Đã copy'));
  $('#trFetch').onclick = async (e) => {
    const todo = sorted.filter((v) => !v.transcript && !v.trTried).slice(0, 20);
    if (!todo.length) { $('#trInfo').textContent = 'Tất cả video top đã có lời thoại.'; return; }
    e.target.disabled = true;
    let ok = 0;
    for (let i = 0; i < todo.length; i++) {
      $('#trInfo').textContent = `Đang lấy ${i + 1}/${todo.length}…`;
      const r = await chrome.runtime.sendMessage({ type: 'getOriginal', author: todo[i].author, id: todo[i].id });
      if (r?.ok && r.result.transcript) ok++;
      todo[i].trTried = true;
      await new Promise((res) => setTimeout(res, 1500));
    }
    $('#trInfo').textContent = `✓ Xong: ${ok}/${todo.length} video có lời thoại (video chỉ có nhạc sẽ không có).`;
    e.target.disabled = false;
  };
};

// ================= 💬 Bình luận =================
PANES.comments = (list) => {
  const el = $('#paneComments');
  const ids = list.filter((v) => state.comments[v.id]?.length).map((v) => v.id);
  if (!ids.length) {
    el.innerHTML = `<section class="card"><h2>Chưa có bình luận</h2><ol class="small">
      <li>Mở một video trên TikTok (trang <code>tiktok.com/@kenh/video/…</code>).</li>
      <li>Bấm biểu tượng tiện ích → <b>💬 Lấy bình luận video này</b>. Tiện ích tự mở khung bình luận và cuộn để tải thêm.</li>
      <li>Quay lại đây để xem phân tích. Bạn có thể lấy bình luận của nhiều video để so sánh video nào ra đơn.</li></ol></section>`;
    return;
  }
  const prevSel = $('#cmVid')?.value || '';
  const prevF = $('#cmFilter')?.value || '';
  const vmap = Object.fromEntries(list.map((v) => [v.id, v]));
  el.innerHTML = `<section class="filters"><label class="grow">Video
    <select id="cmVid"><option value="">Tất cả video có bình luận (${ids.length})</option>${ids.map((id) => `<option value="${id}">${esc((vmap[id].desc || id).slice(0, 80))} (${state.comments[id].length})</option>`).join('')}</select></label></section><div id="cmBody"></div>`;
  $('#cmVid').value = ids.includes(prevSel) ? prevSel : '';
  const body = () => {
    const sel = $('#cmVid').value;
    const cs = (sel ? [sel] : ids).flatMap((id) => state.comments[id]);
    const intent = cs.filter((c) => TTA.isIntent(c.text));
    const qs = cs.filter((c) => TTA.isQuestion(c.text));
    const perVideo = ids.map((id) => {
      const arr = state.comments[id];
      const n = arr.filter((c) => TTA.isIntent(c.text)).length;
      return { v: vmap[id], n: arr.length, intent: n, rate: n / arr.length, q: arr.filter((c) => TTA.isQuestion(c.text)).length };
    }).sort((a, b) => b.rate - a.rate);
    const byLikes = (arr) => [...arr].sort((a, b) => b.likes - a.likes).slice(0, 12);
    const phr = TTA.phrases(cs.map((c) => c.text), 20);
    const phrIntent = TTA.phrases(intent.map((c) => c.text), 15);
    $('#cmBody').innerHTML = `
      ${kpiRow([['Bình luận đã lấy', TTA.fmt(cs.length)], ['Có ý định mua', `${intent.length} (${TTA.pct(intent.length / (cs.length || 1))})`],
        ['Câu hỏi', `${qs.length} (${TTA.pct(qs.length / (cs.length || 1))})`], ['Người bình luận khác nhau', TTA.fmt(new Set(cs.map((c) => c.user)).size)],
        ['Like trung vị / bình luận', TTA.fmt(TTA.median(cs.map((c) => c.likes)))]])}
      ${sel ? '' : `<section class="card"><h2>🛒 Video nào khiến khách muốn mua?</h2><p class="muted small">Tỉ lệ bình luận hỏi giá / xin link / hỏi mua trên số bình luận đã lấy.</p>
        ${tbl(['Video', 'View', 'Bình luận đã lấy', 'Ý định mua', 'Tỉ lệ', 'Câu hỏi'], perVideo.map((p) => [vlink(p.v), TTA.fmt(p.v.views), p.n, p.intent, `<b>${TTA.pct(p.rate)}</b>`, p.q]))}</section>`}
      <div class="grid2">
        <section class="card"><h2>💰 Bình luận có ý định mua (nhiều like nhất)</h2>${tbl(['Bình luận', 'Like'], byLikes(intent).map((c) => [esc(c.text), TTA.fmt(c.likes)]), 'Không có')}</section>
        <section class="card"><h2>❓ Câu hỏi khách hay hỏi</h2>${tbl(['Câu hỏi', 'Like'], byLikes(qs).map((c) => [esc(c.text), TTA.fmt(c.likes)]), 'Không có')}</section>
        <section class="card"><h2>🔤 Cụm từ xuất hiện nhiều</h2>${tbl(['Cụm từ', 'Số bình luận'], phr.map((p) => [esc(p.phrase), p.count]), 'Chưa đủ dữ liệu')}</section>
        <section class="card"><h2>🛍 Cụm từ trong bình luận muốn mua</h2>${tbl(['Cụm từ', 'Số bình luận'], phrIntent.map((p) => [esc(p.phrase), p.count]), 'Chưa đủ dữ liệu')}</section>
      </div>
      <section class="card" style="margin-top:16px"><div class="tablehead"><h2>Toàn bộ bình luận</h2>
        <span class="toolbar" style="margin:0"><select id="cmFilter"><option value="">Tất cả</option><option value="intent">Có ý định mua</option><option value="q">Câu hỏi</option></select>
        <button id="cmCsv">Xuất CSV</button><button id="cmCopy">Copy nội dung</button></span></div><div id="cmTable"></div></section>`;
    const filt = () => {
      const f = $('#cmFilter').value;
      return cs.filter((c) => !f || (f === 'intent' ? TTA.isIntent(c.text) : TTA.isQuestion(c.text))).sort((a, b) => b.likes - a.likes);
    };
    const draw = () => { $('#cmTable').innerHTML = tbl(['Bình luận', 'Like', 'Trả lời', 'Ngày', 'Loại'], filt().slice(0, 400).map((c) => [esc(c.text), TTA.fmt(c.likes), c.replies, TTA.fmtDate(c.t), `${TTA.isIntent(c.text) ? '🛒' : ''}${TTA.isQuestion(c.text) ? '❓' : ''}`])); };
    $('#cmFilter').value = prevF;
    draw();
    $('#cmFilter').onchange = draw;
    $('#cmCsv').onclick = () => {
      const q = (x) => `"${String(x ?? '').replace(/"/g, '""')}"`;
      TTA.download('tiktok-binh-luan.csv', '﻿' + 'video,binh_luan,like,tra_loi,ngay,y_dinh_mua,cau_hoi\n' + filt().map((c) => [c.vid, q(c.text), c.likes, c.replies, TTA.fmtDate(c.t), TTA.isIntent(c.text) ? 1 : 0, TTA.isQuestion(c.text) ? 1 : 0].join(',')).join('\n'));
    };
    $('#cmCopy').onclick = (e) => navigator.clipboard.writeText(filt().map((c) => `- ${c.text.replace(/\s+/g, ' ')} (${c.likes} like)`).join('\n')).then(() => (e.target.textContent = '✓ Đã copy'));
  };
  $('#cmVid').onchange = body;
  body();
};

// ================= 📡 Theo dõi & Trend =================
PANES.trends = (list, author) => {
  const el = $('#paneTrends');
  const all = state.videos;
  const W = state.watchChannels;
  const now = Date.now() / 1000;
  const followersOf = (v) => v.authorFollowers || state.users[v.author]?.followers || null;
  const chRows = W.map((u) => {
    const vs = all.filter((v) => v.author === u);
    const info = state.users[u];
    const med = TTA.median(vs.map((v) => v.views));
    const h = info?.history || [];
    const weekAgo = h.filter((x) => x.t <= Date.now() - 7 * 864e5).pop() || h[0];
    const growth = info && weekAgo ? info.followers - weekAgo.followers : null;
    const breakouts = vs.filter((v) => now - v.createTime <= 7 * 86400 && med && v.views >= 3 * med).length;
    const last = Math.max(0, ...vs.map((v) => v.createTime));
    const followers = info?.followers ?? vs.find((v) => v.authorFollowers)?.authorFollowers;
    return [`<a href="https://www.tiktok.com/@${esc(u)}" target="_blank">@${esc(u)}</a>`, TTA.fmt(followers ?? NaN), growth == null ? '–' : (growth >= 0 ? '+' : '') + TTA.fmt(growth), vs.length, TTA.fmt(med), last ? TTA.fmtDate(last) : '–', breakouts ? `<b>🔥 ${breakouts}</b>` : '0', `<button data-unwatch="${esc(u)}">Bỏ</button>`];
  });
  const fast = all.map((v) => ({ v, vel: TTA.viewVelocity(v) })).filter((x) => x.vel > 0).sort((a, b) => b.vel - a.vel).slice(0, 15);
  const outl = all.map((v) => ({ v, f: followersOf(v) })).filter((x) => x.f >= 100 && x.v.views > 0).map((x) => ({ ...x, r: x.v.views / x.f })).sort((a, b) => b.r - a.r).slice(0, 15);
  const rising = (keyFn, labelFn) => {
    const g = {};
    for (const v of all) {
      const age = (now - v.createTime) / 86400;
      if (!(age >= 0 && age <= 28)) continue;
      for (const k of keyFn(v)) {
        if (!k) continue;
        const x = (g[k] ||= { k, label: labelFn(v, k), recent: [], prev: 0 });
        if (age <= 14) x.recent.push(v.views); else x.prev++;
      }
    }
    return Object.values(g).filter((x) => x.recent.length >= 2).map((x) => ({ ...x, n: x.recent.length, med: TTA.median(x.recent) }))
      .sort((a, b) => b.n - a.n || b.med - a.med).slice(0, 15);
  };
  const sounds = rising((v) => [v.musicOriginal ? '' : v.musicId || v.music], (v) => v.music);
  const tags = rising((v) => v.hashtags.filter((h) => !/^(fyp|foryou|xuhuong|trending|viral|foryoupage|tiktok)$/.test(h)), (_v, k) => '#' + k);
  const s = state.ttSettings;
  el.innerHTML = `
    <section class="card"><div class="tablehead"><h2>⭐ Kênh đối thủ đang theo dõi (${W.length})</h2>
      ${author && !W.includes(author) ? `<button id="watchCur" class="primary">⭐ Theo dõi @${esc(author)}</button>` : ''}</div>
      <p class="muted small">Thêm kênh: chọn kênh ở bộ lọc phía trên rồi bấm “Theo dõi”, hoặc bấm ⭐ trong popup khi đang ở trang kênh. Tiện ích thông báo khi kênh có video ≤ 3 ngày đạt ≥ 3× view trung vị.</p>
      <div class="toolbar"><button id="chRefresh">🔄 Cập nhật ngay</button>
        <label class="small"><input type="checkbox" id="chAuto" ${s.autoRefresh ? 'checked' : ''}> Tự cập nhật mỗi ngày (khi Chrome mở)</label>
        <label class="small"><input type="checkbox" id="chNotify" ${s.notify !== false ? 'checked' : ''}> Thông báo video bứt phá</label>
        <span class="muted small" id="chInfo">${state.lastChannelRefresh ? 'Cập nhật lần cuối: ' + new Date(state.lastChannelRefresh).toLocaleString('vi-VN') : ''}</span></div>
      ${tbl(['Kênh', 'Follower', '+/− 7 ngày', 'Video đã lưu', 'View trung vị', 'Đăng gần nhất', 'Bứt phá 7 ngày', ''], chRows, 'Chưa theo dõi kênh nào')}</section>
    <div class="grid2">
      <section class="card"><h2>🚀 Video đang tăng view nhanh</h2><p class="muted small">View/giờ giữa 2 lần ghi nhận gần nhất. Mở lại kênh/video sau vài giờ để có số liệu.</p>
        ${tbl(['Video', 'Kênh', 'View', 'View/giờ'], fast.map(({ v, vel }) => [vlink(v), '@' + esc(v.author), TTA.fmt(v.views), `<b>${TTA.fmt(vel)}</b>`]), 'Cần ít nhất 2 lần ghi nhận cho cùng video')}</section>
      <section class="card"><h2>🎯 Video “vượt tầm” (view so với follower)</h2><p class="muted small">Video có view cao bất thường so với quy mô kênh, nguồn ý tưởng tốt nhất để làm lại.</p>
        ${tbl(['Video', 'Kênh', 'View', 'Follower', 'Tỉ lệ'], outl.map(({ v, f, r }) => [vlink(v), '@' + esc(v.author), TTA.fmt(v.views), TTA.fmt(f), `<b>${r.toFixed(1)}×</b>`]))}</section>
      <section class="card"><h2>🎵 Âm thanh đang được dùng nhiều (14 ngày)</h2><p class="muted small">Tính trên các video bạn đã thu thập. Lướt For You / tìm kiếm nhiều hơn để chính xác hơn.</p>
        ${tbl(['Âm thanh', 'Video 14 ngày', '14 ngày trước đó', 'View trung vị'], sounds.map((x) => [esc(x.label.slice(0, 60)), `<b>${x.n}</b>${x.n > x.prev ? ' ↑' : ''}`, x.prev, TTA.fmt(x.med)]))}</section>
      <section class="card"><h2>#️⃣ Hashtag đang lên (14 ngày)</h2><p class="muted small">Đã bỏ các hashtag chung như #fyp, #xuhuong.</p>
        ${tbl(['Hashtag', 'Video 14 ngày', '14 ngày trước đó', 'View trung vị'], tags.map((x) => [esc(x.label), `<b>${x.n}</b>${x.n > x.prev ? ' ↑' : ''}`, x.prev, TTA.fmt(x.med)]))}</section>
    </div>`;
  const saveWatch = (arr) => chrome.storage.local.set({ watchChannels: arr });
  if ($('#watchCur')) $('#watchCur').onclick = () => saveWatch([...W, author]);
  el.querySelectorAll('[data-unwatch]').forEach((b) => (b.onclick = () => saveWatch(W.filter((u) => u !== b.dataset.unwatch))));
  const saveSettings = () => chrome.storage.local.set({ ttSettings: { ...s, autoRefresh: $('#chAuto').checked, notify: $('#chNotify').checked } });
  $('#chAuto').onchange = $('#chNotify').onchange = saveSettings;
  $('#chRefresh').onclick = async () => {
    if (!W.length) return;
    $('#chInfo').textContent = `Đang mở lần lượt ${W.length} kênh trong tab nền (~${Math.ceil(W.length * 25 / 60)} phút)…`;
    const r = await chrome.runtime.sendMessage({ type: 'refreshChannels' });
    $('#chInfo').textContent = `✓ Đã cập nhật ${r?.n || 0} kênh.`;
  };
};

// Định dạng tiền kiểu Việt: 145,6 trđ · 1,2 tỷđ
function money(x) {
  if (x == null || !Number.isFinite(x)) return '–';
  const f = (n, u) => n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, '').replace('.', ',') + u;
  return x >= 1e9 ? f(x / 1e9, ' tỷđ') : x >= 1e6 ? f(x / 1e6, ' trđ') : x >= 1e3 ? f(x / 1e3, 'kđ') : Math.round(x) + 'đ';
}

// ================= 💰 Affiliate & Ads =================
// Doanh thu là ƯỚC TÍNH: TikTok không công khai doanh thu từng video/kênh.
//  - Doanh thu sản phẩm = giá × số "đã bán" (tích luỹ) hoặc giá × tốc độ bán × 30 ngày (khi có ≥ 2 lần ghi nhận)
//  - Phần của kênh = doanh thu sản phẩm × (view các video của kênh gắn SP ÷ view tất cả video đã biết gắn SP đó)
//  - Phần của từng video = phần của kênh × (view video ÷ tổng view các video của kênh gắn SP)
function productSales(p) {
  if (!p) return {};
  const h = (p.hist || []).filter((x) => x.sold != null);
  let daily = null;
  if (h.length >= 2) {
    const days = (h[h.length - 1].t - h[0].t) / 864e5;
    if (days >= 0.5) daily = Math.max(0, (h[h.length - 1].sold - h[0].sold) / days);
  }
  return {
    daily,
    rev30: daily != null && p.price ? daily * 30 * p.price : null,
    revAll: p.sold != null && p.price ? p.sold * p.price : null,
  };
}

PANES.shop = (list, author) => {
  const el = $('#paneShop');
  const commission = Number(state.ttSettings.commission ?? 10);
  const job = state.job;
  const prevInput = $('#affInput')?.value || '';
  const nonAd = state.allVideos;
  const vidsWith = {};
  nonAd.forEach((v) => (v.products || []).forEach((p) => { if (p.pid) (vidsWith[p.pid] ||= new Map()).set(v.id, v); }));
  const shopV = list.filter((v) => v.products?.length);

  // Sản phẩm của kênh/bộ lọc hiện tại
  const rows = {};
  shopV.forEach((v) => v.products.forEach((pp) => {
    const r = (rows[pp.pid] ||= { pid: pp.pid, title: pp.title, vs: [], views: 0 });
    r.vs.push(v); r.views += v.views;
  }));
  let useMonthly = false;
  const prods = Object.values(rows).map((r) => {
    const p = state.products[r.pid] || {};
    const s = productSales(p);
    const allViews = [...(vidsWith[r.pid]?.values() || [])].reduce((a, v) => a + v.views, 0) || r.views;
    const share = allViews ? r.views / allViews : 1;
    const base = s.rev30 ?? s.revAll;
    if (s.rev30 != null) useMonthly = true;
    const creators = new Set([...(vidsWith[r.pid]?.values() || [])].map((v) => v.author));
    return { ...r, p, ...s, share, creators, est: base != null ? base * share : null, monthly: s.rev30 != null };
  }).sort((a, b) => (b.est ?? -1) - (a.est ?? -1) || b.views - a.views);
  const totalEst = prods.reduce((a, r) => a + (r.est || 0), 0);
  const vEst = (v) => v.products.reduce((a, pp) => { const r = rows[pp.pid] && prods.find((x) => x.pid === pp.pid); return a + (r?.est && r.views ? r.est * v.views / r.views : 0); }, 0);
  const adsMine = list.filter((v) => v.adSeen);
  const allAds = state.allVideos.filter((v) => v.adSeen || v.isAd);
  const branded = list.filter((v) => v.branded);
  const adByAuthor = {};
  allAds.forEach((v) => { const a = (adByAuthor[v.author] ||= { author: v.author, vs: [], seen: 0, last: 0 }); a.vs.push(v); a.seen += v.adSeen || 1; a.last = Math.max(a.last, v.adLast || 0); });
  const plink = (r) => (r.p.productId || /^\d{12,}$/.test(r.pid) ? `<a href="https://shop.tiktok.com/view/product/${r.p.productId || r.pid}?region=VN&locale=vi-VN" target="_blank">${esc(r.title.slice(0, 70))}</a>` : esc(r.title.slice(0, 70)));

  el.innerHTML = `
    <section class="card"><h2>🔎 Dán kênh TikTok để phân tích affiliate</h2>
      <div class="toolbar"><input id="affInput" type="search" placeholder="@tenkenh hoặc https://www.tiktok.com/@tenkenh" style="flex:1;min-width:260px" value="${esc(prevInput)}">
        <select id="affDepth"><option value="8">Nhanh (~50 video)</option><option value="15" selected>Vừa (~100 video)</option><option value="30">Sâu (~200 video)</option></select>
        <button id="affGo" class="primary">Phân tích</button></div>
      <p class="muted small" id="affJob">${job ? esc(job.msg) + (job.step !== 'done' && job.step !== 'error' ? ' (đừng đóng Chrome)' : '') : 'Tiện ích sẽ mở kênh trong tab nền, tự cuộn lấy video, rồi mở trang các sản phẩm gắn giỏ để lấy giá & số "đã bán". Mất khoảng 1–4 phút.'}</p>
      <p class="muted small">Muốn có <b>doanh thu 30 ngày</b> (chính xác hơn doanh thu tích luỹ): phân tích lại cùng kênh sau 1–3 ngày để tiện ích tính được tốc độ bán thực tế của từng sản phẩm.</p></section>
    ${!shopV.length ? `<section class="card"><p>${author ? `Chưa thấy video gắn giỏ của @${esc(author)} trong khoảng thời gian đang lọc.` : 'Chọn một kênh ở bộ lọc phía trên, hoặc dán kênh để phân tích.'}</p></section>` : `
    ${kpiRow([['Video gắn giỏ', `${shopV.length} / ${list.length} (${TTA.pct(shopV.length / (list.length || 1), 0)})`],
      [useMonthly ? 'Doanh thu ước tính / 30 ngày' : 'Doanh thu ước tính (tích luỹ)', money(totalEst)],
      [`Hoa hồng ước tính (${commission}%)`, money(totalEst * commission / 100)],
      ['Sản phẩm đang bán', prods.length],
      ['View TB: video gắn giỏ / thường', `${TTA.fmt(TTA.median(shopV.map((v) => v.views)))} / ${TTA.fmt(TTA.median(list.filter((v) => !v.products?.length).map((v) => v.views)))}`],
      ['Video thấy chạy ads', adsMine.length]])}
    <section class="card"><div class="tablehead"><h2>📦 Sản phẩm nào ra đơn?</h2>
      <label class="small">Hoa hồng affiliate % <input id="affCom" type="number" value="${commission}" min="0" max="80" style="width:70px"></label></div>
      <p class="muted small">Doanh thu SP = giá × đã bán (hoặc × tốc độ bán 30 ngày khi có ≥ 2 lần ghi nhận). Phần của kênh = doanh thu SP × tỉ lệ view của kênh trên mọi video đã biết gắn SP này. <b>Chỉ là ước tính.</b></p>
      ${tbl(['Sản phẩm', 'Giá', 'Đã bán', 'Bán/ngày', 'Doanh thu SP', 'Video của kênh', 'View', 'Thị phần view', 'Quy cho kênh', 'Creator khác'],
        prods.map((r) => [plink(r), money(r.p.price), TTA.fmt(r.p.sold ?? NaN), r.daily != null ? TTA.fmt(r.daily) : '–', money(r.rev30 ?? r.revAll) + (r.monthly ? ' /30n' : ''),
          r.vs.length, TTA.fmt(r.views), TTA.pct(r.share, 0), `<b>${money(r.est)}</b>`, r.creators.size - 1]),
        'Chưa có dữ liệu sản phẩm')}</section>
    <section class="card"><h2>🎬 Video bán hàng</h2>
      ${tbl(['Video', 'Ngày', 'View', 'ER', 'Sản phẩm', 'Doanh thu ước tính', 'Ads'],
        [...shopV].sort((a, b) => vEst(b) - vEst(a) || b.views - a.views).slice(0, 100).map((v) => [vlink(v), TTA.fmtDate(v.createTime), TTA.fmt(v.views), TTA.pct(TTA.er(v)),
          esc(v.products.map((p) => p.title).join(', ').slice(0, 60)), `<b>${money(vEst(v) || null)}</b>`, v.adSeen ? `📣 ${v.adSeen}` : v.branded ? '🤝' : '']))}</section>`}
    <section class="card"><h2>📣 Quảng cáo bắt gặp khi lướt TikTok</h2>
      <p class="muted small">Video mang nhãn “Được tài trợ / Sponsored” xuất hiện khi bạn lướt For You hoặc tìm kiếm. Lướt nhiều trong ngách của bạn để thấy đối thủ đang chạy ads gì. 🤝 = nội dung hợp tác thương hiệu (${branded.length} video của bộ lọc hiện tại).</p>
      ${tbl(['Nhà quảng cáo', 'Số mẫu QC', 'Lần bắt gặp', 'Gần nhất', 'Mẫu nhiều lượt bắt gặp nhất', 'Gắn giỏ'],
        Object.values(adByAuthor).sort((a, b) => b.seen - a.seen).slice(0, 40).map((a) => { const best = [...a.vs].sort((x, y) => (y.adSeen || 0) - (x.adSeen || 0))[0];
          return [`<a href="https://www.tiktok.com/@${esc(a.author)}" target="_blank">@${esc(a.author)}</a>`, a.vs.length, a.seen, a.last ? new Date(a.last).toLocaleDateString('vi-VN') : '–', vlink(best), a.vs.some((v) => v.products?.length) ? '🛒' : '']; }),
        'Chưa bắt gặp quảng cáo nào. Hãy lướt For You một lúc.')}</section>`;

  $('#affGo').onclick = async () => {
    const v = $('#affInput').value.trim();
    if (!v) return;
    await chrome.runtime.sendMessage({ type: 'analyzeChannel', username: v, scrolls: Number($('#affDepth').value) });
    $('#affJob').textContent = 'Đã bắt đầu… (tiến trình cập nhật tự động)';
    const u = v.replace(/^.*tiktok\.com\/@/, '').replace(/^@/, '').split(/[/?#\s]/)[0];
    $('#fAuthor').value = '';
    history.replaceState(null, '', `?author=${encodeURIComponent(u)}#shop`);
  };
  if ($('#affCom')) $('#affCom').onchange = () => chrome.storage.local.set({ ttSettings: { ...state.ttSettings, commission: Number($('#affCom').value) || 0 } });
};

// ================= 🤝 Nhà sáng tạo (Trung tâm liên kết TikTok Shop) =================
// Số liệu do TikTok hiển thị cho tài khoản người bán của bạn (GMV, số món bán, lượt xem TB, tương tác…).
const CR = { sort: { key: 'gmv', dir: -1 } };
PANES.creators = () => {
  const el = $('#paneCreators');
  const all = Object.values(state.creators);
  if (!all.length) {
    el.innerHTML = `<section class="card"><h2>Chưa có dữ liệu nhà sáng tạo</h2><ol class="small">
      <li>Đăng nhập <b>tài khoản người bán TikTok Shop của bạn</b> tại <a href="https://affiliate.tiktok.com" target="_blank">affiliate.tiktok.com</a>.</li>
      <li>Vào <b>Khám phá các nhà sáng tạo → Tìm nhà sáng tạo</b> (hoặc Bảng xếp hạng), chọn bộ lọc ngành hàng bạn cần.</li>
      <li>Bấm biểu tượng tiện ích → <b>⬇ Tự cuộn lấy danh sách</b>. Tiện ích ghi lại GMV, số món bán, lượt xem, tương tác… của từng creator.</li>
      <li>Mở trang chi tiết của creator nào thì số liệu chi tiết của creator đó cũng được lưu.</li></ol>
      <p class="muted small">Tiện ích chỉ đọc số liệu trang đã hiển thị cho tài khoản của bạn, không lưu mật khẩu, không gửi dữ liệu đi đâu.</p></section>`;
    return;
  }
  const prev = { min: $('#crMin')?.value || '0', cat: $('#crCat')?.value || '', star: $('#crStar')?.checked, sl: $('#crSL')?.checked, q: $('#crQ')?.value || '' };
  const cats = [...new Set(all.flatMap((c) => c.categories || []))].sort();
  el.innerHTML = `
    <section class="filters">
      <label class="grow">Tìm creator<input id="crQ" type="search" placeholder="tên, @handle, ngành…" value="${esc(prev.q)}"></label>
      <label>GMV tối thiểu<select id="crMin">${[['0', 'Tất cả'], ['1e6', '≥ 1 tr'], ['1e7', '≥ 10 tr'], ['5e7', '≥ 50 tr'], ['1e8', '≥ 100 tr'], ['1e9', '≥ 1 tỷ']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></label>
      <label>Ngành hàng<select id="crCat"><option value="">Tất cả</option>${cats.map((c) => `<option>${esc(c)}</option>`).join('')}</select></label>
      <label style="align-self:end" class="small"><span><input type="checkbox" id="crStar"> Ngôi sao sáng tạo</span></label>
      <label style="align-self:end" class="small"><span><input type="checkbox" id="crSL"> Chỉ danh sách mời ★</span></label>
    </section><div id="crBody"></div>`;
  $('#crMin').value = prev.min; $('#crCat').value = prev.cat; $('#crStar').checked = !!prev.star; $('#crSL').checked = !!prev.sl;
  const body = () => {
    const q = $('#crQ').value.trim().toLowerCase(), min = Number($('#crMin').value), cat = $('#crCat').value;
    const list = all.filter((c) => (c.gmv || 0) >= min && (!cat || (c.categories || []).includes(cat)) && (!$('#crStar').checked || c.star) && (!$('#crSL').checked || c.shortlist) &&
      (!q || [c.handle, c.name, ...(c.categories || [])].join(' ').toLowerCase().includes(q)));
    const aov = (c) => (c.gmv && c.units ? c.gmv / c.units : null);
    const perK = (c) => (c.gmv && c.followers ? c.gmv / c.followers * 1000 : null);
    const growth = (c) => { const s = c.snaps || []; if (s.length < 2) return null; const a = s[s.length - 2], b = s[s.length - 1]; return a.gmv ? (b.gmv - a.gmv) / a.gmv : null; };
    const COLS = [['gmv', 'GMV', (c) => money(c.gmv)], ['units', 'Món bán', (c) => TTA.fmt(c.units ?? NaN)], ['aov', 'Giá TB/món', (c) => money(aov(c)), aov],
      ['followers', 'Follower', (c) => TTA.fmt(c.followers ?? NaN)], ['perK', 'GMV / 1K follower', (c) => money(perK(c)), perK],
      ['avgViews', 'View TB', (c) => TTA.fmt(c.avgViews ?? NaN)], ['er', 'Tương tác', (c) => TTA.pct(c.er ?? NaN)], ['growth', 'GMV thay đổi', (c) => { const g = growth(c); return g == null ? '–' : `<span class="${g >= 0 ? 'up' : 'down'}">${g >= 0 ? '+' : ''}${TTA.pct(g, 0)}</span>`; }, growth]];
    const { key, dir } = CR.sort;
    const col = COLS.find((c) => c[0] === key);
    const val = (c) => (col?.[3] ? col[3](c) : c[key]) ?? -Infinity;
    const rows = [...list].sort((a, b) => (val(a) > val(b) ? dir : val(a) < val(b) ? -dir : 0));
    const gmvs = list.map((c) => c.gmv).filter((x) => x != null);
    $('#crBody').innerHTML = `
      ${kpiRow([['Nhà sáng tạo', list.length], ['Tổng GMV', money(gmvs.reduce((a, b) => a + b, 0))], ['GMV trung vị', money(TTA.median(gmvs))],
        ['Món bán trung vị', TTA.fmt(TTA.median(list.map((c) => c.units).filter((x) => x != null)))], ['Giá TB/món (trung vị)', money(TTA.median(list.map(aov).filter((x) => x != null)))],
        ['Ngôi sao sáng tạo', list.filter((c) => c.star).length]])}
      <div class="grid2"><section class="card"><h2>Top 10 GMV</h2>${hbarsSVG(rows.filter((c) => c.gmv).sort((a, b) => b.gmv - a.gmv).slice(0, 10).map((c) => ({ label: '@' + c.handle, value: c.gmv, tip: `<b>@${esc(c.handle)}</b><br>GMV ${money(c.gmv)} · ${TTA.fmt(c.units ?? NaN)} món` })), { fmt: money })}</section>
      <section class="card"><h2>GMV / 1K follower cao nhất</h2><p class="muted small">Creator nhỏ nhưng bán tốt, thường dễ hợp tác và chi phí thấp.</p>${hbarsSVG(list.filter(perK).sort((a, b) => perK(b) - perK(a)).slice(0, 10).map((c) => ({ label: '@' + c.handle, value: perK(c) })), { fmt: money })}</section></div>
      <section class="card" style="margin-top:16px"><div class="tablehead"><h2>Danh sách nhà sáng tạo</h2>
        <span class="toolbar" style="margin:0"><button id="crCsv">Xuất CSV</button><button id="crCopy">Copy @handle</button></span></div>
        <div class="tablewrap"><table><thead><tr><th></th><th class="l">Nhà sáng tạo</th><th class="l">Ngành</th><th>Người xem</th>${COLS.map(([k, l]) => `<th data-key="${k}" style="cursor:pointer">${l}${key === k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`).join('')}<th></th></tr></thead><tbody>
        ${rows.slice(0, 500).map((c) => `<tr><td><button class="star" data-sl="${esc(c.handle)}">${c.shortlist ? '★' : '☆'}</button></td>
          <td class="desc"><a href="https://www.tiktok.com/@${esc(c.handle)}" target="_blank">@${esc(c.handle)}</a>${c.star ? ' <span class="tag">⭐ Ngôi sao</span>' : ''}<div class="muted small">${esc(c.name || '')}</div></td>
          <td class="desc small">${esc((c.categories || []).join(', ').slice(0, 50))}</td><td class="small">${c.gender ? `${esc(c.gender)} ${TTA.pct(c.genderPct, 0)}${c.age ? ', ' + esc(c.age) : ''}` : '–'}</td>
          ${COLS.map(([, , f]) => `<td>${f(c)}</td>`).join('')}
          <td><button data-an="${esc(c.handle)}" title="Lấy video, sản phẩm & hook của kênh này">Phân tích kênh</button>${c.detailUrl ? ` <a href="${esc(c.detailUrl)}" target="_blank">Chi tiết</a>` : ''}</td></tr>`).join('')}
        </tbody></table></div><p class="muted small">Số liệu lấy từ Trung tâm liên kết TikTok Shop (theo khoảng thời gian bạn chọn trên trang đó). "GMV thay đổi" so với lần ghi nhận trước.</p></section>`;
    $('#crBody thead').onclick = (e) => { const th = e.target.closest('th[data-key]'); if (!th) return; CR.sort = { key: th.dataset.key, dir: CR.sort.key === th.dataset.key ? -CR.sort.dir : -1 }; body(); };
    $('#crBody').querySelectorAll('[data-sl]').forEach((b) => (b.onclick = async () => {
      const { affCreators = {} } = await chrome.storage.local.get('affCreators');
      const c = affCreators[b.dataset.sl]; if (!c) return;
      c.shortlist = !c.shortlist; state.creators[b.dataset.sl].shortlist = c.shortlist; b.textContent = c.shortlist ? '★' : '☆';
      chrome.storage.local.set({ affCreators });
    }));
    $('#crBody').querySelectorAll('[data-an]').forEach((b) => (b.onclick = async () => {
      await chrome.runtime.sendMessage({ type: 'analyzeChannel', username: b.dataset.an, scrolls: 15 });
      location.href = `?author=${encodeURIComponent(b.dataset.an)}#shop`;
    }));
    const csvCols = [['handle', (c) => '@' + c.handle], ['ten', (c) => c.name], ['nganh', (c) => (c.categories || []).join('; ')], ['gmv', (c) => c.gmv], ['mon_ban', (c) => c.units], ['gia_tb_mon', (c) => Math.round(aov(c) || 0) || ''],
      ['follower', (c) => c.followers], ['gmv_moi_1k_follower', (c) => Math.round(perK(c) || 0) || ''], ['view_tb', (c) => c.avgViews], ['tuong_tac', (c) => c.er], ['gioi_tinh', (c) => c.gender], ['ty_le_gioi', (c) => c.genderPct], ['tuoi', (c) => c.age],
      ['ngoi_sao', (c) => (c.star ? 1 : 0)], ['moi', (c) => (c.shortlist ? 1 : 0)], ['link', (c) => `https://www.tiktok.com/@${c.handle}`]];
    const q2 = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    $('#crCsv').onclick = () => TTA.download(`nha-sang-tao-${new Date().toISOString().slice(0, 10)}.csv`, '﻿' + csvCols.map((c) => c[0]).join(',') + '\n' + rows.map((c) => csvCols.map(([, f]) => q2(f(c))).join(',')).join('\n'));
    $('#crCopy').onclick = (e) => navigator.clipboard.writeText(rows.map((c) => '@' + c.handle).join('\n')).then(() => (e.target.textContent = `✓ Đã copy ${rows.length}`));
  };
  let t;
  $('#crQ').oninput = () => { clearTimeout(t); t = setTimeout(body, 250); };
  ['#crMin', '#crCat', '#crStar', '#crSL'].forEach((s) => ($(s).onchange = body));
  body();
};

// ================= 🔎 Từ khoá → video nhiều view =================
// Video lấy từ trang tìm kiếm TikTok (do tiện ích tự mở, hoặc bạn tự tìm rồi cuộn).
const KW = { kw: '', range: '30', from: '', to: '', sort: 'views', min: 0, cart: '' };
PANES.keyword = () => {
  const el = $('#paneKeyword');
  const job = state.kwJob;
  // đang gõ từ khoá → chỉ cập nhật dòng tiến trình, không vẽ lại cả tab
  if (document.activeElement?.id === 'kwInput') { if (job && $('#kwJob')) $('#kwJob').textContent = job.msg; return; }
  const counts = {};
  state.videos.forEach((v) => (v.kw || []).forEach((k) => (counts[k] = (counts[k] || 0) + 1)));
  const kws = [...new Set([...Object.keys(state.keywords), ...Object.keys(counts)])]
    .sort((a, b) => (state.keywords[b]?.last || 0) - (state.keywords[a]?.last || 0));
  if (!KW.kw || !kws.includes(KW.kw)) KW.kw = kws[0] || '';

  const now = Date.now() / 1000;
  let since = 0, until = Infinity;
  if (KW.range === 'custom') {
    if (KW.from) since = new Date(KW.from + 'T00:00:00').getTime() / 1000;
    if (KW.to) until = new Date(KW.to + 'T23:59:59').getTime() / 1000;
  } else if (Number(KW.range)) since = now - Number(KW.range) * 86400;
  const age = (v) => Math.max(1, (now - v.createTime) / 86400);
  const perDay = (v) => v.views / age(v);
  const med = {};
  const authorMed = (a) => (med[a] ??= (() => { const vs = state.videos.filter((v) => v.author === a); return vs.length >= 5 ? TTA.median(vs.map((v) => v.views)) : null; })());
  const ratio = (v) => { const m = authorMed(v.author); return m ? v.views / m : null; };
  const SORT = { views: (v) => v.views, perDay, er: TTA.er, likes: (v) => v.likes, new: (v) => v.createTime, ratio: (v) => ratio(v) ?? 0 };

  const all = KW.kw ? state.videos.filter((v) => v.kw?.includes(KW.kw)) : [];
  const res = all.filter((v) => v.createTime >= since && v.createTime <= until && v.views >= KW.min &&
    (!KW.cart || (KW.cart === 'yes' ? v.products?.length : !v.products?.length)))
    .sort((a, b) => SORT[KW.sort](b) - SORT[KW.sort](a));
  state.kwResult = res;

  const chans = groupStats(res, (v) => v.author).map((g) => ({ ...g, total: g.vs.reduce((a, v) => a + v.views, 0) })).sort((a, b) => b.total - a.total);
  const tags = {};
  res.forEach((v) => (v.hashtags || []).forEach((h) => (tags[h] ||= []).push(v.views)));
  const tagRows = Object.entries(tags).filter(([, x]) => x.length >= 2).map(([h, x]) => ({ label: '#' + h, value: TTA.median(x), tip: `<b>#${esc(h)}</b><br>${x.length} video · view trung vị ${TTA.fmt(TTA.median(x))}` }))
    .sort((a, b) => b.value - a.value).slice(0, 12);
  const opt = (v, l, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${l}</option>`;
  const badge = (v) => { const r = ratio(v); return r >= 3 ? `<span class="tag">🔥 ${r.toFixed(1)}×</span>` : r >= 2 ? `<span class="tag">⚡ ${r.toFixed(1)}×</span>` : ''; };

  el.innerHTML = `
    <section class="card"><h2>🔎 Tìm video nhiều view theo từ khoá</h2>
      <div class="toolbar"><input id="kwInput" type="search" placeholder="vd: bất động sản, review son, mẹo nấu ăn" style="flex:1;min-width:260px" value="${esc(KW.input || '')}">
        <select id="kwDepth"><option value="8">Nhanh (~60 video)</option><option value="15" selected>Vừa (~120 video)</option><option value="30">Sâu (~250 video)</option></select>
        <button id="kwGo" class="primary">Tìm & thu thập</button></div>
      <p class="muted small" id="kwJob">${job ? esc(job.msg) + (job.step === 'run' ? ' (đừng đóng Chrome)' : '') : 'Tiện ích mở trang tìm kiếm video của TikTok trong tab nền, tự cuộn để lấy kết quả rồi đóng tab. Mất khoảng 1–2 phút. Cần đang đăng nhập tiktok.com.'}</p>
      <p class="muted small">Cách thủ công: tự tìm từ khoá trên tiktok.com (tab Video) rồi bấm “Tự cuộn để thu thập” — kết quả cũng tự vào đây. Quét lại vài ngày một lần để có video mới.</p>
      ${kws.length ? `<div class="toolbar">${kws.map((k) => `<button class="kwChip${k === KW.kw ? ' primary' : ''}" data-kw="${esc(k)}">${esc(k)} · ${counts[k] || 0}</button>`).join('')}</div>` : ''}
    </section>
    ${!KW.kw ? '<section class="card"><p>Chưa có từ khoá nào. Nhập từ khoá ở trên rồi bấm “Tìm & thu thập”.</p></section>' : `
    <section class="card"><div class="toolbar">
      <label class="small">Thời gian đăng <select id="kwRange">${[['1', '24 giờ qua'], ['7', '7 ngày'], ['30', '30 ngày'], ['90', '3 tháng'], ['180', '6 tháng'], ['365', '12 tháng'], ['0', 'Toàn bộ'], ['custom', 'Tự chọn ngày…']].map(([v, l]) => opt(v, l, KW.range)).join('')}</select></label>
      ${KW.range === 'custom' ? `<label class="small">Từ <input id="kwFrom" type="date" value="${KW.from}"></label><label class="small">Đến <input id="kwTo" type="date" value="${KW.to}"></label>` : ''}
      <label class="small">Sắp xếp <select id="kwSort">${[['views', 'Nhiều view nhất'], ['perDay', 'View / ngày (đang lên)'], ['ratio', 'Bứt phá so với kênh'], ['er', 'Tương tác (ER)'], ['likes', 'Nhiều tim nhất'], ['new', 'Mới nhất']].map(([v, l]) => opt(v, l, KW.sort)).join('')}</select></label>
      <label class="small">View tối thiểu <select id="kwMin">${[[0, 'Tất cả'], [10000, '10K'], [100000, '100K'], [500000, '500K'], [1000000, '1 triệu']].map(([v, l]) => opt(v, l, KW.min)).join('')}</select></label>
      <label class="small">Gắn giỏ <select id="kwCart">${[['', 'Tất cả'], ['yes', 'Chỉ video gắn giỏ'], ['no', 'Không gắn giỏ']].map(([v, l]) => opt(v, l, KW.cart)).join('')}</select></label>
      <button id="kwCsv">Xuất CSV</button><button id="kwDel" title="Xoá nhãn từ khoá này (video vẫn giữ)">Xoá từ khoá</button>
    </div></section>
    ${kpiRow([['Video phù hợp', `${res.length} / ${all.length}`], ['Tổng lượt xem', TTA.fmt(res.reduce((a, v) => a + v.views, 0))], ['View trung vị', TTA.fmt(TTA.median(res.map((v) => v.views)))],
      ['ER trung vị', TTA.pct(TTA.median(res.filter((v) => v.views).map(TTA.er)))], ['Số kênh', chans.length], ['Video gắn giỏ', res.filter((v) => v.products?.length).length]])}
    <section class="card"><h2>🏆 Video nhiều view — "${esc(KW.kw)}"</h2>
      <p class="muted small">View/ngày = lượt xem chia số ngày từ lúc đăng (video mới mà cao là đang lên). 🔥/⚡ = gấp ≥3×/≥2× view trung vị của chính kênh đó (khi đã có ≥ 5 video của kênh).</p>
      ${tbl(['Video', 'Kênh', 'Ngày đăng', 'View', 'View/ngày', 'Tim', 'ER', 'Gắn giỏ'],
        res.slice(0, 200).map((v) => [vlink(v) + badge(v), `<a href="https://www.tiktok.com/@${esc(v.author)}" target="_blank">@${esc(v.author)}</a>`, TTA.fmtDate(v.createTime),
          `<b>${TTA.fmt(v.views)}</b>`, TTA.fmt(perDay(v)), TTA.fmt(v.likes), TTA.pct(TTA.er(v)), v.products?.length ? '🛒' : '']),
        'Không có video nào trong khoảng thời gian / bộ lọc này. Thử chọn khoảng dài hơn hoặc quét sâu hơn.')}</section>
    <div class="grid2">
      <section class="card"><h2>Kênh nổi bật trong từ khoá</h2><p class="muted small">Tổng lượt xem các video của kênh trong kết quả.</p>
        ${hbarsSVG(chans.slice(0, 12).map((g) => ({ label: '@' + g.name, value: g.total, tip: `<b>@${esc(g.name)}</b><br>${g.n} video · tổng ${TTA.fmt(g.total)} view` })))}</section>
      <section class="card"><h2>Hashtag đi kèm hiệu quả</h2><p class="muted small">View trung vị của video chứa hashtag (≥ 2 video).</p>${hbarsSVG(tagRows)}</section>
    </div>`}`;

  const rerender = () => PANES.keyword();
  $('#kwInput').oninput = (e) => (KW.input = e.target.value);
  $('#kwGo').onclick = async () => {
    const q = $('#kwInput').value.trim();
    if (!q) return;
    await chrome.runtime.sendMessage({ type: 'searchKeyword', keyword: q, scrolls: Number($('#kwDepth').value) });
    KW.kw = TTA.kwKey(q);
    $('#kwJob').textContent = 'Đã bắt đầu… (tiến trình cập nhật tự động)';
  };
  el.querySelectorAll('.kwChip').forEach((b) => (b.onclick = () => { KW.kw = b.dataset.kw; rerender(); }));
  if (!KW.kw) return;
  const bind = (id, key, num) => ($(id).onchange = (e) => { KW[key] = num ? Number(e.target.value) : e.target.value; rerender(); });
  bind('#kwRange', 'range'); bind('#kwSort', 'sort'); bind('#kwMin', 'min', true); bind('#kwCart', 'cart');
  if ($('#kwFrom')) { bind('#kwFrom', 'from'); bind('#kwTo', 'to'); }
  $('#kwCsv').onclick = () => TTA.download(`tiktok-tukhoa-${KW.kw.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`, TTA.toCSV(res));
  $('#kwDel').onclick = async () => {
    if (!confirm(`Xoá từ khoá "${KW.kw}" khỏi danh sách? (Video vẫn được giữ trong dữ liệu)`)) return;
    const { videos = {}, ttKeywords = {} } = await chrome.storage.local.get(['videos', 'ttKeywords']);
    for (const id in videos) if (videos[id].kw?.includes(KW.kw)) videos[id].kw = videos[id].kw.filter((k) => k !== KW.kw);
    delete ttKeywords[KW.kw];
    KW.kw = '';
    await chrome.storage.local.set({ videos, ttKeywords });
  };
};
