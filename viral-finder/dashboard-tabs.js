// Các tab mở rộng: Phân tích kênh, Bình luận, Theo dõi & Trend, TikTok Shop.
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

// ================= 🧭 Phân tích kênh =================
// Dán link kênh → tiện ích tự thu thập → báo cáo: thẻ kênh, sức khoẻ, video hot, tuyến nội dung, công thức, việc nên làm.
const CH = { input: '', hot: 'views', autoPick: 0 };
const DAY = 86400;
// Hashtag "kéo đề xuất" chung chung, không nói lên chủ đề kênh
const GENERIC_TAGS = new Set('fyp fypシ fypシ゚viral foryou foryoupage fypage fy fyp2024 fyp2025 fyppp xuhuong xuhuongtiktok xh trending trend viral viralvideo tiktok tiktokvietnam capcut learnontiktok foryourpage douyin reels'.split(' '));
const CTA_RE = /(follow|theo dõi|bình luận|comment|cmt|link (ở |trong )?bio|bấm vào giỏ|giỏ hàng|giỏ vàng|inbox|nhắn tin|lưu lại|save lại|chia sẻ cho|tag (bạn|người|ngay))/i;
const SERIES_RE = /(phần|part|tập|ep\.?|p\.)\s*\d+/i;
const shareOf = (vs, f) => (vs.length ? vs.filter(f).length / vs.length : 0);
const rate = (v, k) => (v.views ? v[k] / v.views : 0);

// Mốc tham khảo cho TikTok (ngắn): [tốt, trung bình]. Dưới mốc trung bình = thấp.
const HEALTH = {
  er: [0.06, 0.03], save: [0.005, 0.002], share: [0.003, 0.001], cpk: [2, 0.8],
  vf: [0.3, 0.1], hit: [0.15, 0.08], freq: [5, 2], mom: [0.1, -0.1],
};
const grade = (k, x) => (x == null || !Number.isFinite(x) ? '' : x >= HEALTH[k][0] ? 'good' : x >= HEALTH[k][1] ? 'ok' : 'bad');

// Gom video thành tuyến nội dung: hashtag chủ đề hay dùng (gộp các hashtag hay đi cùng nhau),
// video không có hashtag chủ đề thì xếp theo format (review, hướng dẫn…).
function channelPillars(list, chMed) {
  const minN = Math.max(3, Math.round(list.length * 0.04));
  const ids = {};
  list.forEach((v) => new Set(v.hashtags).forEach((t) => { if (t.length > 1 && !GENERIC_TAGS.has(t)) (ids[t] ||= new Set()).add(v.id); }));
  const tags = Object.keys(ids).filter((t) => ids[t].size >= minN).sort((a, b) => ids[b].size - ids[a].size);
  const groups = [];
  for (const t of tags) {
    const g = groups.find((x) => {
      const a = ids[x.tags[0]], b = ids[t];
      let inter = 0;
      b.forEach((id) => a.has(id) && inter++);
      return inter >= 0.7 * Math.min(a.size, b.size);
    });
    if (g) g.tags.push(t); else if (groups.length < 8) groups.push({ tags: [t] });
  }
  const by = {};
  const pillarOf = new Map();
  list.forEach((v) => {
    const g = groups.find((x) => x.tags.some((t) => v.hashtags.includes(t)));
    let name, kind;
    if (g) { name = g.tags.slice(0, 2).map((t) => '#' + t).join(' '); kind = 'hashtag'; }
    else { name = TTA.formatType(`${v.desc} ${v.transcript || ''}`); kind = 'format'; if (name === 'Khác') name = 'Chưa rõ chủ đề'; }
    (by[name] ||= { name, kind, vs: [] }).vs.push(v);
  });
  // tuyến chỉ có 1 video → gộp vào "Chưa rõ chủ đề"
  for (const k of Object.keys(by)) {
    if (by[k].vs.length < 2 && k !== 'Chưa rõ chủ đề') {
      (by['Chưa rõ chủ đề'] ||= { name: 'Chưa rõ chủ đề', kind: 'format', vs: [] }).vs.push(...by[k].vs);
      delete by[k];
    }
  }
  const pillars = Object.values(by).map((p) => {
    const med = TTA.median(p.vs.map((v) => v.views));
    p.vs.forEach((v) => pillarOf.set(v.id, p.name));
    return {
      ...p, n: p.vs.length, share: p.vs.length / list.length, med, ratio: med / (chMed || 1),
      er: TTA.median(p.vs.map(TTA.er)), save: TTA.median(p.vs.map((v) => rate(v, 'saves'))),
      best: [...p.vs].sort((a, b) => b.views - a.views)[0],
    };
  }).sort((a, b) => b.n - a.n);
  const real = pillars.filter((p) => p.name !== 'Chưa rõ chủ đề');
  const avgShare = real.length ? 1 / real.length : 1;
  real.forEach((p) => {
    const many = p.share >= avgShare, good = p.ratio >= 1;
    p.quad = many && good ? 'core' : !many && good ? 'chance' : many ? 'waste' : 'drop';
  });
  return { pillars, pillarOf };
}

function channelHealth(list, user) {
  const now = Date.now() / 1000;
  const mature = list.filter((v) => now - v.createTime >= 3 * DAY);
  const base = mature.length >= 5 ? mature : list;
  const med = TTA.median(base.map((v) => v.views));
  const inRange = (a, b) => list.filter((v) => v.createTime >= now - b * DAY && v.createTime < now - a * DAY).map((v) => v.views);
  const recent = inRange(3, 33), before = inRange(33, 63);
  return {
    base, med,
    er: TTA.median(base.map(TTA.er)),
    save: TTA.median(base.map((v) => rate(v, 'saves'))),
    share: TTA.median(base.map((v) => rate(v, 'shares'))),
    cpk: TTA.median(base.map((v) => rate(v, 'comments') * 1000)),
    vf: user?.followers ? med / user.followers : null,
    hit: shareOf(base, (v) => med > 0 && v.views >= 2 * med),
    freq: (list.filter((v) => v.createTime >= now - 30 * DAY).length / 30) * 7,
    mom: recent.length >= 3 && before.length >= 3 ? TTA.median(recent) / (TTA.median(before) || 1) - 1 : null,
    young: list.length - mature.length,
  };
}

const stripTags = (h) => String(h).replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// ---- 💰 Kiếm tiền: giỏ hàng, hợp tác nhãn hàng, người bán TikTok Shop ----
function channelMoney(list, u, comments) {
  const sell = list.filter((v) => v.products?.length);
  const plain = list.filter((v) => !v.products?.length);
  const branded = list.filter((v) => v.branded);
  const mSell = TTA.median(sell.map((v) => v.views)), mPlain = TTA.median(plain.map((v) => v.views));
  const ratio = sell.length >= 2 && plain.length >= 2 ? mSell / (mPlain || 1) : null;
  const prods = {};
  sell.forEach((v) => v.products.forEach((p) => {
    const k = p.pid || p.title;
    const x = (prods[k] ||= { title: p.title || '(sản phẩm)', price: p.price, sold: 0, vs: [] });
    x.vs.push(v);
    if (p.sold > x.sold) x.sold = p.sold;
    if (!x.price && p.price) x.price = p.price;
  }));
  const plist = Object.values(prods).sort((a, b) => b.vs.length - a.vs.length || b.sold - a.sold).slice(0, 10);
  const intent = (ids) => { const cs = ids.flatMap((id) => comments[id] || []); return cs.length ? cs.filter((c) => TTA.isIntent(c.text)).length / cs.length : null; };
  const iSell = intent(sell.map((v) => v.id)), iPlain = intent(plain.map((v) => v.id));
  const acts = [];
  const notes = [];
  if (!sell.length && !branded.length && !u?.seller && !u?.bioLink) {
    return { brief: ['Chưa thấy dấu hiệu kiếm tiền (không gắn giỏ, không hợp tác nhãn hàng, không có link bio).'], html: `<section class="card"><h2>💰 Kiếm tiền</h2><p class="muted small">Chưa thấy dấu hiệu kiếm tiền trong ${list.length} video: không gắn giỏ, không gắn nhãn hợp tác nhãn hàng, không có link ở bio${u ? '' : ' (chưa có hồ sơ kênh)'}. Kênh có thể đang xây tệp trước, hoặc bán qua kênh khác (inbox, Zalo).</p></section>`, acts };
  }
  if (ratio != null) {
    notes.push(`Video gắn giỏ đạt <b>${ratio.toFixed(1)}×</b> view so với video thường (${TTA.fmt(mSell)} so với ${TTA.fmt(mPlain)}).`);
    if (ratio < 0.7) acts.push(`<b>Xen kẽ nội dung giá trị với video bán hàng</b>: video gắn giỏ chỉ đạt ${ratio.toFixed(1)}× view video thường. Bán hàng lồng trong mẹo/review thay vì chào hàng trực tiếp.`);
    else if (ratio >= 1.2) acts.push(`<b>Gắn giỏ nhiều hơn</b>: video gắn giỏ còn đạt ${ratio.toFixed(1)}× view video thường, khán giả không ngại nội dung bán hàng.`);
  }
  if (iSell != null && iPlain != null) notes.push(`Bình luận muốn mua: <b>${TTA.pct(iSell, 0)}</b> ở video gắn giỏ, ${TTA.pct(iPlain, 0)} ở video thường.`);
  else if (iPlain != null && !sell.length && iPlain >= 0.05) acts.push(`<b>Bắt đầu gắn giỏ</b>: ${TTA.pct(iPlain, 0)} bình luận đã hỏi giá / xin link dù kênh chưa gắn giỏ.`);
  const brief = [
    `Video gắn giỏ: ${TTA.pct(sell.length / list.length, 0)} (${sell.length} video); hợp tác nhãn hàng: ${branded.length} video; người bán TikTok Shop: ${u?.seller ? 'có' : 'không rõ'}${u?.bioLink ? '; link bio: ' + u.bioLink : ''}.`,
    ...notes.map(stripTags),
    ...plist.slice(0, 5).map((p) => `Sản phẩm “${p.title.slice(0, 60)}”: ${p.vs.length} video, view trung vị ${TTA.fmt(TTA.median(p.vs.map((v) => v.views)))}${p.price ? ', giá ' + p.price : ''}${p.sold ? ', đã bán ' + TTA.fmt(p.sold) : ''}.`),
  ];
  return {
    acts,
    brief,
    html: `
    <section class="card"><h2>💰 Kiếm tiền</h2>
      <div class="kpis">
        <div class="kpi"><div class="v">${TTA.pct(sell.length / list.length, 0)}</div><div class="l">Video gắn giỏ (${sell.length})</div></div>
        <div class="kpi"><div class="v">${ratio == null ? '–' : ratio.toFixed(1) + '×'}</div><div class="l">View video gắn giỏ / video thường</div></div>
        <div class="kpi"><div class="v">${Object.keys(prods).length}</div><div class="l">Sản phẩm khác nhau</div></div>
        <div class="kpi"><div class="v">${TTA.pct(branded.length / list.length, 0)}</div><div class="l">Hợp tác nhãn hàng (${branded.length})</div></div>
        <div class="kpi"><div class="v">${u?.seller ? 'Có' : u ? 'Không' : '–'}</div><div class="l">Người bán TikTok Shop</div></div>
        <div class="kpi"><div class="v small">${u?.bioLink ? esc(u.bioLink) : '–'}</div><div class="l">Link ở bio</div></div>
      </div>
      ${notes.length ? `<ul class="small">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>` : ''}
      ${plist.length ? tbl(['Sản phẩm', 'Số video', 'Tổng view', 'View trung vị', 'Giá', 'Đã bán'], plist.map((p) => [
        esc(p.title.slice(0, 80)), p.vs.length, TTA.fmt(p.vs.reduce((a, v) => a + v.views, 0)), TTA.fmt(TTA.median(p.vs.map((v) => v.views))), esc(p.price || '–'), p.sold ? TTA.fmt(p.sold) : '–',
      ])) : ''}
    </section>`,
  };
}

// ---- 👥 Khán giả: suy luận từ bình luận ----
const COMMENT_VIDEOS_UI = 3; // khớp COMMENT_VIDEOS trong background.js
const THEMES = [
  ['🛒 Hỏi giá / muốn mua', (t) => TTA.isIntent(t)],
  ['🛠 Hỏi cách làm/dùng', (t) => /(cách|làm sao|làm thế nào|dùng (sao|thế nào|như nào)|bao lâu|có được không|có nên|nên dùng|hướng dẫn|chỉ (mình|em|tôi))/i.test(t)],
  ['🙋 Kể trải nghiệm', (t) => /(mình cũng|em cũng|tôi cũng|tui cũng|mình bị|em bị|tôi bị|tui bị|mình đã|em đã|nhà mình|con mình|hồi trước|giống (mình|em|tôi))/i.test(t)],
  ['👎 Chê / phản đối', (t) => /(sai rồi|không đúng|ko đúng|xạo|lừa|dở|tệ|chán|phí tiền|vô lý|không tin|ko tin|fake|quảng cáo lố)/i.test(t)],
  ['👍 Khen / đồng tình', (t) => /(hay quá|hay ghê|hay thật|đúng (rồi|vậy|quá)|chuẩn|tuyệt|đỉnh|xinh|đẹp quá|thích quá|cảm ơn|cám ơn|hữu ích|bổ ích|❤|😍|🥰|👍|👏)/i.test(t)],
  ['👥 Tag bạn bè', (t) => /@\S+/.test(t)],
];
const themeOf = (t) => (THEMES.find(([, f]) => f(t)) || ['💬 Khác'])[0];
const VI = /[ăâđêôơưàảãáạằẳẵắặầẩẫấậèẻẽéẹềểễếệìỉĩíịòỏõóọồổỗốộờởỡớợùủũúụừửữứựỳỷỹýỵ]/i;

function channelAudience(list, comments, author) {
  const ids = list.filter((v) => comments[v.id]?.length).map((v) => v.id);
  const vmap = Object.fromEntries(list.map((v) => [v.id, v]));
  const acts = [];
  const btn = `<button id="chCmt" class="mini">Lấy bình luận ${COMMENT_VIDEOS_UI} video top</button>`;
  const topIds = [...list].sort((a, b) => b.views - a.views).slice(0, COMMENT_VIDEOS_UI).map((v) => v.id);
  const bind = () => {
    $('#chCmt').onclick = async (e) => {
      if (!LIM().comments) return upgrade('Lấy bình luận khán giả');
      e.target.disabled = true;
      const r = await chrome.runtime.sendMessage({ type: 'channelComments', user: author, ids: topIds });
      $('#chCmtInfo').textContent = r?.ok ? ' Đang lấy bình luận… (xem tiến trình ở ô Phân tích kênh phía trên)' : ' Tiện ích đang bận thu thập kênh khác, thử lại sau.';
    };
  };
  if (!ids.length) {
    const outside = state.videos.filter((v) => v.author === author && comments[v.id]?.length).length;
    return { acts, bind, brief: ['Chưa lấy bình luận.'], html: `<section class="card"><h2>👥 Khán giả (suy luận từ bình luận)</h2>
      <p class="muted small">Chưa có bình luận của các video trong khoảng thời gian đang lọc.${outside ? ` (Đã có bình luận của ${outside} video ngoài khoảng này — chọn “Toàn bộ” ở bộ lọc thời gian để xem.)` : ''} Tiện ích sẽ mở lần lượt ${COMMENT_VIDEOS_UI} video nhiều view nhất của khoảng thời gian đang lọc trong một cửa sổ và cuộn khung bình luận (khoảng 1–2 phút). Để cửa sổ đó mở tới khi xong.</p>${btn} <span class="muted small" id="chCmtInfo"></span></section>` };
  }
  const cs = ids.flatMap((id) => comments[id]);
  const groups = {};
  cs.forEach((c) => (groups[themeOf(c.text)] ||= []).push(c));
  const themes = Object.entries(groups).map(([name, arr]) => ({ name, n: arr.length, top: [...arr].sort((a, b) => b.likes - a.likes)[0] }))
    .sort((a, b) => b.n - a.n);
  const intent = cs.filter((c) => TTA.isIntent(c.text));
  const qs = cs.filter((c) => TTA.isQuestion(c.text) && !TTA.isIntent(c.text));
  const byLikes = (arr, n) => {
    const seen = new Set();
    return [...arr].sort((a, b) => b.likes - a.likes).filter((c) => { const k = c.text.toLowerCase().replace(/s+/g, ' ').trim(); return !seen.has(k) && seen.add(k); }).slice(0, n);
  };
  const vi = cs.filter((c) => VI.test(c.text)).length / cs.length;
  const users = new Set(cs.map((c) => c.user)).size;
  const phr = TTA.phrases(cs.map((c) => c.text), 15);
  const locs = {};
  list.forEach((v) => v.loc && (locs[v.loc] = (locs[v.loc] || 0) + 1));
  const locTxt = Object.entries(locs).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${esc(k)} (${TTA.pct(n / list.length, 0)})`).join(', ');
  const main = themes.filter((t) => t.name !== '💬 Khác').slice(0, 2).map((t) => `${t.name.replace(/^\S+\s/, '').toLowerCase()} (${TTA.pct(t.n / cs.length, 0)})`);
  const persona = `Người bình luận chủ yếu ${main.length ? main.join(' và ') : 'để lại bình luận ngắn, khó phân loại'}; ${TTA.pct(intent.length / cs.length, 0)} có ý định mua, ${TTA.pct(qs.length / cs.length, 0)} đặt câu hỏi khác; ${TTA.pct(vi, 0)} bình luận bằng tiếng Việt.`;
  const topQ = byLikes(qs, 1)[0];
  if (topQ) acts.push(`<b>Làm video trả lời câu hỏi</b> được quan tâm nhất: “${esc(topQ.text.slice(0, 100))}” (${TTA.fmt(topQ.likes)} like).`);
  const brief = [
    `Dựa trên ${cs.length} bình luận của ${ids.length} video top (suy luận, không phải số liệu người xem). ${stripTags(persona)}${locTxt ? ' Video đăng từ: ' + stripTags(locTxt) + '.' : ''}`,
    'Nhóm bình luận: ' + themes.map((t) => `${t.name.replace(/^S+s/, '')} ${TTA.pct(t.n / cs.length, 0)}`).join(', ') + '.',
    ...byLikes(qs, 6).map((c) => `Câu hỏi (${c.likes} like): ${c.text.replace(/s+/g, ' ').slice(0, 140)}`),
    ...byLikes(intent, 3).map((c) => `Bình luận muốn mua (${c.likes} like): ${c.text.replace(/s+/g, ' ').slice(0, 140)}`),
    phr.length ? 'Cụm từ hay nhắc: ' + phr.slice(0, 10).map((p) => p.phrase).join(', ') + '.' : '',
  ].filter(Boolean);
  if (intent.length / cs.length >= 0.05) acts.push(`<b>Tận dụng nhu cầu mua</b>: ${TTA.pct(intent.length / cs.length, 0)} bình luận hỏi giá / xin link. Ghim bình luận có link, trả lời bằng video, gắn giỏ rõ ràng.`);
  return {
    acts,
    brief,
    html: `
    <section class="card"><div class="tablehead"><h2>👥 Khán giả (suy luận từ bình luận)</h2>${btn}</div>
      <p class="muted small">Dựa trên ${TTA.fmt(cs.length)} bình luận của ${ids.length} video, ${TTA.fmt(users)} người bình luận khác nhau. Đây là suy luận: TikTok không công khai tuổi, giới tính, vị trí người xem. <span id="chCmtInfo"></span></p>
      <p class="portrait">${persona}${locTxt ? ` Video đăng từ: ${locTxt}.` : ''}</p>
      <div class="grid2" style="margin-top:12px">
        <div>${hbarsSVG(themes.map((t) => ({ label: t.name, value: t.n / cs.length, tip: `<b>${esc(t.name)}</b> · ${t.n} bình luận<br>VD: ${esc(t.top.text.slice(0, 120))}` })), { fmt: (x) => TTA.pct(x, 0), left: 230, W: 520 })}</div>
        <div>${tbl(['Cụm từ hay nhắc', 'Số bình luận'], phr.map((p) => [esc(p.phrase), p.count]), 'Chưa đủ dữ liệu')}</div>
      </div>
      <div class="grid2" style="margin-top:12px">
        <div><h3 class="small">❓ Câu hỏi được quan tâm nhất</h3>${tbl(['Câu hỏi', 'Like'], byLikes(qs, 8).map((c) => [esc(c.text.slice(0, 160)), TTA.fmt(c.likes)]), 'Không có')}</div>
        <div><h3 class="small">🛒 Bình luận muốn mua</h3>${tbl(['Bình luận', 'Like'], byLikes(intent, 8).map((c) => [esc(c.text.slice(0, 160)), TTA.fmt(c.likes)]), 'Không có')}</div>
      </div>
      <p class="muted small">Bình luận theo video: ${ids.map((id) => `${vlink(vmap[id], (TTA.hookText(vmap[id]) || id).slice(0, 40))} (${comments[id].length})`).join(' · ')}. Xem chi tiết ở tab 💬 Bình luận.</p>
    </section>`,
    bind,
  };
}
// ---- 📅 Nhịp đăng ----
function cadenceSVG(weeks) {
  const W = 760, H = 190, left = 34, bottom = 22, top = 8;
  const maxN = Math.max(1, ...weeks.map((w) => w.n));
  const maxV = Math.max(1, ...weeks.map((w) => w.med || 0));
  const bw = (W - left) / weeks.length;
  let s = '';
  weeks.forEach((w, i) => {
    const x = left + i * bw;
    const h = ((H - bottom - top) * w.n) / maxN;
    s += `<rect x="${x + 2}" y="${H - bottom - h}" width="${Math.max(2, bw - 4)}" height="${h}" rx="3" fill="var(--series-soft)"/>`;
    if (w.med != null) s += `<circle cx="${x + bw / 2}" cy="${H - bottom - ((H - bottom - top) * w.med) / maxV}" r="4" fill="var(--series)"/>`;
    s += `<rect class="hit" x="${x}" y="0" width="${bw}" height="${H}" data-tip="${esc(`<b>Tuần ${w.label}</b><br>${w.n} video${w.med != null ? ` · trung vị ${TTA.fmt(w.med)} view` : ''}`)}"/>`;
    if (i % Math.ceil(weeks.length / 8) === 0) s += `<text x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${w.label}</text>`;
  });
  s += `<text x="${left - 6}" y="${top + 10}" text-anchor="end">${maxN}</text><text x="${left - 6}" y="${H - bottom}" text-anchor="end">0</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Số video và view trung vị theo tuần">${s}</svg>`;
}

function channelCadence(list) {
  const ts = list.filter((v) => v.createTime).sort((a, b) => a.createTime - b.createTime);
  if (ts.length < 5) return { html: '', acts: [], brief: [], after: () => {} };
  const now = Date.now() / 1000;
  const mature = ts.filter((v) => now - v.createTime >= 3 * DAY);
  // tuần bắt đầu thứ 2
  const weekStart = (sec) => { const d = new Date(sec * 1000); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); };
  const wk = {};
  ts.forEach((v) => (wk[weekStart(v.createTime)] ||= []).push(v));
  const first = weekStart(ts[0].createTime), last = weekStart(now);
  const weeks = [];
  for (let t = Math.max(first, last - 25 * 7 * DAY * 1000); t <= last; t += 7 * DAY * 1000) {
    const vs = wk[t] || [];
    const m = vs.filter((v) => now - v.createTime >= 3 * DAY);
    weeks.push({ t, n: vs.length, med: m.length ? TTA.median(m.map((v) => v.views)) : null, label: new Date(t).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' }) });
  }
  // khoảng nghỉ dài nhất
  let gap = { d: 0, from: 0 };
  for (let i = 1; i < ts.length; i++) {
    const d = (ts[i].createTime - ts[i - 1].createTime) / DAY;
    if (d > gap.d) gap = { d, from: ts[i - 1].createTime };
  }
  // ngày đăng 1 video so với ngày đăng ≥ 2 video
  const byDay = {};
  mature.forEach((v) => (byDay[new Date(v.createTime * 1000).toDateString()] ||= []).push(v.views));
  const one = Object.values(byDay).filter((a) => a.length === 1).flat(), multi = Object.values(byDay).filter((a) => a.length >= 2).flat();
  const dense = weeks.filter((w) => w.n >= 5 && w.med != null), light = weeks.filter((w) => w.n >= 1 && w.n <= 2 && w.med != null);
  const dow = DAY_ORDER.map((d) => ({ d, a: mature.filter((v) => new Date(v.createTime * 1000).getDay() === d).map((v) => v.views) }))
    .filter((x) => x.a.length >= 2).map((x) => ({ ...x, m: TTA.median(x.a) }));
  const med = TTA.median(mature.map((v) => v.views)) || 1;
  const notes = [], acts = [];
  notes.push(`Khoảng nghỉ dài nhất: <b>${Math.round(gap.d)} ngày</b> (từ ${TTA.fmtDate(gap.from)}). Trung bình ${(((ts[ts.length - 1].createTime - ts[0].createTime) / DAY) / Math.max(1, ts.length - 1)).toFixed(1)} ngày đăng 1 video.`);
  if (one.length >= 3 && multi.length >= 4) {
    const r = TTA.median(multi) / (TTA.median(one) || 1);
    notes.push(`Ngày đăng ≥ 2 video: mỗi video đạt <b>${r.toFixed(1)}×</b> so với ngày đăng 1 video (${TTA.fmt(TTA.median(multi))} so với ${TTA.fmt(TTA.median(one))}).`);
    if (r < 0.7) acts.push(`<b>Đừng dồn nhiều video trong 1 ngày</b>: ngày đăng ≥ 2 video, mỗi video chỉ đạt ${r.toFixed(1)}× view. Giãn ra mỗi ngày 1 video.`);
  }
  if (dense.length >= 2 && light.length >= 2) {
    const r = TTA.median(dense.map((w) => w.med)) / (TTA.median(light.map((w) => w.med)) || 1);
    notes.push(`Tuần đăng ≥ 5 video: view trung vị mỗi video <b>${r.toFixed(1)}×</b> so với tuần đăng 1–2 video.`);
  }
  if (dow.length >= 3) {
    const s = [...dow].sort((a, b) => b.m - a.m);
    notes.push(`Ngày trong tuần tốt nhất: <b>${DAYS[s[0].d]}</b> (${(s[0].m / med).toFixed(1)}× trung vị), kém nhất: ${DAYS[s[s.length - 1].d]} (${(s[s.length - 1].m / med).toFixed(1)}×).`);
  }
  if (gap.d >= 14 && now - gap.from < 60 * DAY) acts.push(`<b>Giữ nhịp đăng đều</b>: kênh vừa nghỉ ${Math.round(gap.d)} ngày gần đây. Lên lịch tối thiểu 3 video/tuần.`);
  return {
    acts,
    brief: notes.map(stripTags),
    html: `
    <section class="card"><h2>📅 Nhịp đăng</h2>
      <p class="muted small">Cột = số video mỗi tuần (26 tuần gần nhất), chấm = view trung vị của video đăng tuần đó (bỏ video chưa đủ 3 ngày). Rê chuột để xem số.</p>
      <div class="chart">${cadenceSVG(weeks)}</div>
      <ul class="small">${notes.map((n) => `<li>${n}</li>`).join('')}</ul>
      <h3 class="small">Giờ & ngày đăng hiệu quả (ô càng đậm, view trung vị càng cao)</h3><div id="chHeat" class="chart"></div>
    </section>`,
    after: () => chartHeat(list, $('#chHeat')),
  };
}

// ---- 📈 Kênh thay đổi theo thời gian (dùng toàn bộ video đã lấy, không theo bộ lọc) ----
function channelEvolution(all, u) {
  const now = Date.now() / 1000;
  const vs = all.filter((v) => v.createTime).sort((a, b) => a.createTime - b.createTime);
  if (vs.length < 8) return { html: '', acts: [], brief: [] };
  const { pillarOf } = channelPillars(vs, TTA.median(vs.map((v) => v.views)));
  const fmtOf = (v) => TTA.formatType(`${v.desc} ${v.transcript || ''}`);
  const mode = (arr) => { const c = {}; arr.forEach((x) => x && (c[x] = (c[x] || 0) + 1)); const b = Object.entries(c).sort((a, b) => b[1] - a[1])[0]; return b ? b[0] : '–'; };
  const months = {};
  vs.forEach((v) => { const d = new Date(v.createTime * 1000); (months[`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`] ||= []).push(v); });
  const rows = Object.entries(months).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  // bước ngoặt: video vượt ≥ 5× trung vị 10 video đăng trước đó
  const turns = [];
  for (let i = 10; i < vs.length; i++) {
    const prev = TTA.median(vs.slice(i - 10, i).map((v) => v.views)) || 1;
    if (now - vs[i].createTime >= 3 * DAY && vs[i].views >= 5 * prev) turns.push({ v: vs[i], r: vs[i].views / prev });
  }
  const third = Math.floor(vs.length / 3);
  const early = vs.slice(0, third), late = vs.slice(-third);
  const eP = mode(early.map((v) => pillarOf.get(v.id))), lP = mode(late.map((v) => pillarOf.get(v.id)));
  const eM = TTA.median(early.map((v) => v.views)), lM = TTA.median(late.map((v) => v.views));
  const span = `${TTA.fmtDate(vs[0].createTime)} – ${TTA.fmtDate(vs[vs.length - 1].createTime)}`;
  const summary = `View trung vị ${lM >= eM ? 'tăng' : 'giảm'} từ <b>${TTA.fmt(eM)}</b> (⅓ video đầu) ${lM >= eM ? 'lên' : 'xuống'} <b>${TTA.fmt(lM)}</b> (⅓ video gần nhất)` + (eP !== lP ? `; chủ đề chính chuyển từ <b>${esc(eP)}</b> sang <b>${esc(lP)}</b>.` : `; chủ đề chính vẫn là <b>${esc(lP)}</b>.`);
  const acts = [];
  if (eP !== lP && eM > lM * 1.3) acts.push(`<b>Xem lại việc đổi chủ đề</b>: trước đây làm ${esc(eP)} đạt view trung vị ${TTA.fmt(eM)}, giờ chuyển sang ${esc(lP)} chỉ còn ${TTA.fmt(lM)}.`);
  const brief = [
    stripTags(summary),
    ...rows.slice(0, 6).map(([m, a]) => `Tháng ${m.slice(5)}/${m.slice(0, 4)}: ${a.length} video, view trung vị ${TTA.fmt(TTA.median(a.map((v) => v.views)))}, tuyến chính ${mode(a.map((v) => pillarOf.get(v.id)))}.`),
    ...turns.sort((a, b) => b.r - a.r).slice(0, 4).map(({ v, r }) => `Bước ngoặt ${TTA.fmtDate(v.createTime)}: “${(TTA.hookText(v) || v.desc).slice(0, 90)}” ${TTA.fmt(v.views)} view (${r.toFixed(1)}× giai đoạn trước), tuyến ${pillarOf.get(v.id) || ''}.`),
  ];
  return {
    acts,
    brief,
    html: `
    <section class="card"><h2>📈 Kênh thay đổi theo thời gian</h2>
      <p class="muted small">Dùng toàn bộ ${vs.length} video đã lấy (${span}), không theo bộ lọc thời gian.${u?.videoCount && u.videoCount > vs.length ? ` Kênh có ${TTA.fmt(u.videoCount)} video: chọn độ sâu “Toàn bộ kênh” để xem đủ lịch sử.` : ''}</p>
      <p class="portrait">${summary}</p>
      ${tbl(['Tháng', 'Số video', 'View trung vị', 'ER', 'Tuyến chính', 'Format chính', 'Có lời nói', 'Gắn giỏ'], rows.map(([m, a]) => [
        `<b>${m.slice(5)}/${m.slice(0, 4)}</b>`, a.length, TTA.fmt(TTA.median(a.map((v) => v.views))), TTA.pct(TTA.median(a.map(TTA.er)), 1),
        esc(mode(a.map((v) => pillarOf.get(v.id)))), esc(mode(a.map(fmtOf))), TTA.pct(shareOf(a, (v) => v.hasSpeech || v.transcript), 0), TTA.pct(shareOf(a, (v) => v.products?.length), 0),
      ]))}
      <h3 class="small" style="margin-top:12px">🚀 Bước ngoặt (video vượt ≥ 5× trung vị 10 video đăng trước nó)</h3>
      ${tbl(['Video', 'Ngày', 'View', 'Gấp', 'Tuyến', 'Format'], turns.sort((a, b) => b.r - a.r).slice(0, 6).sort((a, b) => a.v.createTime - b.v.createTime).map(({ v, r }) => [
        vlink(v, TTA.hookText(v) || v.desc), TTA.fmtDate(v.createTime), TTA.fmt(v.views), r.toFixed(1) + '×', esc(pillarOf.get(v.id) || ''), esc(fmtOf(v)),
      ]), 'Chưa có video nào bứt phá hẳn so với giai đoạn trước nó.')}
    </section>`,
  };
}

// ---- 🔬 Kiểm chứng dữ liệu TikTok ----
// Các trường quan trọng: TikTok web có thật sự gửi không, và tiện ích đang dùng chưa.
const FIELD_CHECKS = [
  ['item', 'isPinned', 'Video ghim', 'pinned', true],
  ['item', 'imagePost', 'Ảnh lướt (photo)', 'photo'],
  ['item', 'CategoryType', 'Mã danh mục TikTok', 'category'],
  ['item', 'locationCreated', 'Quốc gia đăng video', 'loc'],
  ['item', 'textLanguage', 'Ngôn ngữ caption', 'lang'],
  ['item', 'suggestedWords', 'Từ khoá tìm kiếm TikTok gợi ý', 'sw'],
  ['item', 'stickersOnItem', 'Chữ chèn trên video', 'onText'],
  ['item', 'diversificationLabels', 'Nhãn chủ đề TikTok gán', 'labels'],
  ['item', 'aigcLabelType', 'Nhãn nội dung AI', 'aigc'],
  ['item', 'anchors', 'Neo sản phẩm / liên kết', 'products'],
  ['item', 'brandOrganicType', 'Hợp tác nhãn hàng', 'branded'],
  ['video', 'VQScore', 'Điểm chất lượng video', 'vq'],
  ['video', 'subtitleInfos', 'Phụ đề tự động', 'subs'],
  ['user', 'ttSeller', 'Người bán TikTok Shop', 'seller', true],
  ['user', 'commerceUserInfo', 'Thông tin tài khoản thương mại', 'seller'],
  ['user', 'bioLink', 'Link ở bio', 'bioLink'],
  ['user', 'privateAccount', 'Tài khoản riêng tư', 'privateAccount', true],
];
function channelVerify(list, fs) {
  if (!fs?.n) {
    return `<details class="card"><summary><b>🔬 Kiểm chứng dữ liệu TikTok</b></summary>
      <p class="muted small">Chưa có thống kê. Bấm “Phân tích” một kênh (sau khi đã Reload tiện ích) để tiện ích ghi lại TikTok gửi về những trường nào.</p></details>`;
  }
  const rows = FIELD_CHECKS.map(([g, k, label, mine, bool]) => {
    const base = g === 'user' ? fs.nu : fs.n;
    const [has = 0, full = 0] = fs[g]?.[k] || [];
    const stored = g === 'user' ? null : shareOf(list, (v) => v[mine] != null && v[mine] !== false && !(Array.isArray(v[mine]) && !v[mine].length));
    const status = !has ? '❌ Không thấy' : bool ? '✅ Có (đúng/sai)' : !full ? '⚠️ Có trường nhưng chưa thấy giá trị' : '✅ Có dữ liệu';
    return [`<b>${esc(label)}</b><div class="muted small"><code>${g === 'item' ? '' : g + '.'}${k}</code></div>`, base ? TTA.pct(has / base, 0) : '–', base ? TTA.pct(full / base, 0) : '–', stored == null ? '–' : TTA.pct(stored, 0), status];
  });
  const unknown = Object.entries(fs.item || {}).filter(([k, [, full]]) => full && !FIELD_CHECKS.some(([g, kk]) => g === 'item' && kk === k)).map(([k, [, full]]) => `${k} (${TTA.pct(full / fs.n, 0)})`);
  return `<details class="card"><summary><b>🔬 Kiểm chứng dữ liệu TikTok</b> <span class="muted small">· dựa trên ${TTA.fmt(fs.n)} video và ${TTA.fmt(fs.nu)} hồ sơ kênh TikTok đã gửi về</span></summary>
    <p class="muted small">“Có trường” = TikTok có gửi trường đó; “Có giá trị” = trường không rỗng; “Kênh này” = % video của kênh đang xem đã lưu được giá trị. Trường ❌ thì báo cáo không dựa vào được.</p>
    ${tbl(['Trường', 'Có trường', 'Có giá trị', 'Kênh này', 'Kết luận'], rows)}
    <p class="muted small">Các trường khác TikTok gửi kèm video (có giá trị): ${esc(unknown.join(', ')) || '–'}</p>
    <button id="chFields" class="mini">Copy toàn bộ thống kê trường</button></details>`;
}

// ---- ⚔️ So sánh kênh & 🕳 khoảng trống nội dung ----
// Video của 1 kênh theo bộ lọc thời gian đang chọn
function authorList(a) {
  const days = Number($('#fRange').value);
  const since = days ? Date.now() / 1000 - days * DAY : 0;
  return state.videos.filter((v) => v.author === a && (!since || v.createTime >= since));
}

// Số liệu gọn của 1 kênh để so sánh (mọi tỉ lệ so với trung vị của chính kênh đó, nên so được kênh to/nhỏ)
function channelSnapshot(a) {
  const list = authorList(a);
  if (list.length < 3) return null;
  const u = state.users[a];
  const H = channelHealth(list, u);
  const { pillars } = channelPillars(list, H.med);
  const fmtOf = (v) => TTA.formatType(`${v.desc} ${v.transcript || ''}`);
  const usable = (g) => g.n >= 2 && g.name !== 'Khác' && g.name !== 'Không rõ';
  const tags = {};
  list.forEach((v) => new Set(v.hashtags).forEach((t) => { if (t.length > 1 && !GENERIC_TAGS.has(t)) (tags[t] ||= []).push(v); }));
  const tagStats = Object.fromEntries(Object.entries(tags).map(([t, vs]) => {
    const med = TTA.median(vs.map((v) => v.views));
    return [t, { n: vs.length, med, ratio: med / (H.med || 1), best: [...vs].sort((x, y) => y.views - x.views)[0] }];
  }));
  return {
    a, u, list, H, pillars, tagStats, fmtOf,
    hooks: groupStats(H.base, (v) => TTA.hookType(TTA.hookText(v))).filter(usable),
    formats: groupStats(H.base, fmtOf).filter(usable),
    speech: shareOf(list, (v) => v.hasSpeech || v.transcript),
    dur: TTA.median(list.map((v) => v.duration)),
    cart: shareOf(list, (v) => v.products?.length),
  };
}

// Lời trong video + caption (bỏ hashtag) để so cụm từ giữa các kênh
const textOf = (v) => `${v.desc || ''} ${v.transcript || ''} ${v.onText || ''}`.replace(/#\S+/g, ' ');

function channelCompare(author, others, persp) {
  const snaps = [author, ...others].map(channelSnapshot).filter(Boolean);
  const me = snaps.find((s) => s.a === persp);
  const rivals = snaps.filter((s) => s.a !== persp);
  if (!me || !rivals.length) return null;

  // Bảng so sánh: [nhãn, giá trị số, cách hiển thị, cao hơn là tốt hơn?]
  const ROWS = [
    ['Follower', (s) => s.u?.followers ?? null, TTA.fmt, true],
    ['Video đang phân tích', (s) => s.list.length, (x) => x, null],
    ['View trung vị / video', (s) => s.H.med, TTA.fmt, true],
    ['View trung vị / follower', (s) => s.H.vf, (x) => TTA.pct(x, 0), true],
    ['Tỉ lệ tương tác (ER)', (s) => s.H.er, (x) => TTA.pct(x, 1), true],
    ['Tỉ lệ lưu', (s) => s.H.save, (x) => TTA.pct(x, 2), true],
    ['Tỉ lệ share', (s) => s.H.share, (x) => TTA.pct(x, 2), true],
    ['Bình luận / 1.000 view', (s) => s.H.cpk, (x) => x.toFixed(1), true],
    ['Tỉ lệ trúng (≥ 2× trung vị)', (s) => s.H.hit, (x) => TTA.pct(x, 0), true],
    ['Tần suất (video/tuần, 30 ngày)', (s) => s.H.freq, (x) => x.toFixed(1), true],
    ['Đà kênh 30 ngày', (s) => s.H.mom, (x) => (x >= 0 ? '+' : '') + TTA.pct(x, 0), true],
    ['Độ dài trung vị', (s) => s.dur, (x) => Math.round(x) + 's', null],
    ['Có lời nói', (s) => s.speech, (x) => TTA.pct(x, 0), null],
    ['Gắn giỏ', (s) => s.cart, (x) => TTA.pct(x, 0), null],
  ];
  const TEXT_ROWS = [
    ['Tuyến chính', (s) => s.pillars.find((p) => p.name !== 'Chưa rõ chủ đề')?.name || '–'],
    ['Format hiệu quả nhất', (s) => (s.formats[0] ? `${s.formats[0].name} (${s.formats[0].ratio.toFixed(1)}×)` : '–')],
    ['Kiểu hook hiệu quả nhất', (s) => (s.hooks[0] ? `${s.hooks[0].name} (${s.hooks[0].ratio.toFixed(1)}×)` : '–')],
  ];
  const head = ['Chỉ số', ...snaps.map((s) => `@${esc(s.a)}${s.a === persp ? ' ⭐' : ''}`)];
  const rows = ROWS.map(([label, f, fm, up]) => {
    const vals = snaps.map(f);
    const nums = vals.filter((x) => x != null && Number.isFinite(x));
    const best = up == null || nums.length < 2 ? null : up ? Math.max(...nums) : Math.min(...nums);
    return [label, ...vals.map((x) => (x == null || !Number.isFinite(x) ? '–' : x === best ? `<b>${fm(x)}</b> 🏆` : fm(x)))];
  }).concat(TEXT_ROWS.map(([label, f]) => [label, ...snaps.map((s) => esc(f(s)))]));

  // Khoảng trống: đối thủ làm và hiệu quả (≥ 1,2× trung vị của chính họ), kênh mình làm rất ít
  const topicGaps = {};
  rivals.forEach((r) => Object.entries(r.tagStats).forEach(([t, st]) => {
    if (st.n < 2 || st.ratio < 1.2 || (me.tagStats[t]?.n || 0) >= 2) return;
    const g = (topicGaps[t] ||= { t, who: [], best: st.best, ratio: 0, n: 0 });
    g.who.push(`@${r.a}: ${st.n} video, ${st.ratio.toFixed(1)}×`);
    g.n += st.n;
    if (st.ratio > g.ratio) { g.ratio = st.ratio; g.best = st.best; }
  }));
  const tGaps = Object.values(topicGaps).sort((a, b) => b.ratio * Math.log2(1 + b.n) - a.ratio * Math.log2(1 + a.n)).slice(0, 8);
  const share = (s, kind, name) => shareOf(s.H.base, (v) => (kind === 'format' ? s.fmtOf(v) : TTA.hookType(TTA.hookText(v))) === name);
  const styleGaps = [];
  rivals.forEach((r) => {
    for (const [kind, arr, label] of [['format', r.formats, 'Format'], ['hook', r.hooks, 'Kiểu hook']]) {
      for (const g of arr) {
        if (g.ratio < 1.2) continue;
        const mine = share(me, kind, g.name), theirs = g.n / r.H.base.length;
        if (mine < theirs / 2) styleGaps.push({ label, name: g.name, who: r.a, ratio: g.ratio, theirs, mine, best: g.best });
      }
    }
  });
  styleGaps.sort((a, b) => b.ratio - a.ratio);
  // Cụm từ đối thủ hay dùng ở video top mà mình chưa dùng
  const myText = me.list.map(textOf).join(' \n ').toLowerCase();
  const rivalTop = rivals.flatMap((r) => [...r.H.base].sort((a, b) => b.views - a.views).slice(0, Math.max(5, Math.round(r.H.base.length * 0.2))));
  const phraseGaps = TTA.phrases(rivalTop.map(textOf), 40).filter((p) => !p.phrase.startsWith('#') && !myText.includes(p.phrase)).slice(0, 12);
  // Lợi thế: chủ đề mình làm tốt mà đối thủ không làm
  const strengths = Object.entries(me.tagStats).filter(([t, st]) => st.n >= 2 && st.ratio >= 1.2 && rivals.every((r) => (r.tagStats[t]?.n || 0) < 2))
    .sort((a, b) => b[1].ratio - a[1].ratio).slice(0, 5);
  // Video đối thủ đáng học: vượt xa trung vị của chính kênh họ
  const learn = rivals.flatMap((r) => r.H.base.map((v) => ({ v, r: v.views / (r.H.med || 1) }))).sort((a, b) => b.r - a.r).slice(0, 6);

  const acts = [];
  if (tGaps[0]) acts.push(`<b>Thử chủ đề #${esc(tGaps[0].t)}</b>: ${esc(tGaps[0].who[0])} trung vị của họ, ${persp === author ? 'kênh này' : '@' + esc(persp)} chưa làm. Tham khảo ${vlink(tGaps[0].best, 'video này')}.`);
  if (styleGaps[0]) acts.push(`<b>Thử ${styleGaps[0].label.toLowerCase()} “${esc(styleGaps[0].name)}”</b>: @${esc(styleGaps[0].who)} dùng ở ${TTA.pct(styleGaps[0].theirs, 0)} video, đạt ${styleGaps[0].ratio.toFixed(1)}×; @${esc(persp)} mới ${TTA.pct(styleGaps[0].mine, 0)}.`);

  const html = `
    <section class="card"><h2>⚔️ So sánh với đối thủ</h2>
      <p class="muted small">Cùng khoảng thời gian đang lọc. 🏆 = tốt nhất trong nhóm. “×” = so với trung vị của chính kênh đó, nên so được kênh lớn với kênh nhỏ. ⭐ = góc nhìn đang dùng để tìm khoảng trống.</p>
      ${tbl(head, rows)}
    </section>
    <section class="card"><h2>🕳 Khoảng trống nội dung của @${esc(persp)}</h2>
      <p class="muted small">Thứ đối thủ đang làm và ăn view (≥ 1,2× trung vị của chính họ) nhưng @${esc(persp)} làm rất ít hoặc chưa làm.</p>
      <h3 class="small">Chủ đề (hashtag)</h3>
      ${tbl(['Chủ đề', 'Đối thủ đang làm', '@' + esc(persp) + ' có', 'Video tham khảo'], tGaps.map((g) => [`<b>#${esc(g.t)}</b>`, esc(g.who.join(' · ')), me.tagStats[g.t]?.n || 0, vlink(g.best, TTA.hookText(g.best) || g.best.desc)]), 'Không thấy chủ đề nào đối thủ làm tốt mà bạn chưa làm.')}
      <h3 class="small" style="margin-top:12px">Format & kiểu hook</h3>
      ${tbl(['Cách làm', 'Đối thủ', 'Tỉ lệ đối thủ dùng', '@' + esc(persp) + ' dùng', 'Hiệu quả với đối thủ', 'Ví dụ'], styleGaps.slice(0, 6).map((g) => [`${g.label}: <b>${esc(g.name)}</b>`, '@' + esc(g.who), TTA.pct(g.theirs, 0), TTA.pct(g.mine, 0), g.ratio.toFixed(1) + '×', vlink(g.best, TTA.hookText(g.best) || g.best.desc)]), 'Không có.')}
      <div class="grid2" style="margin-top:12px">
        <div><h3 class="small">Cụm từ đối thủ dùng ở video top, bạn chưa dùng</h3>${tbl(['Cụm từ', 'Số video'], phraseGaps.map((p) => [esc(p.phrase), p.count]), 'Không có (hoặc cần thêm lời thoại).')}</div>
        <div><h3 class="small">💪 Lợi thế của @${esc(persp)}: chủ đề làm tốt mà đối thủ không làm</h3>${tbl(['Chủ đề', 'Số video', '× trung vị'], strengths.map(([t, st]) => [`#${esc(t)}`, st.n, st.ratio.toFixed(1) + '×']), 'Chưa thấy.')}</div>
      </div>
      <h3 class="small" style="margin-top:12px">🎯 Video đối thủ đáng học (vượt xa trung vị của chính kênh họ)</h3>
      ${tbl(['Video', 'Kênh', 'View', '× trung vị kênh', 'Format', 'Độ dài'], learn.map(({ v, r }) => [vlink(v, TTA.hookText(v) || v.desc), '@' + esc(v.author), TTA.fmt(v.views), r.toFixed(1) + '×', esc(TTA.formatType(textOf(v))), v.duration ? v.duration + 's' : '–']))}
    </section>`;

  const brief = [
    ...snaps.map((s) => `@${s.a}${s.a === persp ? ' (góc nhìn chính)' : ''}: ${s.u?.followers != null ? TTA.fmt(s.u.followers) + ' follower, ' : ''}${s.list.length} video, view trung vị ${TTA.fmt(s.H.med)}, ER ${TTA.pct(s.H.er, 1)}, lưu ${TTA.pct(s.H.save, 2)}, share ${TTA.pct(s.H.share, 2)}, tỉ lệ trúng ${TTA.pct(s.H.hit, 0)}, ${s.H.freq.toFixed(1)} video/tuần, tuyến chính ${s.pillars.find((p) => p.name !== 'Chưa rõ chủ đề')?.name || '–'}, format tốt nhất ${s.formats[0]?.name || '–'}, hook tốt nhất ${s.hooks[0]?.name || '–'}.`),
    ...tGaps.slice(0, 5).map((g) => `Khoảng trống chủ đề #${g.t}: ${g.who.join('; ')}; @${persp} có ${me.tagStats[g.t]?.n || 0} video. Ví dụ: “${(TTA.hookText(g.best) || g.best.desc).slice(0, 90)}”.`),
    ...styleGaps.slice(0, 4).map((g) => `Khoảng trống cách làm: ${g.label} “${g.name}” — @${g.who} dùng ${TTA.pct(g.theirs, 0)} video, đạt ${g.ratio.toFixed(1)}×; @${persp} dùng ${TTA.pct(g.mine, 0)}.`),
    phraseGaps.length ? `Cụm từ đối thủ dùng ở video top mà @${persp} chưa dùng: ${phraseGaps.slice(0, 10).map((p) => p.phrase).join(', ')}.` : '',
    strengths.length ? `Lợi thế của @${persp}: ${strengths.map(([t, st]) => `#${t} (${st.ratio.toFixed(1)}×)`).join(', ')}.` : '',
    ...learn.slice(0, 4).map(({ v, r }) => `Video đối thủ đáng học: @${v.author} “${(TTA.hookText(v) || v.desc).slice(0, 90)}” ${TTA.fmt(v.views)} view (${r.toFixed(1)}× trung vị kênh họ), ${TTA.formatType(textOf(v))}, ${v.duration || '?'}s.`),
  ].filter(Boolean);
  return { html, acts, brief };
}

// Xoá toàn bộ dữ liệu của 1 kênh: video, hồ sơ, bình luận; bỏ khỏi so sánh / theo dõi
async function deleteChannel(a) {
  const n = state.videos.filter((v) => v.author === a).length;
  if (!confirm(`Xoá kênh @${a} khỏi dữ liệu?\n\nSẽ xoá ${n} video, hồ sơ kênh và bình luận đã lấy của kênh này (cả trong báo cáo từ khoá nếu có). Không hoàn tác được.`)) return;
  const all = await chrome.storage.local.get(['videos', 'users', 'chCompare', 'myChannel', 'watchChannels']);
  const videos = all.videos || {};
  const cKeys = [];
  for (const id in videos) if ((videos[id].author || '').toLowerCase() === a.toLowerCase()) { delete videos[id]; cKeys.push('c:' + id); }
  const users = all.users || {};
  delete users[a];
  const out = { videos, users, chCompare: (all.chCompare || []).filter((x) => x !== a), watchChannels: (all.watchChannels || []).filter((x) => x !== a) };
  if (all.myChannel === a) out.myChannel = '';
  if ($('#fAuthor').value === a) $('#fAuthor').value = '';
  await chrome.storage.local.remove(cKeys);
  await chrome.storage.local.set(out);
}

// ---- 📋 Brief cho ChatGPT / Claude ----
// Vai trò AI và phần dữ liệu đưa vào brief theo từng mục tiêu (thứ tự = thứ tự trong brief)
const BRIEF_SETUP = {
  plan: { role: 'chuyên gia chiến lược nội dung TikTok tại Việt Nam', secs: ['info', 'health', 'pillars', 'top10', 'formula', 'audience', 'cadence', 'evolution', 'money', 'compare', 'acts'] },
  rival: { role: 'chuyên gia phân tích đối thủ trên TikTok tại Việt Nam', secs: ['compare', 'info', 'health', 'pillars', 'top10', 'formula', 'acts'] },
  script: { role: 'biên kịch video ngắn TikTok tại Việt Nam, giỏi viết câu hook giữ chân người xem', secs: ['info', 'top10full', 'formula', 'pillars', 'audience'] },
  sell: { role: 'chuyên gia bán hàng và affiliate trên TikTok Shop tại Việt Nam', secs: ['info', 'money', 'audience', 'top10', 'pillars', 'health'] },
};
const BRIEF_GOALS = {
  plan: ['Kế hoạch nội dung', [
    'Nhận xét 5 điểm mạnh và 5 điểm yếu trong chiến lược nội dung của kênh, mỗi ý dẫn số liệu ở trên.',
    'Đề xuất 10 ý tưởng video cụ thể (tiêu đề, câu hook 3 giây đầu, format, độ dài, thuộc tuyến nào), ưu tiên tuyến “Cơ hội”, khoảng trống nội dung và câu hỏi của khán giả.',
    'Viết kịch bản chi tiết 30–60 giây cho 3 ý tưởng tốt nhất (hook, thân, kêu gọi hành động, gợi ý hình ảnh).',
    'Lên lịch đăng 2 tuần (ngày, giờ, ý tưởng) theo khung giờ và tần suất hiệu quả ở trên.',
  ]],
  rival: ['Học từ đối thủ', [
    'So sánh kênh với đối thủ: đối thủ đang làm tốt hơn ở đâu và vì sao (dựa trên số liệu).',
    'Chọn 3 khoảng trống nội dung đáng làm nhất, giải thích lý do và cách làm khác biệt (không sao chép).',
    'Đề xuất 6 ý tưởng video khai thác khoảng trống và lợi thế riêng của kênh, kèm câu hook 3 giây đầu.',
    'Chỉ ra 3 điều kênh nên tránh dựa trên những gì không hiệu quả với cả hai bên.',
  ]],
  script: ['Viết kịch bản', [
    'Viết 5 kịch bản video 30–60 giây cho tuyến “Cơ hội” và khoảng trống nội dung: câu hook 3 giây đầu (theo kiểu hook hiệu quả nhất), thân bài theo từng cảnh, kêu gọi hành động, gợi ý chữ trên màn hình, caption và 3–5 hashtag.',
    'Mỗi kịch bản trả lời ít nhất 1 câu hỏi thật của khán giả ở trên nếu phù hợp.',
  ]],
  sell: ['Nội dung bán hàng', [
    'Đánh giá cách kênh đang bán hàng (gắn giỏ, sản phẩm, phản ứng trong bình luận).',
    'Đề xuất tỉ lệ nội dung giá trị / nội dung bán hàng phù hợp và giải thích.',
    'Đề xuất 8 ý tưởng video bán hàng không “chào hàng lộ liễu” (review, so sánh, trước-sau, trả lời câu hỏi giá), kèm câu hook và cách gắn giỏ.',
    'Viết 2 kịch bản bán hàng chi tiết 30–45 giây.',
  ]],
};

PANES.content = (list, author) => {
  const el = $('#paneContent');
  const job = state.chJob;
  // đang gõ link → chỉ cập nhật dòng tiến trình, không vẽ lại cả tab
  if (document.activeElement?.id === 'chInput') { if (job && $('#chJob')) $('#chJob').textContent = job.msg; return; }
  // vừa thu thập xong 1 kênh → tự chọn kênh đó
  if (job?.step === 'done' && !job.noPick && job.t !== CH.autoPick && Date.now() - job.t < 10 * 60e3) {
    CH.autoPick = job.t;
    const a = [...$('#fAuthor').options].map((o) => o.value).find((x) => x && x.toLowerCase() === job.user.toLowerCase());
    if (a && a !== author) { $('#fAuthor').value = a; render(); return; }
  }

  const counts = {};
  state.videos.forEach((v) => (counts[v.author] = (counts[v.author] || 0) + 1));
  const known = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 12);
  const rivalsPick = Object.keys(counts).filter((a) => a !== author).sort((a, b) => counts[b] - counts[a]).slice(0, 15);
  const others = [...new Set([state.myChannel, ...state.chCompare])].filter((a) => a && a !== author && counts[a]);
  const head = `
    <section class="card"><h2>🧭 Phân tích kênh</h2>
      <p class="muted small">Dán link kênh của bạn hoặc của đối thủ. Tiện ích tự mở kênh trong một cửa sổ nhỏ, cuộn lấy video, lấy bình luận 3 video top và lời thoại 10 video top, rồi hiện báo cáo bên dưới. Cần đang đăng nhập tiktok.com.</p>
      <div class="toolbar"><input id="chInput" type="search" placeholder="vd: https://www.tiktok.com/@tenkenh hoặc @tenkenh" style="flex:1;min-width:min(260px,100%)" value="${esc(CH.input)}">
        <select id="chDepth">${[[10, 'Nhanh (~150 video)'], [25, 'Vừa (~400 video)'], [60, 'Toàn bộ kênh']].map(([v, l]) => `<option value="${v}"${v > LIM().maxDepth ? ' disabled' : ''}${v === Math.min(25, LIM().maxDepth) ? ' selected' : ''}>${v > LIM().maxDepth ? '🔒 ' : ''}${l}${v > LIM().maxDepth ? ' – Pro' : ''}</option>`).join('')}</select>
        <label class="small"><input type="checkbox" id="chCmtOn"${CH.cmtOn === false || !LIM().comments ? '' : ' checked'}${LIM().comments ? '' : ' disabled'}> ${LIM().comments ? '' : '🔒 '}Lấy bình luận ${COMMENT_VIDEOS_UI} video top</label>
        <label class="small" title="Tải thêm 10 trang video ở chế độ nền để lấy lời thoại. Dễ bị TikTok chặn tạm (lỗi 403) nếu dùng nhiều — có thể lấy sau bằng nút 📋 ở Video hot."><input type="checkbox" id="chTrOn"${CH.trOn && LIM().bulkTranscript ? ' checked' : ''}${LIM().bulkTranscript ? '' : ' disabled'}> ${LIM().bulkTranscript ? '' : '🔒 '}Lấy lời thoại 10 video top</label>
        <button id="chGo" class="primary">Phân tích</button></div>
      <p class="muted small" id="chJob">${job ? esc(job.msg) + (job.step === 'run' ? ' (đừng đóng Chrome)' : '') + (job.locked ? ' <a href="#" class="toAcc">Mở trang Tài khoản →</a>' : '') : ''}</p>
      ${known.length ? `<div class="toolbar"><span class="muted small">Kênh đã có dữ liệu:</span>${known.map((a) => `<span class="chipgrp"><button class="mini chPick${a === author ? ' primary' : ''}" data-a="${esc(a)}">@${esc(a)} · ${counts[a]}</button><button class="mini chDel" data-a="${esc(a)}" title="Xoá dữ liệu kênh @${esc(a)}">✕</button></span>`).join('')}</div>` : ''}
      ${author && rivalsPick.length ? `<div class="toolbar"><span class="muted small">So sánh với (tối đa 3):</span>${rivalsPick.map((a) => `<button class="mini chCmp${others.includes(a) ? ' primary' : ''}" data-a="${esc(a)}">${a === state.myChannel ? '⭐ ' : ''}@${esc(a)}</button>`).join('')}</div>` : ''}
    </section>`;
  const bindHead = () => {
    $('#chInput').oninput = (e) => (CH.input = e.target.value);
    $('#chCmtOn').onchange = (e) => (CH.cmtOn = e.target.checked);
    $('#chTrOn').onchange = (e) => (CH.trOn = e.target.checked);
    $('#chInput').onkeydown = (e) => { if (e.key === 'Enter') $('#chGo').click(); };
    $('#chGo').onclick = async () => {
      const r = await chrome.runtime.sendMessage({ type: 'analyzeChannel', input: $('#chInput').value, scrolls: Number($('#chDepth').value), comments: $('#chCmtOn').checked, transcripts: $('#chTrOn').checked });
      $('#chJob').textContent = r?.ok ? 'Đã bắt đầu… (tiến trình cập nhật tự động)' : 'Link chưa đúng. Dán dạng https://www.tiktok.com/@tenkenh hoặc @tenkenh.';
    };
    el.querySelectorAll('.chPick').forEach((b) => (b.onclick = () => { $('#fAuthor').value = b.dataset.a; render(); }));
    el.querySelectorAll('.chDel').forEach((b) => (b.onclick = () => deleteChannel(b.dataset.a)));
    el.querySelectorAll('.chCmp').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a;
      if (a === state.myChannel) { chrome.storage.local.set({ myChannel: '' }); return; } // bỏ chọn kênh của tôi = bỏ ⭐
      const cur = state.chCompare.filter((x) => x !== state.myChannel);
      chrome.storage.local.set({ chCompare: cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a].slice(-3) });
    }));
  };

  if (!author) { el.innerHTML = head + '<section class="card"><p>Dán link kênh ở trên, hoặc chọn một kênh đã có dữ liệu.</p></section>'; bindHead(); return; }
  if (list.length < 3) { el.innerHTML = head + `<section class="card"><p>@${esc(author)} mới có ${list.length} video trong khoảng thời gian đang lọc. Bấm “Phân tích” để thu thập thêm, hoặc chọn “Toàn bộ” ở bộ lọc thời gian.</p></section>`; bindHead(); return; }

  const u = state.users[author];
  const H = channelHealth(list, u);
  const chMed = H.med;
  const { pillars, pillarOf } = channelPillars(list, chMed);
  const fmtOf = (v) => TTA.formatType(`${v.desc} ${v.transcript || ''}`);
  const durLabel = (d) => (DUR.find((b) => d < b.max) || DUR[DUR.length - 1]).label;
  const allOfAuthor = state.videos.filter((v) => v.author === author).length;
  const rangeLabel = $('#fRange').selectedOptions[0]?.textContent || '';

  // ---- 1. Thẻ kênh + chân dung 1 câu ----
  const durs = groupStats(H.base, (v) => durLabel(v.duration)).filter((g) => g.n >= 2);
  const fmts = groupStats(H.base, fmtOf).filter((g) => g.n >= 2 && g.name !== 'Khác');
  const speech = shareOf(list, (v) => v.hasSpeech || v.transcript);
  const core = pillars.filter((p) => p.quad === 'core' || p.quad === 'waste')[0] || pillars.find((p) => p.name !== 'Chưa rõ chủ đề');
  const portrait = [
    core ? `Kênh xoay quanh <b>${esc(core.name)}</b>` : 'Kênh chưa có chủ đề rõ ràng',
    `đăng <b>${H.freq.toFixed(1)} video/tuần</b>`,
    fmts[0] ? `ăn view nhất với <b>${esc(fmts[0].name.toLowerCase())}</b>${durs[0] ? ` dài <b>${durs[0].name}</b>` : ''}` : durs[0] ? `ăn view nhất với video <b>${durs[0].name}</b>` : '',
    speech >= 0.6 ? 'chủ yếu nói trực tiếp' : speech <= 0.3 ? 'chủ yếu không lời / nhạc nền' : '',
    `view trung vị <b>${TTA.fmt(chMed)}</b>`,
    H.hit ? `cứ ${Math.max(1, Math.round(1 / H.hit))} video có 1 video bứt phá (≥ 2× trung vị)` : 'chưa có video bứt phá',
  ].filter(Boolean).join(', ') + '.';
  const cart = shareOf(list, (v) => v.products?.length);
  const card = `
    <section class="card chCard">
      ${u?.avatar ? `<img src="${esc(u.avatar)}" alt="">` : ''}
      <div class="grow">
        <div><b>${esc(u?.nickname || author)}</b> <span class="muted">@${esc(author)}${u?.verified ? ' ✔' : ''}</span>
          ${u?.seller || cart > 0.1 ? '<span class="tag">🛒 bán hàng</span>' : ''}${u?.privateAccount ? '<span class="tag">🔒 riêng tư</span>' : ''}
          <a class="small" href="https://www.tiktok.com/@${esc(author)}" target="_blank">mở kênh ↗</a>
          <button id="chMine" class="mini${state.myChannel === author ? ' primary' : ''}" title="Kênh của tôi được dùng làm góc nhìn khi tìm khoảng trống nội dung">${state.myChannel === author ? '★ Kênh của tôi' : '☆ Đặt làm kênh của tôi'}</button></div>
        ${u?.signature ? `<div class="muted small">${esc(u.signature)}</div>` : ''}
        ${u?.bioLink ? `<div class="small">🔗 ${esc(u.bioLink)}</div>` : ''}
        <div class="small">${u ? `${TTA.fmt(u.followers)} follower · ${TTA.fmt(u.hearts)} tim · ${TTA.fmt(u.videoCount)} video trên kênh · ` : ''}đã lấy ${allOfAuthor}${u?.videoCount ? '/' + TTA.fmt(u.videoCount) : ''} video · đang phân tích ${list.length} video (${esc(rangeLabel)})</div>
        <p class="portrait">${portrait}</p>
      </div>
    </section>`;

  // ---- 2. Sức khoẻ kênh ----
  const kp = (k, label, val, x, help) => `<div class="kpi ${grade(k, x)}" data-tip="${esc(help)}"><div class="v">${val}</div><div class="l">${label}</div></div>`;
  const ths = (k, f) => `Mốc tham khảo: tốt ≥ ${f(HEALTH[k][0])}, trung bình ≥ ${f(HEALTH[k][1])}.`;
  const pct2 = (x) => TTA.pct(x, 1);
  const health = `
    <section class="card"><h2>❤️ Sức khoẻ kênh</h2>
      <p class="muted small">Xanh = tốt, vàng = trung bình, đỏ = thấp so với mốc tham khảo trên TikTok (rê chuột để xem). Dùng <b>trung vị</b> để 1 video triệu view không làm lệch số${H.young ? `; ${H.young} video đăng chưa đủ 3 ngày không tính vào trung vị vì view chưa ổn định` : ''}.</p>
      <div class="kpis">
        <div class="kpi"><div class="v">${TTA.fmt(chMed)}</div><div class="l">View trung vị / video</div></div>
        ${kp('vf', 'View trung vị / follower', H.vf == null ? '–' : TTA.pct(H.vf, 0), H.vf, 'Video thường đến được bao nhiêu % lượng follower. Cao = thuật toán đẩy ra ngoài tệp follower. ' + ths('vf', (x) => TTA.pct(x, 0)))}
        ${kp('er', 'Tỉ lệ tương tác (ER)', pct2(H.er), H.er, '(tim + bình luận + share + lưu) / view, trung vị. ' + ths('er', pct2))}
        ${kp('save', 'Tỉ lệ lưu', TTA.pct(H.save, 2), H.save, 'Người xem lưu lại để xem sau → nội dung có giá trị (mẹo, kiến thức, công thức). ' + ths('save', (x) => TTA.pct(x, 1)))}
        ${kp('share', 'Tỉ lệ share', TTA.pct(H.share, 2), H.share, 'Người xem gửi cho người khác → nội dung lan truyền. ' + ths('share', (x) => TTA.pct(x, 1)))}
        ${kp('cpk', 'Bình luận / 1.000 view', H.cpk.toFixed(1), H.cpk, 'Mức độ khơi gợi trò chuyện. ' + ths('cpk', (x) => x.toFixed(1)))}
        ${kp('hit', 'Tỉ lệ trúng (≥ 2× trung vị)', TTA.pct(H.hit, 0), H.hit, 'Bao nhiêu % video vượt gấp đôi mức thường. Cao = kênh có công thức lặp lại được, không chỉ ăn may. ' + ths('hit', (x) => TTA.pct(x, 0)))}
        ${kp('freq', 'Tần suất đăng (30 ngày)', H.freq.toFixed(1) + ' video/tuần', H.freq, ths('freq', (x) => x + ' video/tuần'))}
        ${kp('mom', 'Đà kênh 30 ngày', H.mom == null ? '–' : (H.mom >= 0 ? '▲ +' : '▼ ') + TTA.pct(H.mom, 0), H.mom, 'View trung vị video đăng 30 ngày gần nhất so với 30 ngày trước đó. ' + (H.mom == null ? 'Cần ≥ 3 video mỗi giai đoạn.' : ''))}
      </div></section>`;

  // ---- 3. Video hot ----
  const repeat = new Set(Object.values(list.reduce((g, v) => { const k = pillarOf.get(v.id) + '|' + fmtOf(v); (g[k] ||= []).push(v); return g; }, {}))
    .filter((vs) => vs.length >= 3 && TTA.median(vs.map((v) => v.views)) >= 1.5 * chMed).flat().map((v) => v.id));
  const now = Date.now() / 1000;
  // Bứt phá = view so với trung vị 10 video đăng gần nhất về thời gian (loại hiệu ứng video cũ tích luỹ view lâu hơn)
  const byTime = [...H.base].sort((a, b) => a.createTime - b.createTime);
  const boost = new Map(byTime.map((v, i) => {
    const near = byTime.slice(Math.max(0, i - 5), i).concat(byTime.slice(i + 1, i + 6)).map((x) => x.views);
    return [v.id, near.length >= 3 ? v.views / (TTA.median(near) || 1) : null];
  }));
  const hotList = CH.hot === 'ratio'
    ? [...H.base].filter((v) => boost.get(v.id) != null).sort((a, b) => boost.get(b.id) - boost.get(a.id)).slice(0, 10)
    : [...list].sort((a, b) => b.views - a.views).slice(0, 10);
  const badges = (v) => [v.pinned && '📌', v.products?.length && '🛒', v.photo && '📷', repeat.has(v.id) && '<span class="tag" title="Cùng tuyến và format với ≥ 3 video, trung vị ≥ 1,5× kênh">🔁 lặp lại được</span>'].filter(Boolean).join(' ');
  const hot = `
    <section class="card"><div class="tablehead"><h2>🔥 Video hot</h2>
      <div class="toolbar" style="margin:0"><button class="mini hotTab${CH.hot === 'views' ? ' primary' : ''}" data-h="views">Nhiều view nhất</button><button class="mini hotTab${CH.hot === 'ratio' ? ' primary' : ''}" data-h="ratio">Bứt phá nhất</button><button class="mini${CH.hotJob?.done ? ' primary' : ''}" id="hotCopyAll" title="Copy caption + lời thoại của cả 10 video"${CH.hotJob?.running ? ' disabled' : ''}>${CH.hotJob?.running ? `⏳ Lấy lời thoại ${CH.hotJob.i}/${CH.hotJob.n}…` : CH.hotJob?.done ? '📋 Đã lấy xong — bấm để copy' : '📋 Copy tất cả'}</button></div></div>
      <p class="muted small">${CH.hot === 'ratio' ? 'Video vượt xa các video đăng cùng giai đoạn (so với 10 video đăng gần nhất): thứ thuật toán đẩy mạnh, đáng học nhất.' : 'Video nhiều view nhất trong khoảng thời gian đang lọc.'} Cột “Bứt phá” = view so với trung vị 10 video đăng gần nhất. 📌 ghim · 🛒 gắn giỏ · 📷 ảnh lướt · 🔁 công thức đã lặp lại thành công.</p>
      ${tbl(['Video / câu mở đầu', 'Ngày', 'View', 'Bứt phá', 'Lưu', 'Share', 'Độ dài', 'Format', 'Tuyến'], hotList.map((v) => [
        `${vlink(v, TTA.hookText(v) || v.desc)} ${badges(v)} <button class="mini hotCopy" data-id="${v.id}" title="Copy toàn bộ caption + lời thoại của video này">📋</button>`, TTA.fmtDate(v.createTime) + (now - v.createTime < 3 * DAY ? ' <span class="tag">mới</span>' : ''),
        `<b>${TTA.fmt(v.views)}</b>`, boost.get(v.id) != null ? boost.get(v.id).toFixed(1) + '×' : '–', TTA.pct(rate(v, 'saves'), 2), TTA.pct(rate(v, 'shares'), 2),
        v.duration ? v.duration + 's' : '–', esc(fmtOf(v)), esc(pillarOf.get(v.id) || ''),
      ]))}</section>`;

  // ---- 4. Tuyến nội dung ----
  const QUAD = { core: ['🟢 Trụ cột', 'Làm nhiều, hiệu quả: giữ và làm series'], chance: ['🟡 Cơ hội', 'Làm ít nhưng view cao: nên làm thêm'], waste: ['🔴 Lãng phí', 'Làm nhiều nhưng view thấp: giảm hoặc đổi cách làm'], drop: ['⚪ Cân nhắc bỏ', 'Làm ít, view thấp'] };
  const real = pillars.filter((p) => p.quad);
  const quadBox = (q) => `<div class="quad ${q}"><b>${QUAD[q][0]}</b><div class="muted small">${QUAD[q][1]}</div>
    ${real.filter((p) => p.quad === q).map((p) => `<div class="small">${esc(p.name)} · ${p.n} video · ${p.ratio.toFixed(1)}×</div>`).join('') || '<div class="muted small">–</div>'}</div>`;
  const pillarSec = `
    <section class="card"><h2>🧱 Tuyến nội dung</h2>
      <p class="muted small">Gom theo hashtag chủ đề kênh hay dùng (bỏ hashtag chung như #fyp, #xuhuong); video không có hashtag chủ đề thì xếp theo format. “×” = view trung vị của tuyến so với trung vị cả kênh.</p>
      ${real.length >= 2 ? `<div class="quads">${['core', 'chance', 'waste', 'drop'].map(quadBox).join('')}</div>` : '<p class="muted small">Chưa đủ tuyến để xếp loại (cần ≥ 2 tuyến, mỗi tuyến ≥ 2 video).</p>'}
      ${tbl(['Tuyến', 'Số video', '% video', 'View trung vị', '× kênh', 'ER', 'Lưu', 'Video tốt nhất'], pillars.map((p) => [
        `<b>${esc(p.name)}</b>${p.quad ? ' ' + QUAD[p.quad][0].split(' ')[0] : ''}`, p.n, TTA.pct(p.share, 0), TTA.fmt(p.med), p.ratio.toFixed(1) + '×',
        TTA.pct(p.er, 1), TTA.pct(p.save, 2), vlink(p.best, TTA.hookText(p.best) || p.best.desc),
      ]))}</section>`;

  // ---- 5. Công thức nội dung ----
  const sorted = [...H.base].sort((a, b) => b.views - a.views);
  const nTop = Math.max(3, Math.round(sorted.length * 0.2));
  const top = sorted.slice(0, nTop), rest = sorted.slice(nTop);
  const hooks = groupStats(list, (v) => TTA.hookType(TTA.hookText(v)));
  const formats = groupStats(list, fmtOf);
  const capLen = (v) => (v.desc || '').replace(/#\S+/g, '').trim().length;
  const hourOf = (v) => new Date(v.createTime * 1000).getHours();
  const modeHour = (vs) => {
    const c = {};
    vs.forEach((v) => v.createTime && (c[hourOf(v)] = (c[hourOf(v)] || 0) + 1));
    const b = Object.entries(c).sort((a, b) => b[1] - a[1])[0];
    return b ? `${b[0]}h–${+b[0] + 1}h` : '–';
  };
  const hasCTA = (v) => CTA_RE.test(`${v.desc} ${v.transcript || ''}`);
  const isSeries = (v) => SERIES_RE.test(v.desc || '');
  const metrics = [
    ['Độ dài trung vị', (vs) => TTA.median(vs.map((v) => v.duration)), (x) => Math.round(x) + 's'],
    ['Có lời nói / phụ đề', (vs) => shareOf(vs, (v) => v.hasSpeech || v.transcript), (x) => TTA.pct(x, 0)],
    ['Dùng âm thanh gốc', (vs) => shareOf(vs, (v) => v.musicOriginal), (x) => TTA.pct(x, 0)],
    ['Ảnh lướt (photo)', (vs) => shareOf(vs, (v) => v.photo), (x) => TTA.pct(x, 0)],
    ['Hook dạng câu hỏi', (vs) => shareOf(vs, (v) => TTA.hookType(TTA.hookText(v)) === 'Câu hỏi'), (x) => TTA.pct(x, 0)],
    ['Có kêu gọi hành động', (vs) => shareOf(vs, hasCTA), (x) => TTA.pct(x, 0)],
    ['Series nhiều phần', (vs) => shareOf(vs, isSeries), (x) => TTA.pct(x, 0)],
    ['Gắn giỏ hàng', (vs) => shareOf(vs, (v) => v.products?.length), (x) => TTA.pct(x, 0)],
    ['Số hashtag trung vị', (vs) => TTA.median(vs.map((v) => v.hashtags.length)), (x) => x.toFixed(0)],
    ['Độ dài caption (ký tự)', (vs) => TTA.median(vs.map(capLen)), (x) => Math.round(x)],
  ];
  const formula = [];
  const diff = (f, yes, no) => {
    const a = shareOf(top, f), b = shareOf(rest, f);
    if (Math.abs(a - b) > 0.15) formula.push(`${TTA.pct(a, 0)} video top <b>${a > b ? yes : no}</b> (nhóm còn lại ${TTA.pct(b, 0)}).`);
  };
  const dT = TTA.median(top.map((v) => v.duration)), dR = TTA.median(rest.map((v) => v.duration));
  if (dT && dR && Math.abs(dT - dR) / dR > 0.2) formula.push(`Video top thường <b>${dT > dR ? 'dài' : 'ngắn'} hơn</b> (${Math.round(dT)}s so với ${Math.round(dR)}s).`);
  diff((v) => v.hasSpeech || v.transcript, 'có lời nói', 'không có lời nói');
  diff((v) => v.musicOriginal, 'dùng âm thanh gốc', 'dùng nhạc có sẵn / trend');
  diff(hasCTA, 'có kêu gọi hành động', 'không kêu gọi hành động');
  diff((v) => v.photo, 'là ảnh lướt', 'là video');
  const bestHook = hooks.find((h) => h.n >= 2 && h.name !== 'Khác' && h.name !== 'Không rõ');
  if (bestHook) formula.push(`Kiểu hook hiệu quả nhất: <b>${bestHook.name}</b> (trung vị ${TTA.fmt(bestHook.med)} view, gấp ${bestHook.ratio.toFixed(1)}× mức chung).`);
  const bestFmt = formats.find((f) => f.n >= 2 && f.name !== 'Khác');
  if (bestFmt) formula.push(`Format hiệu quả nhất: <b>${bestFmt.name}</b> (${bestFmt.n} video, gấp ${bestFmt.ratio.toFixed(1)}× mức chung).`);
  formula.push(`Giờ đăng hay gặp nhất ở nhóm video top: <b>${modeHour(top)}</b>.`);
  const slots = Object.entries(heatData(list)).filter(([, a]) => a.length >= 2)
    .map(([k, a]) => ({ k, n: a.length, m: TTA.median(a) })).sort((a, b) => b.m - a.m).slice(0, 5);
  const withTr = list.filter((v) => v.transcript).length;
  const recipe = `
    <section class="card insights"><h2>🧪 Công thức nội dung (top ${nTop} video so với phần còn lại)</h2>
      <p class="muted small">Đã có lời thoại ${withTr}/${list.length} video. Hook chính xác hơn khi có lời thoại (câu nói đầu video); chưa có thì dùng câu đầu của caption.
        <button id="trFetch" class="mini">Lấy lời thoại 20 video top chưa có</button> <span id="trInfo" class="muted small"></span></p>
      <ul>${formula.map((f) => `<li>${f}</li>`).join('')}</ul>
      ${tbl(['Chỉ số', `Top ${nTop} video`, 'Các video còn lại'], metrics.map(([l, f, fm]) => [l, `<b>${fm(f(top))}</b>`, fm(f(rest))]))}</section>
    <div class="grid2">
      <section class="card"><h2>🎣 Kiểu hook mở đầu</h2><p class="muted small">View trung vị theo kiểu câu mở đầu.</p>
        ${hbarsSVG(hooks.map((h) => ({ label: `${h.name} (${h.n})`, value: h.med, tip: `<b>${esc(h.name)}</b> · ${h.n} video<br>Trung vị ${TTA.fmt(h.med)} view (${h.ratio.toFixed(1)}×)<br>VD: ${esc(TTA.hookText(h.best).slice(0, 90))}` })))}</section>
      <section class="card"><h2>🎞 Format video</h2><p class="muted small">Phân loại theo từ khoá trong caption và lời thoại.</p>
        ${hbarsSVG(formats.map((f) => ({ label: `${f.name} (${f.n})`, value: f.med, tip: `<b>${esc(f.name)}</b> · ${f.n} video<br>Trung vị ${TTA.fmt(f.med)} view (${f.ratio.toFixed(1)}×)` })))}</section>
    </div>
    <div class="grid2">
      <section class="card"><h2>📅 Khung giờ đăng tốt nhất</h2><p class="muted small">View trung vị theo khung giờ (mỗi khung ≥ 2 video, giờ máy bạn).</p>
        ${tbl(['Khung giờ', 'Số video', 'View trung vị'], slots.map((s) => { const [d, h] = s.k.split('-').map(Number); return [`<b>${DAYS[d]}, ${h}h–${h + 1}h</b>`, s.n, TTA.fmt(s.m)]; }), 'Chưa đủ dữ liệu.')}</section>
      <section class="card"><div class="tablehead"><h2>🎤 Câu mở đầu của 10 video top</h2><button id="copyHooks" class="mini">Copy</button></div>
        ${tbl(['Câu mở đầu', 'Kiểu hook', 'View'], sorted.slice(0, 10).map((v) => [vlink(v, TTA.hookText(v) || '(trống)'), TTA.hookType(TTA.hookText(v)), TTA.fmt(v.views)]))}</section>
    </div>`;

  // ---- 6. Việc nên làm ----
  const acts = [];
  const chance = real.filter((p) => p.quad === 'chance').sort((a, b) => b.ratio - a.ratio)[0];
  if (chance) acts.push(`<b>Làm thêm tuyến ${esc(chance.name)}</b>: mới ${chance.n} video (${TTA.pct(chance.share, 0)}) nhưng view trung vị gấp ${chance.ratio.toFixed(1)}× kênh. Học từ ${vlink(chance.best, 'video tốt nhất')}.`);
  const waste = real.filter((p) => p.quad === 'waste').sort((a, b) => b.share - a.share)[0];
  if (waste) acts.push(`<b>Giảm hoặc đổi cách làm tuyến ${esc(waste.name)}</b>: chiếm ${TTA.pct(waste.share, 0)} số video nhưng chỉ đạt ${waste.ratio.toFixed(1)}× trung vị kênh.`);
  const coreP = real.filter((p) => p.quad === 'core').sort((a, b) => b.ratio - a.ratio)[0];
  if (coreP) acts.push(`<b>Giữ trụ cột ${esc(coreP.name)}</b> (${coreP.ratio.toFixed(1)}×) và biến video tốt nhất thành series nhiều phần.`);
  if (bestHook && bestHook.ratio >= 1.2) acts.push(`<b>Mở đầu bằng kiểu “${bestHook.name}”</b>: view trung vị gấp ${bestHook.ratio.toFixed(1)}× mức chung. VD: “${esc(TTA.hookText(bestHook.best).slice(0, 90))}”.`);
  const bestDur = durs[0]; // groupStats đã xếp theo view trung vị giảm dần
  if (bestDur && bestDur.ratio >= 1.2) acts.push(`<b>Ưu tiên độ dài ${bestDur.name}</b>: ${bestDur.n} video, view trung vị gấp ${bestDur.ratio.toFixed(1)}×.`);
  if (slots[0]) { const [d, h] = slots[0].k.split('-').map(Number); acts.push(`<b>Đăng vào ${DAYS[d]}, ${h}h–${h + 1}h</b>: khung giờ có view trung vị cao nhất (${TTA.fmt(slots[0].m)}).`); }
  if (grade('save', H.save) === 'bad') acts.push('<b>Tăng giá trị để người xem lưu lại</b>: tỉ lệ lưu thấp. Thêm mẹo, checklist, công thức, “lưu lại để làm theo”.');
  if (grade('share', H.share) === 'bad') acts.push('<b>Làm nội dung đáng gửi cho bạn bè</b>: tỉ lệ share thấp. Thử chủ đề đồng cảm, gây tranh luận nhẹ, “tag người cần xem”.');
  if (grade('freq', H.freq) === 'bad') acts.push(`<b>Đăng đều hơn</b>: mới ${H.freq.toFixed(1)} video/tuần trong 30 ngày qua. Nên ≥ 3–5 video/tuần để thuật toán có đủ dữ liệu.`);
  if (H.mom != null && H.mom < -0.2) acts.push(`<b>Kênh đang chững lại</b>: view trung vị 30 ngày gần nhất giảm ${TTA.pct(-H.mom, 0)}. Xem lại tuyến/format đã thay đổi gần đây so với giai đoạn trước.`);
  const allVids = state.videos.filter((v) => v.author === author);
  const money = channelMoney(list, u, state.comments);
  const audience = channelAudience(list, state.comments, author);
  const cadence = channelCadence(list);
  const evolution = channelEvolution(allVids, u);
  const persp = state.myChannel && (state.myChannel === author || others.includes(state.myChannel)) ? state.myChannel : author;
  const compare = others.length ? channelCompare(author, others, persp) : null;
  acts.push(...(compare?.acts || []), ...audience.acts, ...money.acts, ...cadence.acts, ...evolution.acts);
  const actions = `
    <section class="card insights actions"><div class="tablehead"><h2>✅ Việc nên làm</h2><button id="copyActs" class="mini">Copy</button></div>
      <ol>${acts.slice(0, 9).map((a) => `<li>${a}</li>`).join('') || '<li>Chưa đủ dữ liệu để gợi ý. Thu thập thêm video.</li>'}</ol>
      <p class="muted small">Gợi ý tự sinh từ dữ liệu công khai (view, tương tác, caption, lời thoại). TikTok không công khai thời gian xem, tỉ lệ xem hết và nhân khẩu học người xem.</p></section>`;

  // ---- 📋 Brief: toàn bộ phân tích dạng chữ để dán sang ChatGPT / Claude ----
  const compareSec = compare ? compare.html : `<section class="card"><h2>⚔️ So sánh với đối thủ</h2><p class="muted small">Chọn 1–3 kênh ở dòng “So sánh với” phía trên (dán link kênh đối thủ và bấm Phân tích nếu chưa có), hoặc bấm ☆ trên thẻ kênh của bạn. Báo cáo sẽ so sánh chỉ số và tìm khoảng trống nội dung: chủ đề, format, kiểu hook đối thủ làm tốt mà bạn chưa làm.</p></section>`;
  const buildBrief = (goal) => {
    const [goalName, asks] = BRIEF_GOALS[goal] || BRIEF_GOALS.plan;
    const setup = BRIEF_SETUP[goal] || BRIEF_SETUP.plan;
    const sec = (title, lines) => (lines?.length ? `\n## ${title}\n${lines.map((l) => '- ' + l).join('\n')}\n` : '');
    const top10 = [...list].sort((a, b) => b.views - a.views).slice(0, 10);
    const vline = (v, i) => `${i + 1}. “${(TTA.hookText(v) || v.desc).replace(/\s+/g, ' ').slice(0, 110)}” — ${TTA.fmt(v.views)} view${boost.get(v.id) != null ? `, ${boost.get(v.id).toFixed(1)}× video cùng giai đoạn` : ''}, ${v.duration || '?'}s, ${fmtOf(v)}, tuyến ${pillarOf.get(v.id) || '–'}, lưu ${TTA.pct(rate(v, 'saves'), 2)}, share ${TTA.pct(rate(v, 'shares'), 2)}${v.products?.length ? ', gắn giỏ' : ''}.`;
    const SECS = {
      info: () => sec('Thông tin kênh', [
        `${u?.nickname || author} (@${author})${u ? `: ${TTA.fmt(u.followers)} follower, ${TTA.fmt(u.hearts)} tim, ${TTA.fmt(u.videoCount)} video` : ''}${u?.signature ? `. Bio: ${u.signature.replace(/\s+/g, ' ')}` : ''}${u?.bioLink ? `. Link bio: ${u.bioLink}` : ''}${u?.seller ? '. Là người bán TikTok Shop' : ''}.`,
        stripTags(portrait),
      ]),
      health: () => sec('Sức khoẻ kênh', [
        `View trung vị/video ${TTA.fmt(H.med)}; view trung vị/follower ${H.vf == null ? '–' : TTA.pct(H.vf, 0)}; ER ${TTA.pct(H.er, 1)}; tỉ lệ lưu ${TTA.pct(H.save, 2)}; tỉ lệ share ${TTA.pct(H.share, 2)}; ${H.cpk.toFixed(1)} bình luận/1.000 view.`,
        `Tỉ lệ video vượt 2× trung vị: ${TTA.pct(H.hit, 0)}; tần suất 30 ngày: ${H.freq.toFixed(1)} video/tuần; đà 30 ngày: ${H.mom == null ? 'chưa đủ dữ liệu' : (H.mom >= 0 ? '+' : '') + TTA.pct(H.mom, 0)}.`,
      ]),
      pillars: () => sec('Tuyến nội dung (× = view trung vị của tuyến so với cả kênh)', pillars.map((p) => `${p.name}: ${p.n} video (${TTA.pct(p.share, 0)}), view trung vị ${TTA.fmt(p.med)} (${p.ratio.toFixed(1)}×), lưu ${TTA.pct(p.save, 2)}${p.quad ? ' — ' + QUAD[p.quad][0].replace(/^\S+\s/, '') : ''}.`)),
      top10: () => sec('10 video nhiều view nhất', top10.map(vline)),
      // Viết kịch bản: kèm caption và lời thoại đầy đủ của 5 video top để AI học giọng văn
      top10full: () => sec('10 video nhiều view nhất', top10.map(vline)) + sec('Caption và lời thoại của 5 video top (để học cách nói)', top10.slice(0, 5).map((v, i) =>
        `Video ${i + 1}: Caption: ${(v.desc || '–').replace(/\s+/g, ' ').slice(0, 300)}${v.transcript ? ` | Lời thoại: ${v.transcript.replace(/\s+/g, ' ').slice(0, 900)}` : ' | (chưa có lời thoại)'}`)),
      formula: () => sec(`Công thức (top ${nTop} video so với phần còn lại)`, [...formula.map(stripTags), ...metrics.map(([l, f, fm]) => `${l}: top ${fm(f(top))}, còn lại ${fm(f(rest))}`)]),
      money: () => sec('Kiếm tiền', money.brief),
      audience: () => sec('Khán giả (suy luận từ bình luận)', audience.brief),
      cadence: () => sec('Nhịp đăng', [...cadence.brief, ...(slots[0] ? [`Khung giờ tốt nhất: ${slots.slice(0, 3).map((s) => { const [d, h] = s.k.split('-').map(Number); return `${DAYS[d]} ${h}h (${TTA.fmt(s.m)})`; }).join(', ')}.`] : [])]),
      evolution: () => sec('Kênh thay đổi theo thời gian', evolution.brief),
      compare: () => (compare?.brief?.length ? sec('So sánh với đối thủ và khoảng trống nội dung', compare.brief)
        : goal === 'rival' ? '\n## So sánh với đối thủ\n- (Chưa chọn kênh đối thủ trong tiện ích: hãy chọn ở dòng “So sánh với” rồi copy lại brief để có số liệu so sánh.)\n' : ''),
      acts: () => sec('Gợi ý tự sinh từ dữ liệu', acts.slice(0, 9).map(stripTags)),
    };
    return [
      `Bạn là ${setup.role}.`,
      `# Mục tiêu: ${goalName}`,
      `## Nhiệm vụ\n${asks.map((x, i) => `${i + 1}. ${x}`).join('\n')}`,
      `\n## Dữ liệu\nDưới đây là dữ liệu kênh @${author}${author === state.myChannel ? ' (kênh của tôi)' : ''}, do tiện ích Viral Finder thu thập từ dữ liệu công khai ngày ${new Date().toLocaleDateString('vi-VN')}, dựa trên ${list.length} video (${rangeLabel}). Số liệu dùng trung vị. TikTok không công khai thời gian xem, tỉ lệ xem hết và nhân khẩu học người xem; phần khán giả là suy luận từ bình luận.`,
      ...setup.secs.map((k) => SECS[k]()),
      `\n## Lưu ý khi trả lời\nChỉ dựa trên dữ liệu ở trên; chỗ nào là suy đoán thì ghi rõ. Trả lời bằng tiếng Việt, ngắn gọn, dễ làm theo.`,
    ].join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };
  const briefSec = !LIM().brief ? `<section class="card"><b>📋 Brief cho ChatGPT / Claude</b> <span class="muted small">· toàn bộ phân tích dạng chữ để xin ý tưởng và kịch bản</span>
      <p class="muted small">🔒 Có trong gói Pro. Gói Miễn phí vẫn dùng được nút ✨ trên cột phân tích ở trang kênh TikTok (3 lần / ngày).</p><button class="primary toAcc">⭐ Nâng cấp Pro</button></section>` : `
    <details class="card" id="briefBox"${CH.briefOpen ? ' open' : ''}><summary><b>📋 Brief cho ChatGPT / Claude</b> <span class="muted small">· toàn bộ phân tích dạng chữ, dán vào AI để xin ý tưởng và kịch bản</span></summary>
      <div class="toolbar"><label class="small">Mục tiêu <select id="briefGoal">${Object.entries(BRIEF_GOALS).map(([k, [n]]) => `<option value="${k}"${k === (CH.briefGoal || 'plan') ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <button id="briefCopy" class="primary">Copy brief</button>
        <a class="btn" href="https://chatgpt.com/" target="_blank" rel="noopener">Mở ChatGPT ↗</a>
        <a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">Mở Claude ↗</a>
        <span class="muted small" id="briefInfo"></span></div>
      <textarea id="briefText" class="brief" spellcheck="false">${esc(buildBrief(CH.briefGoal || 'plan'))}</textarea>
      <p class="muted small">Bạn có thể sửa brief trước khi copy. ${compare ? '' : 'Chọn đối thủ ở dòng “So sánh với” để brief có thêm phần so sánh và khoảng trống nội dung.'}</p>
    </details>`;

  el.innerHTML = head + card + actions + briefSec + health + hot + pillarSec + compareSec + recipe + money.html + audience.html + cadence.html + evolution.html + channelVerify(list, state.fieldStats);
  bindHead();
  $('#chMine').onclick = () => chrome.storage.local.set({ myChannel: state.myChannel === author ? '' : author });
  if (LIM().brief) {
    $('#briefBox').ontoggle = (e) => (CH.briefOpen = e.target.open);
    $('#briefGoal').onchange = (e) => {
      CH.briefGoal = e.target.value;
      const t = $('#briefText');
      t.value = buildBrief(CH.briefGoal);
      t.scrollTop = 0;
      t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
      briefLen();
      $('#briefInfo').textContent += ` · đã đổi sang “${BRIEF_GOALS[CH.briefGoal][0]}”`;
    };
    const briefLen = () => ($('#briefInfo').textContent = `${$('#briefText').value.length.toLocaleString('vi-VN')} ký tự`);
    briefLen();
    $('#briefText').oninput = briefLen;
    $('#briefCopy').onclick = (e) => navigator.clipboard.writeText($('#briefText').value).then(() => (e.target.textContent = '✓ Đã copy'));
  }
  audience.bind?.();
  el.querySelectorAll('.toAcc').forEach((x) => (x.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: Auth.accountUrl() }); }));
  cadence.after?.();
  if ($('#chFields')) $('#chFields').onclick = (e) => navigator.clipboard.writeText(JSON.stringify(state.fieldStats, null, 1)).then(() => (e.target.textContent = '✓ Đã copy'));
  el.querySelectorAll('.hotTab').forEach((b) => (b.onclick = () => { CH.hot = b.dataset.h; render(); }));
  // 📋 Copy toàn bộ nội dung video hot (caption + lời thoại đầy đủ). Video chưa có lời thoại → lấy trước, bấm lần 2 để copy.
  // Đã thử lấy lời thoại: có trường transcript (kể cả rỗng = video không có lời) hoặc vừa thử trong phiên này
  const tried = (v) => !!v.trTried || typeof v.transcript === 'string' || (CH.trTried ||= new Set()).has(v.id);
  const trOf = (v) => v.transcript || CH.trText?.[v.id] || '';
  const fullText = (v) => [`🎬 ${vurl(v)} — ${TTA.fmt(v.views)} view`, `Caption: ${(v.desc || '').trim() || '–'}`,
    `Lời thoại: ${trOf(v) ? trOf(v).trim() : tried(v) ? '(video không có lời thoại / phụ đề)' : '(chưa lấy)'}`].join('\n');
  const vById = new Map(hotList.map((v) => [v.id, v]));
  const fetchTr = async (v) => {
    if (v.transcript || tried(v)) return;
    const r = await chrome.runtime.sendMessage({ type: 'getOriginal', author: v.author, id: v.id }).catch(() => null);
    v.trTried = true;
    (CH.trTried ||= new Set()).add(v.id); // nhớ qua các lần Dashboard vẽ lại
    if (r?.ok && r.result?.transcript) { v.transcript = r.result.transcript; (CH.trText ||= {})[v.id] = r.result.transcript; }
  };
  const copyOut = (btn, text, label) => navigator.clipboard.writeText(text).then(() => { btn.textContent = '✓'; setTimeout(() => (btn.textContent = label), 1500); })
    .catch(() => { btn.textContent = label; alert('Trình duyệt chặn copy. Bấm lại nút một lần nữa.'); });
  el.querySelectorAll('.hotCopy').forEach((b) => (b.onclick = async () => {
    const v = vById.get(b.dataset.id);
    if (!trOf(v) && !tried(v)) { b.textContent = '⏳'; b.disabled = true; await fetchTr(v); b.disabled = false; b.textContent = '📋'; b.title = 'Đã lấy lời thoại — bấm để copy'; b.classList.add('primary'); return; }
    copyOut(b, fullText(v), '📋');
  }));
  // Tiến trình lấy lời thoại lưu ở CH.hotJob để không mất khi Dashboard vẽ lại (mỗi lời thoại lưu xong là vẽ lại)
  $('#hotCopyAll').onclick = async (e) => {
    if (!LIM().bulkTranscript && hotList.some((v) => !trOf(v) && !tried(v))) return upgrade('Lấy lời thoại hàng loạt');
    const b = e.target, todo = hotList.filter((v) => !v.transcript && !tried(v));
    if (todo.length && !CH.hotJob?.done) {
      CH.hotJob = { running: true, i: 0, n: todo.length };
      for (let i = 0; i < todo.length; i++) {
        CH.hotJob.i = i + 1;
        const cur = $('#hotCopyAll'); if (cur) { cur.disabled = true; cur.textContent = `⏳ Lấy lời thoại ${i + 1}/${todo.length}…`; }
        if (i) await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500));
        await fetchTr(todo[i]);
      }
      CH.hotJob = { done: true };
      const cur = $('#hotCopyAll'); if (cur) { cur.disabled = false; cur.textContent = '📋 Đã lấy xong — bấm để copy'; cur.classList.add('primary'); }
      return;
    }
    CH.hotJob = null;
    copyOut(b, hotList.map((v, i) => `${i + 1}. ${fullText(v)}`).join('\n\n'), '📋 Copy tất cả');
  };
  const plain = (html) => { const d = document.createElement('div'); d.innerHTML = html; return d.textContent; };
  $('#copyActs').onclick = (e) => navigator.clipboard.writeText(`Phân tích kênh @${author}\n${plain(portrait)}\n\nViệc nên làm:\n` + acts.slice(0, 9).map((a, i) => `${i + 1}. ${plain(a)}`).join('\n')).then(() => (e.target.textContent = '✓ Đã copy'));
  $('#copyHooks').onclick = (e) => navigator.clipboard.writeText(sorted.slice(0, 10).map((v) => `${TTA.hookText(v)} — ${TTA.fmt(v.views)} view`).join('\n')).then(() => (e.target.textContent = '✓ Đã copy'));
  $('#trFetch').onclick = async (e) => {
    if (!LIM().bulkTranscript) return upgrade('Lấy lời thoại hàng loạt');
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
const KW = { kw: '', range: '0', from: '', to: '', sort: 'views', min: 0, cart: '', view: 'grid', limit: 60 };
PANES.keyword = () => {
  const el = $('#paneKeyword');
  const job = state.kwJob;
  // đang gõ từ khoá → chỉ cập nhật dòng tiến trình, không vẽ lại cả tab
  if (document.activeElement?.id === 'kwInput') { if (job && $('#kwJob')) $('#kwJob').textContent = job.msg; return; }
  const counts = {};
  state.videos.forEach((v) => (v.kw || []).forEach((k) => (counts[k] = (counts[k] || 0) + 1)));
  const kws = [...new Set([...Object.keys(state.keywords), ...Object.keys(counts)])]
    .sort((a, b) => (state.keywords[b]?.last || 0) - (state.keywords[a]?.last || 0));
  const fromHash = TTA.kwKey(decodeURIComponent((location.hash.match(/[?&]kw=([^&]*)/) || [])[1] || ''));
  if (fromHash && fromHash !== KW.hashKw) { KW.hashKw = fromHash; KW.kw = fromHash; KW.limit = 60; }
  if (!KW.kw || !kws.includes(KW.kw)) KW.kw = kws[0] || '';

  const now = Date.now() / 1000;
  let since = 0, until = Infinity;
  if (KW.range === 'custom') {
    if (KW.from) since = new Date(KW.from + 'T00:00:00').getTime() / 1000;
    if (KW.to) until = new Date(KW.to + 'T23:59:59').getTime() / 1000;
  } else if (Number(KW.range)) since = now - Number(KW.range) * 86400;
  const K = TTA.trendKit(state.videos, state.users, now);
  const { perDay, breakout, isTrend, growth24, score } = K;
  const ratio = K.channelRatio;
  const SORT = { views: (v) => v.views, perDay, er: TTA.er, likes: (v) => v.likes, new: (v) => v.createTime, ratio: (v) => ratio(v) ?? 0,
    trend: (v) => (breakout(v) ?? 0) * 1e6 + perDay(v) / 1e6, score, growth: (v) => growth24(v) ?? -1 };

  const all = KW.kw ? state.videos.filter((v) => v.kw?.includes(KW.kw)) : [];
  const res = all.filter((v) => v.createTime >= since && v.createTime <= until && v.views >= KW.min &&
    (!KW.cart || (KW.cart === 'yes' ? v.products?.length : !v.products?.length)) &&
    (KW.sort !== 'trend' || isTrend(v)))
    .sort((a, b) => SORT[KW.sort](b) - SORT[KW.sort](a));
  state.kwResult = res;

  const chans = groupStats(res, (v) => v.author).map((g) => ({ ...g, total: g.vs.reduce((a, v) => a + v.views, 0) })).sort((a, b) => b.total - a.total);
  const tags = {};
  res.forEach((v) => (v.hashtags || []).forEach((h) => (tags[h] ||= []).push(v.views)));
  const tagRows = Object.entries(tags).filter(([, x]) => x.length >= 2).map(([h, x]) => ({ label: '#' + h, value: TTA.median(x), tip: `<b>#${esc(h)}</b><br>${x.length} video · view trung vị ${TTA.fmt(TTA.median(x))}` }))
    .sort((a, b) => b.value - a.value).slice(0, 12);
  // Nhóm video xu hướng để rút ra công thức (nếu ít thì lấy 20% điểm cao nhất)
  const byScore = [...res].sort((a, b) => score(b) - score(a));
  let trendSet = res.filter(isTrend);
  if (trendSet.length < 3) trendSet = byScore.slice(0, Math.max(3, Math.round(res.length * 0.2)));
  const restSet = res.filter((v) => !trendSet.includes(v));
  const top = (arr, n = 3) => Object.entries(arr.reduce((m, x) => (x && (m[x] = (m[x] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).slice(0, n);
  const share = (vs, f) => (vs.length ? vs.filter(f).length / vs.length : 0);
  const hourOf = (v) => new Date(v.createTime * 1000).getHours();
  const formula = res.length >= 5 ? (() => {
    const hooks = top(trendSet.map((v) => TTA.hookType(TTA.hookText(v))).filter((h) => !/^khác/i.test(h)));
    const hours = top(trendSet.map(hourOf), 2);
    const music = top(trendSet.filter((v) => v.music && !v.musicOriginal).map((v) => v.music), 3);
    const tg = top(trendSet.flatMap((v) => v.hashtags || []), 6);
    const durT = TTA.median(trendSet.map((v) => v.duration)), durR = TTA.median(restSet.map((v) => v.duration));
    const spT = share(trendSet, (v) => v.hasSpeech || v.transcript), spR = share(restSet, (v) => v.hasSpeech || v.transcript);
    const orgT = share(trendSet, (v) => v.musicOriginal);
    const ssT = TTA.median(trendSet.map((v) => (v.shares + v.saves) / (v.views || 1))), ssR = TTA.median(restSet.map((v) => (v.shares + v.saves) / (v.views || 1)));
    return [
      `Nhóm xu hướng: <b>${trendSet.length}</b> video${res.filter(isTrend).length >= 3 ? ' (bứt phá ≥ 2× & ER > 2%)' : ' (20% điểm xu hướng cao nhất, vì chưa đủ 3 video đạt tiêu chí)'}.`,
      hooks.length ? `Kiểu mở đầu hay gặp: ${hooks.map(([h, n]) => `<b>${esc(h)}</b> (${n})`).join(', ')}.` : '',
      durT ? `Độ dài trung vị <b>${Math.round(durT)}s</b>${durR ? ` (nhóm còn lại ${Math.round(durR)}s)` : ''}.` : '',
      `Có lời nói / phụ đề: <b>${TTA.pct(spT, 0)}</b>${restSet.length ? ` (còn lại ${TTA.pct(spR, 0)})` : ''} · dùng âm thanh gốc: <b>${TTA.pct(orgT, 0)}</b>.`,
      restSet.length ? `Tỉ lệ share + lưu: <b>${TTA.pct(ssT, 2)}</b> so với ${TTA.pct(ssR, 2)} ở nhóm còn lại${ssT > ssR * 1.2 ? ' — nội dung hữu ích, đáng lưu được đẩy mạnh hơn' : ''}.` : '',
      hours.length ? `Giờ đăng hay gặp: ${hours.map(([h]) => `<b>${h}h–${+h + 1}h</b>`).join(', ')}.` : '',
      music.length ? `Âm thanh được dùng lại: ${music.map(([m, n]) => `${esc(m.slice(0, 40))} (${n})`).join(' · ')}.` : '',
      tg.length ? `Hashtag hay đi kèm: ${tg.map(([t]) => '#' + esc(t)).join(' ')}.` : '',
    ].filter(Boolean);
  })() : [];
  // Từ khoá liên quan: hashtag xuất hiện nhiều (≥ 2 video) và chưa quét
  const kwNoSpace = KW.kw.replace(/\s+/g, '');
  const related = Object.entries(tags).filter(([h, x]) => x.length >= 2 && x.length < res.length * 0.8 && h !== kwNoSpace && !kws.includes(h) && !/^(fyp|foryou|xuhuong|viral|trending|tiktok|xh|fypシ)/i.test(h))
    .map(([h, x]) => ({ h, n: x.length, m: TTA.median(x) })).sort((a, b) => b.n * Math.log10(10 + b.m) - a.n * Math.log10(10 + a.m)).slice(0, 12);
  const watched = (state.kwWatch || []).includes(KW.kw);
  const trTop = byScore.slice(0, 10);
  const withTr = trTop.filter((v) => v.transcript || v.hookLine);
  const opt = (v, l, cur) => `<option value="${v}"${String(cur) === String(v) ? ' selected' : ''}>${l}</option>`;
  const badge = (v) => {
    const r = breakout(v), tr = isTrend(v) ? '<span class="tag">📈 Xu hướng</span>' : '';
    if (r == null || r < 2) return tr;
    const t = ratio(v) != null ? 'so với view trung vị của kênh' : 'so với số follower của kênh';
    return `<span class="tag" title="Gấp ${r.toFixed(1)} lần ${t}">${r >= 3 ? '🔥' : '⚡'} ${r.toFixed(1)}×</span> ` + tr;
  };

  el.innerHTML = `
    <section class="card"><h2>🔎 Tìm video nhiều view theo từ khoá</h2>
      <div class="toolbar"><input id="kwInput" type="search" placeholder="vd: bất động sản, review son, mẹo nấu ăn" style="flex:1;min-width:260px" value="${esc(KW.input || '')}">
        <select id="kwDepth">${[[10, 'Nhanh (~100 video)'], [25, 'Vừa (~250 video)'], [50, 'Sâu (~500 video)'], [100, 'Rất sâu (~1000 video)']].map(([v, l]) => `<option value="${v}"${v > LIM().maxDepth ? ' disabled' : ''}${v === Math.min(25, LIM().maxDepth) ? ' selected' : ''}>${v > LIM().maxDepth ? '🔒 ' : ''}${l}${v > LIM().maxDepth ? ' – Pro' : ''}</option>`).join('')}</select>
        <button id="kwGo" class="primary">Tìm & thu thập</button></div>
      <p class="muted small" id="kwJob">${job ? esc(job.msg) + (job.step === 'run' ? ' (đừng đóng Chrome)' : '') + (job.locked ? ' <a href="#" class="toAcc">Mở trang Tài khoản →</a>' : '') : 'Tiện ích mở trang tìm kiếm video của TikTok trong một cửa sổ nhỏ, tự cuộn lấy kết quả rồi tự đóng. Để cửa sổ đó mở (đừng thu nhỏ) tới khi xong. Cần đang đăng nhập tiktok.com. Quét nhiều lần sẽ cộng dồn thêm video.'}</p>
      <p class="muted small">Cách thủ công: tự tìm từ khoá trên tiktok.com (tab Video) rồi bấm “Tự cuộn để thu thập” — kết quả cũng tự vào đây. Quét lại vài ngày một lần để có video mới.</p>
      ${kws.length ? `<div class="toolbar">${kws.map((k) => `<button class="kwChip${k === KW.kw ? ' primary' : ''}" data-kw="${esc(k)}">${esc(k)} · ${counts[k] || 0}<span class="kwX" data-del="${esc(k)}" title="Xoá từ khoá này">×</span></button>`).join('')}</div>` : ''}
    </section>
    ${!KW.kw ? '<section class="card"><p>Chưa có từ khoá nào. Nhập từ khoá ở trên rồi bấm “Tìm & thu thập”.</p></section>' : `
    <section class="card"><div class="toolbar">
      <label class="small">Thời gian đăng <select id="kwRange">${[['1', '24 giờ qua'], ['7', '7 ngày'], ['30', '30 ngày'], ['90', '3 tháng'], ['180', '6 tháng'], ['365', '12 tháng'], ['0', 'Toàn bộ'], ['custom', 'Tự chọn ngày…']].map(([v, l]) => opt(v, l, KW.range)).join('')}</select></label>
      ${KW.range === 'custom' ? `<label class="small">Từ <input id="kwFrom" type="date" value="${KW.from}"></label><label class="small">Đến <input id="kwTo" type="date" value="${KW.to}"></label>` : ''}
      <label class="small">Sắp xếp <select id="kwSort">${[['views', 'Nhiều view nhất'], ['score', '🧠 Điểm xu hướng (0–100)'], ['growth', '🚀 Tăng view nhanh 24h (từ lần quét trước)'], ['trend', '📈 Video xu hướng (bứt phá ≥ 2× & ER > 2%)'], ['perDay', 'View / ngày (đang lên)'], ['ratio', 'Bứt phá so với kênh'], ['er', 'Tương tác (ER)'], ['likes', 'Nhiều tim nhất'], ['new', 'Mới nhất']].map(([v, l]) => opt(v, l, KW.sort)).join('')}</select></label>
      <label class="small">View tối thiểu <select id="kwMin">${[[0, 'Tất cả'], [10000, '10K'], [100000, '100K'], [500000, '500K'], [1000000, '1 triệu']].map(([v, l]) => opt(v, l, KW.min)).join('')}</select></label>
      <label class="small">Gắn giỏ <select id="kwCart">${[['', 'Tất cả'], ['yes', 'Chỉ video gắn giỏ'], ['no', 'Không gắn giỏ']].map(([v, l]) => opt(v, l, KW.cart)).join('')}</select></label>
      <button id="kwCsv">${LIM().csv ? '' : '🔒 '}Xuất CSV</button><button id="kwDel" title="Xoá nhãn từ khoá này (video vẫn giữ)">Xoá từ khoá</button>
    </div>
    <div class="toolbar"><button id="kwWatch" class="${watched ? 'primary' : ''}">${watched ? '★ Đang theo dõi hằng ngày (bấm để bỏ)' : '⭐ Theo dõi từ khoá này hằng ngày'}</button>
      <label class="small">Tự quét lúc <select id="kwHour">${Array.from({ length: 24 }, (_, h) => opt(h, h + 'h', state.kwSettings.hour ?? 7)).join('')}</select> mỗi ngày</label>
      ${(state.kwWatch || []).length ? '<button id="kwRunW">▶ Quét ngay các từ khoá theo dõi</button>' : ''}
      <span class="muted small">${(state.kwWatch || []).length ? `Đang theo dõi: ${state.kwWatch.map(esc).join(', ')}. Tự quét và báo khi có video xu hướng mới (máy cần bật Chrome).` : 'Tiện ích sẽ tự quét các từ khoá theo dõi mỗi ngày và hiện thông báo khi có video xu hướng mới.'}</span></div></section>
    ${kpiRow([['Video phù hợp', `${res.length} / ${all.length}`], ['Tổng lượt xem', TTA.fmt(res.reduce((a, v) => a + v.views, 0))], ['View trung vị', TTA.fmt(TTA.median(res.map((v) => v.views)))],
      ['ER trung vị', TTA.pct(TTA.median(res.filter((v) => v.views).map(TTA.er)))], ['Số kênh', chans.length], ['Video gắn giỏ', res.filter((v) => v.products?.length).length]])}
    ${formula.length ? `<section class="card insights"><h2>💡 Công thức video xu hướng — "${esc(KW.kw)}"</h2><ul>${formula.map((x) => `<li>${x}</li>`).join('')}</ul></section>` : ''}
    ${related.length ? `<section class="card"><h2>🔗 Từ khoá liên quan nên quét tiếp</h2><p class="muted small">Hashtag hay đi kèm trong kết quả (số video · view trung vị), bỏ qua hashtag chung chung như #fyp, #xuhuong và hashtag gần như trùng từ khoá. Bấm để quét luôn.</p>
      <div class="toolbar">${related.map((r) => `<button class="kwRel" data-q="${esc(r.h)}">🔎 ${esc(r.h)} <span class="muted">· ${r.n} · ${TTA.fmt(r.m)}</span></button>`).join('')}</div></section>` : ''}
    <section class="card"><div class="tablehead"><h2>🏆 Video nhiều view — "${esc(KW.kw)}"</h2>
        <div class="toolbar" style="margin:0"><button id="kwGrid" class="${KW.view === 'grid' ? 'primary' : ''}">▦ Thẻ video</button><button id="kwTable" class="${KW.view === 'table' ? 'primary' : ''}">☰ Bảng</button></div></div>
      <p class="muted small">Bấm vào video để xem ngay tại đây. View/ngày = lượt xem chia số ngày từ lúc đăng (video mới mà cao là đang lên). 🔥/⚡ = gấp ≥3×/≥2× view trung vị của kênh (khi đã có ≥ 5 video của kênh), nếu chưa đủ thì so với số follower của kênh. 📈 Xu hướng = bứt phá ≥ 2× và ER > 2%. 🧠 Điểm xu hướng 0–100 gộp: bứt phá 35%, view tăng/ngày 20%, ER 20%, tỉ lệ share + lưu 15%, độ mới 10%. 🚀 = view tăng thật trong 24h, có từ lần quét thứ hai (bật “Theo dõi hằng ngày” để có số này).</p>
      ${!res.length ? '<p class="muted">Không có video nào trong khoảng thời gian / bộ lọc này. Thử chọn “Toàn bộ” hoặc quét sâu hơn.</p>' : KW.view === 'grid' ? `<div class="vgrid">${res.slice(0, Math.min(KW.limit, LIM().kwRows)).map((v, i) => `
        <div class="vcard" data-play="${v.id}" data-author="${esc(v.author)}">
          <div class="vcover">${v.cover ? `<img loading="lazy" src="${esc(v.cover)}" alt="">` : ''}<span class="vrank">#${i + 1}</span><span class="vviews">▶ ${TTA.fmt(v.views)}</span>${v.products?.length ? '<span class="vcart">🛒</span>' : ''}</div>
          <div class="vbody"><div class="vdesc">${esc((v.desc || '').slice(0, 110))}</div>
            <div class="vmeta">@${esc(v.author)} · ${TTA.fmtDate(v.createTime)}</div>
            <div class="vmeta">${TTA.fmt(perDay(v))} view/ngày · ER ${TTA.pct(TTA.er(v))} ${badge(v)}</div>
            <div class="vmeta"><b class="score" title="Điểm xu hướng 0–100">🧠 ${score(v)}</b>${growth24(v) != null ? ` · 🚀 +${TTA.fmt(growth24(v))} view/24h` : ''}</div></div>
        </div>`).join('')}</div>
        ${res.length > LIM().kwRows ? `<div class="card lockcard">🔒 Gói Miễn phí xem được ${LIM().kwRows} video đầu. Còn <b>${res.length - LIM().kwRows}</b> video nữa — <button class="primary toAcc">⭐ Nâng cấp Pro để xem tất cả</button></div>` : ''}
        ${res.length > KW.limit && LIM().kwRows > KW.limit ? `<div class="toolbar" style="justify-content:center"><button id="kwMore">Xem thêm (${res.length - KW.limit} video)</button></div>` : ''}`
      : tbl(['Video', 'Kênh', 'Ngày đăng', 'View', 'View/ngày', '+View/24h', 'Điểm', 'Tim', 'ER', 'Gắn giỏ', ''],
        res.slice(0, Math.min(500, LIM().kwRows)).map((v) => [vlink(v) + badge(v), `<a href="https://www.tiktok.com/@${esc(v.author)}" target="_blank">@${esc(v.author)}</a>`, TTA.fmtDate(v.createTime),
          `<b>${TTA.fmt(v.views)}</b>`, TTA.fmt(perDay(v)), growth24(v) != null ? TTA.fmt(growth24(v)) : '–', `<b>${score(v)}</b>`, TTA.fmt(v.likes), TTA.pct(TTA.er(v)), v.products?.length ? '🛒' : '', `<button class="mini" data-play="${v.id}" data-author="${esc(v.author)}">▶ Xem</button>`]))}</section>
    <div class="grid2">
      <section class="card"><h2>Kênh nổi bật trong từ khoá</h2><p class="muted small">Tổng lượt xem các video của kênh trong kết quả.</p>
        ${hbarsSVG(chans.slice(0, 12).map((g) => ({ label: '@' + g.name, value: g.total, tip: `<b>@${esc(g.name)}</b><br>${g.n} video · tổng ${TTA.fmt(g.total)} view` })))}</section>
      <section class="card"><h2>Hashtag đi kèm hiệu quả</h2><p class="muted small">View trung vị của video chứa hashtag (≥ 2 video).</p>${hbarsSVG(tagRows)}</section>
    </div>
    <section class="card"><div class="tablehead"><h2>📝 Lời thoại 10 video điểm xu hướng cao nhất</h2>
      <div class="toolbar" style="margin:0"><button id="kwTr" class="primary">${LIM().bulkTranscript ? '' : '🔒 '}Lấy lời thoại (${trTop.length - withTr.length} video chưa có)</button>${withTr.length ? '<button id="kwTrCopy">Copy tất cả</button>' : ''}</div></div>
      <p class="muted small" id="kwTrMsg">Đọc kịch bản người ta nói trong video xu hướng (lấy từ phụ đề TikTok tạo sẵn; video chỉ có nhạc sẽ không có lời).</p>
      ${withTr.length ? tbl(['Video', 'Điểm', 'Câu mở đầu', 'Lời thoại'], withTr.map((v) => [vlink(v, (v.desc || '').slice(0, 50)), `<b>${score(v)}</b>`, esc(v.hookLine || '–'), `<span class="small">${esc((v.transcript || '').slice(0, 400))}${(v.transcript || '').length > 400 ? '…' : ''}</span>`])) : ''}
    </section>`}`;

  const rerender = () => PANES.keyword();
  el.querySelectorAll('.toAcc').forEach((x) => (x.onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: Auth.accountUrl() }); }));
  $('#kwInput').oninput = (e) => (KW.input = e.target.value);
  $('#kwGo').onclick = async () => {
    const q = $('#kwInput').value.trim();
    if (!q) return;
    await chrome.runtime.sendMessage({ type: 'searchKeyword', keyword: q, scrolls: Number($('#kwDepth').value) });
    KW.kw = TTA.kwKey(q);
    $('#kwJob').textContent = 'Đã bắt đầu… (tiến trình cập nhật tự động)';
  };
  // Xoá nhãn từ khoá (video vẫn giữ), bỏ luôn khỏi danh sách theo dõi hằng ngày
  const delKw = async (k) => {
    if (!confirm(`Xoá từ khoá "${k}" khỏi danh sách? (Video vẫn được giữ trong dữ liệu)`)) return;
    const { videos = {}, ttKeywords = {}, kwWatch = [] } = await chrome.storage.local.get(['videos', 'ttKeywords', 'kwWatch']);
    for (const id in videos) if (videos[id].kw?.includes(k)) videos[id].kw = videos[id].kw.filter((x) => x !== k);
    delete ttKeywords[k];
    if (KW.kw === k) KW.kw = '';
    await chrome.storage.local.set({ videos, ttKeywords, kwWatch: kwWatch.filter((x) => x !== k) });
  };
  el.querySelectorAll('.kwChip').forEach((b) => (b.onclick = (e) => {
    const del = e.target.closest('[data-del]');
    if (del) { delKw(del.dataset.del); return; }
    KW.kw = b.dataset.kw; KW.limit = 60; rerender();
  }));
  if (!KW.kw) return;
  $('#kwGrid').onclick = () => { KW.view = 'grid'; rerender(); };
  $('#kwTable').onclick = () => { KW.view = 'table'; rerender(); };
  if ($('#kwMore')) $('#kwMore').onclick = () => { KW.limit += 60; rerender(); };
  el.querySelectorAll('[data-play]').forEach((c) => (c.onclick = (e) => { if (!e.target.closest('a')) playModal(c.dataset.play, c.dataset.author); }));
  const bind = (id, key, num) => ($(id).onchange = (e) => { KW[key] = num ? Number(e.target.value) : e.target.value; rerender(); });
  bind('#kwRange', 'range'); bind('#kwSort', 'sort'); bind('#kwMin', 'min', true); bind('#kwCart', 'cart');
  if ($('#kwFrom')) { bind('#kwFrom', 'from'); bind('#kwTo', 'to'); }
  el.querySelectorAll('.kwRel').forEach((b) => (b.onclick = async () => {
    await chrome.runtime.sendMessage({ type: 'searchKeyword', keyword: b.dataset.q, scrolls: 25 });
    $('#kwJob').textContent = `Đã bắt đầu quét "${b.dataset.q}"…`; scrollTo({ top: 0, behavior: 'smooth' });
  }));
  $('#kwWatch').onclick = async () => {
    if (!(state.kwWatch || []).includes(KW.kw) && (state.kwWatch || []).length >= LIM().watch) return upgrade(LIM().watch ? `Theo dõi hơn ${LIM().watch} từ khoá` : 'Theo dõi từ khoá hằng ngày');
    const list = state.kwWatch || [];
    await chrome.storage.local.set({ kwWatch: list.includes(KW.kw) ? list.filter((k) => k !== KW.kw) : [...list, KW.kw] });
  };
  if ($('#kwRunW')) $('#kwRunW').onclick = async () => { await chrome.runtime.sendMessage({ type: 'runWatched' }); $('#kwJob').textContent = 'Đang quét các từ khoá theo dõi…'; };
  $('#kwHour').onchange = (e) => chrome.storage.local.set({ kwSettings: { ...state.kwSettings, hour: Number(e.target.value) } });
  $('#kwTr').onclick = async (e) => {
    if (!LIM().bulkTranscript) return upgrade('Lấy lời thoại hàng loạt');
    const todo = trTop.filter((v) => !v.transcript && !v.hookLine);
    e.target.disabled = true;
    for (let i = 0; i < todo.length; i++) {
      $('#kwTrMsg').textContent = `Đang lấy lời thoại ${i + 1}/${todo.length}…`;
      await chrome.runtime.sendMessage({ type: 'getOriginal', author: todo[i].author, id: todo[i].id }).catch(() => null);
      await new Promise((r) => setTimeout(r, 1200 + Math.random() * 800));
    }
    $('#kwTrMsg').textContent = '✓ Xong.'; e.target.disabled = false;
  };
  if ($('#kwTrCopy')) $('#kwTrCopy').onclick = (e) => navigator.clipboard.writeText(withTr.map((v) => `${vurl(v)}\nMở đầu: ${v.hookLine || ''}\n${v.transcript || ''}`).join('\n\n')).then(() => (e.target.textContent = '✓ Đã copy'));
  $('#kwCsv').onclick = () => !LIM().csv ? upgrade('Xuất CSV') : TTA.download(`tiktok-tukhoa-${KW.kw.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`, TTA.toCSV(res));
  $('#kwDel').onclick = () => delKw(KW.kw);
};

// Xem video ngay trong Dashboard bằng trình phát nhúng chính thức của TikTok
function playModal(id, author) {
  document.getElementById('vmodal')?.remove();
  const m = document.createElement('div');
  m.id = 'vmodal';
  const link = `https://www.tiktok.com/@${author}/video/${id}`;
  m.innerHTML = `<div class="vm-inner"><div class="vm-head"><a href="${esc(link)}" target="_blank">Mở trên TikTok ↗</a><button class="vm-x">✕</button></div>
    <iframe src="https://www.tiktok.com/player/v1/${id}?autoplay=1&controls=1&description=1&music_info=1" allow="autoplay; fullscreen; encrypted-media" allowfullscreen></iframe></div>`;
  document.body.appendChild(m);
  const close = () => { m.remove(); document.removeEventListener('keydown', esc1); };
  const esc1 = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc1);
  m.querySelector('.vm-x').onclick = close;
  m.onclick = (e) => { if (e.target === m) close(); };
}
