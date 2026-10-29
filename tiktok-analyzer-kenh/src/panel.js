// Cột "Phân tích kênh" bên phải trang kênh TikTok (www.tiktok.com/@kenh).
// Chỉ dùng dữ liệu TikTok đã gửi về khi bạn lướt kênh (content.js đã lưu): không tự mở trang,
// không tải trang video → không làm tăng nguy cơ bị TikTok chặn.
// Lời thoại lấy từ link phụ đề có sẵn trong dữ liệu đã tải (file phụ đề trên máy chủ ảnh/video của TikTok).
(() => {
  if (window.__TTA_PANEL__) return;
  window.__TTA_PANEL__ = true;

  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const profile = () => (location.pathname.match(/^\/@([^/?#]+)\/?$/) || [])[1] || '';
  const DAY = 86400;
  const ST = { open: true, tab: 'top', sort: 'views', fetching: false, prog: '', ready: false, tr: {}, open1: null };

  let box = null, data = { list: [], user: null }, timer = null, lastUser = '';

  // ---------- dữ liệu ----------
  async function load(user) {
    const { videos = {}, users = {} } = await chrome.storage.local.get(['videos', 'users']);
    const u = user.toLowerCase();
    const list = Object.values(videos).filter((v) => (v.author || '').toLowerCase() === u && !v.isAd);
    const key = Object.keys(users).find((k) => k.toLowerCase() === u);
    data = { list, user: key ? users[key] : null };
  }

  const er = (v) => (v.views ? (v.likes + v.comments + v.shares + v.saves) / v.views : 0);
  const median = (a) => TTA.median(a.filter((x) => x != null && !Number.isNaN(x)));
  const fmt = TTA.fmt, pct = TTA.pct;
  const hookOf = (v) => (TTA.hookText ? TTA.hookText(v) : '') || v.desc || '';
  const trOf = (v) => v.transcript || ST.tr[v.id] || '';

  function analyze(list) {
    const now = Date.now() / 1000;
    const base = list.filter((v) => now - v.createTime > 3 * DAY); // video quá mới chưa đủ view
    const med = median((base.length >= 5 ? base : list).map((v) => v.views)) || 1;
    const recent = list.filter((v) => now - v.createTime < 30 * DAY);
    const byHour = {};
    list.forEach((v) => v.createTime && (byHour[new Date(v.createTime * 1000).getHours()] ||= []).push(v.views));
    const hours = Object.entries(byHour).filter(([, a]) => a.length >= 2).map(([h, a]) => [+h, median(a)]).sort((a, b) => b[1] - a[1]);
    const DUR = [['< 30s', 30], ['30–60s', 60], ['1–3 phút', 180], ['> 3 phút', Infinity]];
    const byDur = {};
    list.forEach((v) => { if (!v.duration) return; const d = DUR.find(([, m]) => v.duration < m)[0]; (byDur[d] ||= []).push(v.views); });
    const durs = Object.entries(byDur).filter(([, a]) => a.length >= 2).map(([d, a]) => [d, median(a), a.length]).sort((a, b) => b[1] - a[1]);
    const tags = {};
    list.forEach((v) => (v.hashtags || []).forEach((h) => (tags[h] ||= []).push(v.views)));
    const topTags = Object.entries(tags).filter(([, a]) => a.length >= 2).map(([h, a]) => [h, median(a), a.length]).sort((a, b) => b[1] - a[1]).slice(0, 6);
    let hooks = [];
    if (TTA.hookType) {
      const g = {};
      list.forEach((v) => (g[TTA.hookType(hookOf(v))] ||= []).push(v.views));
      hooks = Object.entries(g).filter(([k, a]) => a.length >= 2 && !/^khác/i.test(k)).map(([k, a]) => [k, median(a) / med, a.length]).sort((a, b) => b[1] - a[1]);
    }
    return {
      med, er: median(list.map(er)), perWeek: recent.length / (30 / 7),
      hit: list.filter((v) => v.views >= 2 * med).length / (list.length || 1),
      hours, durs, topTags, hooks, ratio: (v) => v.views / med,
      speech: list.filter((v) => v.hasSpeech || v.transcript).length / (list.length || 1),
      cart: list.filter((v) => v.products?.length).length,
    };
  }

  // ---------- giao diện ----------
  function ensureBox() {
    if (box && document.body.contains(box)) return box;
    box = document.createElement('div');
    box.id = 'tta-side';
    document.body.appendChild(box);
    box.addEventListener('click', onClick);
    return box;
  }

  function render() {
    if (!document.body) return;
    const user = profile();
    if (!user) { box?.remove(); box = null; return; }
    ensureBox();
    if (!ST.open) {
      box.className = 'mini';
      box.innerHTML = `<button data-a="toggle" title="Mở cột phân tích kênh">📊<span>Phân tích</span></button>`;
      return;
    }
    box.className = '';
    const { list, user: u } = data;
    const head = `<div class="th"><b>📊 @${esc(user)}</b><span class="sp"></span><button data-a="dash" title="Mở phân tích đầy đủ trong Dashboard">↗</button><button data-a="toggle" title="Thu gọn">–</button></div>
      <div class="sub">${u ? `${fmt(u.followers)} follower · ${fmt(u.videoCount)} video · ` : ''}đã ghi nhận <b>${list.length}</b> video${u?.videoCount && list.length < u.videoCount ? ' — cuộn trang để thêm' : ''}</div>`;
    if (list.length < 3) {
      box.innerHTML = head + `<p class="note">Cuộn trang kênh xuống để TikTok tải video. Cột này tự cập nhật khi có từ 3 video.</p>`;
      return;
    }
    const A = analyze(list);
    const kpi = (v, l, t) => `<div class="k" title="${esc(t || '')}"><b>${v}</b><span>${l}</span></div>`;
    const tabs = `<div class="tabs">${[['top', '🔥 Video hot'], ['ana', '🧭 Phân tích']].map(([k, l]) => `<button data-a="tab" data-t="${k}" class="${ST.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;

    let body = '';
    if (ST.tab === 'ana') {
      const line = (icon, txt) => (txt ? `<li>${icon} ${txt}</li>` : '');
      body = `<ul class="ins">
        ${line('⏰', A.hours.length ? `Giờ đăng ăn view nhất: <b>${A.hours.slice(0, 2).map(([h, m]) => `${h}h (${fmt(m)})`).join(', ')}</b>` : '')}
        ${line('⏱️', A.durs.length ? `Độ dài hiệu quả nhất: <b>${esc(A.durs[0][0])}</b> (trung vị ${fmt(A.durs[0][1])}, ${A.durs[0][2]} video)` : '')}
        ${line('🎣', A.hooks.length ? `Kiểu mở đầu tốt nhất: <b>${esc(A.hooks[0][0])}</b> (${A.hooks[0][1].toFixed(1)}× trung vị, ${A.hooks[0][2]} video)` : '')}
        ${line('🗣️', `Video có lời nói / phụ đề: <b>${pct(A.speech, 0)}</b>`)}
        ${line('🛒', A.cart ? `Video gắn giỏ: <b>${A.cart}</b>` : '')}
        ${line('#️⃣', A.topTags.length ? `Hashtag hiệu quả: ${A.topTags.map(([h, m]) => `<span class="tag">#${esc(h)} ${fmt(m)}</span>`).join(' ')}` : '')}
      </ul>
      <p class="note">Số liệu tính từ ${list.length} video đã ghi nhận (trung vị, bỏ video đăng chưa đủ 3 ngày khi tính mốc). Báo cáo đầy đủ (tuyến nội dung, khán giả, brief cho ChatGPT…) ở nút ↗ Dashboard.</p>`;
    } else {
      const top = [...list].sort((a, b) => (ST.sort === 'ratio' ? A.ratio(b) - A.ratio(a) : b.views - a.views)).slice(0, 10);
      const need = top.filter((v) => !trOf(v) && !ST.tr['x' + v.id]).length;
      body = `<div class="bar"><button data-a="sort" data-s="views" class="${ST.sort === 'views' ? 'on' : ''}">Nhiều view</button><button data-a="sort" data-s="ratio" class="${ST.sort === 'ratio' ? 'on' : ''}">Bứt phá</button><span class="sp"></span>
        <button data-a="all" class="pri"${ST.fetching ? ' disabled' : ''}>${ST.fetching ? esc(ST.prog) : need ? `📝 Lấy lời thoại (${need})` : '📋 Copy tất cả'}</button></div>
        <ol class="vl">${top.map((v) => {
          const r = A.ratio(v), tr = trOf(v), miss = ST.tr['x' + v.id];
          return `<li><div class="vt"><a href="/@${esc(v.author)}/video/${v.id}" title="${esc(v.desc)}">${esc(hookOf(v).slice(0, 90))}</a></div>
            <div class="vm">▶ <b>${fmt(v.views)}</b> · ${r >= 2 ? `<span class="hot">${r.toFixed(1)}×</span>` : r.toFixed(1) + '×'} · ER ${pct(er(v), 1)}${v.duration ? ` · ${v.duration}s` : ''}${v.products?.length ? ' · 🛒' : ''}
              <span class="sp"></span><button data-a="tr" data-id="${v.id}" title="${tr ? 'Xem lời thoại' : 'Lấy lời thoại'}">${tr ? '📄' : '📝'}</button><button data-a="cp" data-id="${v.id}" title="Copy caption + lời thoại">📋</button></div>
            ${ST.open1 === v.id ? `<div class="trx">${tr ? esc(tr) : esc(miss || 'Đang lấy…')}</div>` : ''}</li>`;
        }).join('')}</ol>
        <p class="note">Lời thoại lấy từ phụ đề có sẵn trong dữ liệu TikTok đã gửi khi bạn lướt — không mở thêm trang nên không lo bị chặn.</p>`;
    }
    box.innerHTML = head + `<div class="kp">${kpi(fmt(A.med), 'View trung vị')}${kpi(pct(A.er, 1), 'ER trung vị', '(tim + bình luận + share + lưu) / view')}${kpi(A.perWeek.toFixed(1), 'Video/tuần (30 ngày)')}${kpi(pct(A.hit, 0), 'Video ≥ 2× trung vị')}</div>` + tabs + body;
  }

  // ---------- lời thoại ----------
  async function fetchTr(v) {
    if (trOf(v) || ST.tr['x' + v.id]) return;
    const r = await chrome.runtime.sendMessage({ type: 'getOriginal', author: v.author, id: v.id, cacheOnly: true }).catch(() => null);
    if (r?.ok && r.result?.transcript) ST.tr[v.id] = r.result.transcript;
    else ST.tr['x' + v.id] = r?.result?.note || r?.error || 'Không lấy được lời thoại.';
  }
  const textOf = (v) => [`🎬 https://www.tiktok.com/@${v.author}/video/${v.id} — ${fmt(v.views)} view`, `Caption: ${(v.desc || '').trim() || '–'}`,
    `Lời thoại: ${trOf(v) || ST.tr['x' + v.id] || '(chưa lấy)'}`].join('\n');
  const copy = (btn, text) => navigator.clipboard.writeText(text).then(() => { const o = btn.textContent; btn.textContent = '✓'; setTimeout(() => (btn.textContent = o), 1200); })
    .catch(() => alert('Trình duyệt chặn copy, hãy bấm lại.'));

  async function onClick(e) {
    const b = e.target.closest('button[data-a]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const a = b.dataset.a, byId = (id) => data.list.find((v) => v.id === id);
    if (a === 'toggle') { ST.open = !ST.open; chrome.storage.local.set({ ttaPanelOpen: ST.open }); render(); }
    if (a === 'dash') chrome.runtime.sendMessage({ type: 'openDashboard', author: profile(), hash: 'content' });
    if (a === 'tab') { ST.tab = b.dataset.t; render(); }
    if (a === 'sort') { ST.sort = b.dataset.s; render(); }
    if (a === 'tr') {
      const v = byId(b.dataset.id);
      ST.open1 = ST.open1 === v.id ? null : v.id;
      render();
      if (ST.open1 && !trOf(v)) { await fetchTr(v); render(); }
    }
    if (a === 'cp') {
      const v = byId(b.dataset.id);
      if (!trOf(v) && !ST.tr['x' + v.id]) { b.textContent = '⏳'; await fetchTr(v); render(); return; } // lấy xong bấm lần nữa để copy
      copy(b, textOf(v));
    }
    if (a === 'all') {
      const A = analyze(data.list);
      const top = [...data.list].sort((x, y) => (ST.sort === 'ratio' ? A.ratio(y) - A.ratio(x) : y.views - x.views)).slice(0, 10);
      const todo = top.filter((v) => !trOf(v) && !ST.tr['x' + v.id]);
      if (!todo.length) { copy(b, top.map((v, i) => `${i + 1}. ${textOf(v)}`).join('\n\n')); return; }
      ST.fetching = true;
      for (let i = 0; i < todo.length; i++) {
        ST.prog = `⏳ ${i + 1}/${todo.length}…`; render();
        await fetchTr(todo[i]);
        await sleep(400 + Math.random() * 600);
      }
      ST.fetching = false; render();
    }
  }

  // ---------- cập nhật ----------
  async function refresh() {
    const user = profile();
    if (!user) { render(); return; }
    if (user !== lastUser) { lastUser = user; ST.tr = {}; ST.open1 = null; }
    await load(user);
    render();
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 1200); };

  chrome.storage.local.get('ttaPanelOpen').then(({ ttaPanelOpen }) => { if (ttaPanelOpen === false) ST.open = false; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.videos || ch.users) schedule(); });
  // TikTok là trang 1 trang (SPA): theo dõi đổi địa chỉ
  let href = '';
  setInterval(() => { if (location.href !== href) { href = location.href; schedule(); } }, 1000);

  const style = document.createElement('style');
  style.textContent = `
    #tta-side{position:fixed;right:12px;top:72px;width:340px;max-height:calc(100vh - 90px);overflow:auto;z-index:2147483646;background:#121214;color:#f1f1f2;border:1px solid #2f2f33;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.35);font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;padding:10px 12px}
    #tta-side.mini{width:auto;padding:0;overflow:visible;background:transparent;border:0;box-shadow:none}
    #tta-side.mini button{display:flex;flex-direction:column;align-items:center;gap:2px;background:#121214;color:#fff;border:1px solid #25f4ee;border-radius:10px;padding:8px 6px;font:600 11px system-ui;cursor:pointer}
    #tta-side button{font:600 12px system-ui;cursor:pointer;border:1px solid #3a3a40;background:#1f1f23;color:#f1f1f2;border-radius:6px;padding:3px 7px}
    #tta-side button:hover{border-color:#25f4ee}
    #tta-side button.on,#tta-side button.pri{background:#fe2c55;border-color:#fe2c55;color:#fff}
    #tta-side button:disabled{opacity:.7;cursor:default}
    #tta-side .th{display:flex;align-items:center;gap:6px;font-size:14px}
    #tta-side .sp{flex:1}
    #tta-side .sub,#tta-side .note{color:#a8a8b0;font-size:12px;margin:4px 0}
    #tta-side .kp{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:8px 0}
    #tta-side .k{background:#1f1f23;border-radius:8px;padding:6px 8px}
    #tta-side .k b{display:block;font-size:16px}
    #tta-side .k span{color:#a8a8b0;font-size:11px}
    #tta-side .tabs,#tta-side .bar{display:flex;gap:6px;margin:6px 0;align-items:center}
    #tta-side .vl{margin:6px 0;padding-left:20px}
    #tta-side .vl li{margin:0 0 8px}
    #tta-side .vt a{color:#f1f1f2;text-decoration:none;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
    #tta-side .vt a:hover{color:#25f4ee}
    #tta-side .vm{display:flex;align-items:center;gap:4px;color:#a8a8b0;font-size:12px;margin-top:2px}
    #tta-side .vm button{padding:1px 5px}
    #tta-side .hot{color:#fe2c55;font-weight:700}
    #tta-side .trx{background:#1f1f23;border-radius:6px;padding:6px 8px;margin-top:4px;font-size:12px;white-space:pre-wrap;max-height:180px;overflow:auto;user-select:text}
    #tta-side .ins{margin:6px 0;padding-left:0;list-style:none}
    #tta-side .ins li{margin:0 0 6px}
    #tta-side .tag{display:inline-block;background:#1f1f23;border-radius:999px;padding:0 6px;margin:2px 2px 0 0;font-size:11px}
  `;
  (document.head || document.documentElement).appendChild(style);
})();
