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
        <select id="kwDepth"><option value="10">Nhanh (~100 video)</option><option value="25" selected>Vừa (~250 video)</option><option value="50">Sâu (~500 video)</option><option value="100">Rất sâu (~1000 video)</option></select>
        <button id="kwGo" class="primary">Tìm & thu thập</button></div>
      <p class="muted small" id="kwJob">${job ? esc(job.msg) + (job.step === 'run' ? ' (đừng đóng Chrome)' : '') : 'Tiện ích mở trang tìm kiếm video của TikTok trong một cửa sổ nhỏ, tự cuộn lấy kết quả rồi tự đóng. Để cửa sổ đó mở (đừng thu nhỏ) tới khi xong. Cần đang đăng nhập tiktok.com. Quét nhiều lần sẽ cộng dồn thêm video.'}</p>
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
