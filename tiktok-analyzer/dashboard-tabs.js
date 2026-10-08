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
  const money = (x) => {
    if (x == null || !Number.isFinite(x)) return '–';
    const f = (n, u) => n.toFixed(n >= 100 ? 0 : 1).replace(/\.0$/, '').replace('.', ',') + u;
    return x >= 1e9 ? f(x / 1e9, ' tỷđ') : x >= 1e6 ? f(x / 1e6, ' trđ') : x >= 1e3 ? f(x / 1e3, 'kđ') : Math.round(x) + 'đ';
  };
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
