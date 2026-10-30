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
  const ST = { open: true, tab: 'top', sort: 'views', fetching: false, prog: '', ready: false, tr: {}, open1: null, ai: null, me: {}, editMe: false, auth: null, q: {}, aiMsg: '' };

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
    box.addEventListener('input', onInput);
    box.addEventListener('toggle', (e) => { if (e.target.classList?.contains('me')) ST.editMe = e.target.open; }, true);
    // phím gõ trong ô nhập không lọt xuống TikTok (TikTok dùng phím tắt)
    ['keydown', 'keyup', 'keypress'].forEach((k) => box.addEventListener(k, (e) => { if (/INPUT|TEXTAREA/.test(e.target.tagName)) e.stopPropagation(); }));
    return box;
  }

  const TTA_CFG_TRIAL = 3;
  function lockText(au) {
    return au.reason === 'device' ? `Tài khoản đã dùng đủ ${au.deviceLimit} máy của gói. Mở trang Tài khoản để xoá máy cũ.`
      : au.reason === 'blocked' ? 'Tài khoản đang bị tạm khoá. Liên hệ hỗ trợ.'
      : au.reason === 'offline' || au.reason === 'checking' ? 'Chưa kiểm tra được gói với máy chủ (mất mạng?). Mở trang Tài khoản để thử lại.'
      : 'Đăng nhập Viral Finder để dùng cột phân tích kênh.';
  }
  function planInfo(au) {
    if (!au || !au.configured) return '';
    const left = (k) => { const q = ST.q[k]; return q && q.max !== Infinity && q.max != null ? `${q.left}/${q.max}` : null; };
    if (au.plan === 'pro') {
      const warn = au.daysLeft != null && au.daysLeft <= 3;
      return `<div class="plan${warn ? ' warn' : ''}">⭐ ${au.isTrial ? 'Dùng thử Pro' : 'Pro'}${au.daysLeft != null ? ` · còn ${au.daysLeft} ngày` : ''}${warn ? ` <button data-a="acct" class="pri">${au.isTrial ? '⭐ Mua Pro' : 'Gia hạn'}</button>` : ''}</div>`;
    }
    return `<div class="plan">Gói Miễn phí · lời thoại còn ${left('tr') ?? '–'} · ✨ còn ${left('ai') ?? '–'} hôm nay <button data-a="acct" class="pri">⭐ Nâng cấp Pro</button></div>`;
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
    const au = ST.auth;
    if (au && au.plan === 'none') {
      box.innerHTML = head + `<div class="lock"><p>${esc(lockText(au))}</p><button data-a="acct" class="pri">${au.loggedIn ? '⚙️ Mở trang Tài khoản' : '🔐 Đăng nhập / Đăng ký'}</button>
        <p class="note">Đăng ký mới được <b>dùng thử Pro ${TTA_CFG_TRIAL} ngày</b>.</p></div>`;
      return;
    }
    const planLine = planInfo(au);
    if (list.length < 3) {
      box.innerHTML = head + planLine + `<p class="note">Cuộn trang kênh xuống để TikTok tải video. Cột này tự cập nhật khi có từ 3 video.</p>`;
      return;
    }
    const A = analyze(list);
    const kpi = (v, l, t) => `<div class="k" title="${esc(t || '')}"><b>${v}</b><span>${l}</span></div>`;
    const tabs = `<div class="tabs">${[['top', '🔥 Video hot'], ['ana', '🧭 Phân tích']].map(([k, l]) => `<button data-a="tab" data-t="${k}" class="${ST.tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>`;

    let body = '';
    if (ST.ai) { box.innerHTML = head + planLine + composer(A, list); return; }
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
      body = `<div class="bar"><button data-a="sort" data-s="views" class="${ST.sort === 'views' ? 'on' : ''}">Nhiều view</button><button data-a="sort" data-s="ratio" class="${ST.sort === 'ratio' ? 'on' : ''}">Bứt phá</button><button data-a="ai" data-id="top" class="ai" title="Phân tích viral cả 10 video & viết lại">✨ Top 10</button><span class="sp"></span>
        <button data-a="all" class="pri"${ST.fetching ? ' disabled' : ''}>${ST.fetching ? esc(ST.prog) : need ? `📝 Lấy lời thoại (${need})` : '📋 Copy tất cả'}</button></div>
        <ol class="vl">${top.map((v) => {
          const r = A.ratio(v), tr = trOf(v), miss = ST.tr['x' + v.id];
          return `<li><div class="vt"><a href="/@${esc(v.author)}/video/${v.id}" title="${esc(v.desc)}">${esc(hookOf(v).slice(0, 90))}</a></div>
            <div class="vm">▶ <b>${fmt(v.views)}</b> · ${r >= 2 ? `<span class="hot">${r.toFixed(1)}×</span>` : r.toFixed(1) + '×'} · ER ${pct(er(v), 1)}${v.duration ? ` · ${v.duration}s` : ''}${v.products?.length ? ' · 🛒' : ''}
              <span class="sp"></span><button data-a="tr" data-id="${v.id}" title="${tr ? 'Xem lời thoại' : 'Lấy lời thoại'}">${tr ? '📄' : '📝'}</button><button data-a="cp" data-id="${v.id}" title="Copy caption + lời thoại">📋</button><button data-a="ai" data-id="${v.id}" class="ai" title="Phân tích viral & viết lại bằng ChatGPT / Claude">✨</button></div>
            ${ST.open1 === v.id ? `<div class="trx">${tr ? esc(tr) : esc(miss || 'Đang lấy…')}</div>` : ''}</li>`;
        }).join('')}</ol>
        <p class="note">Lời thoại lấy từ phụ đề có sẵn trong dữ liệu TikTok đã gửi khi bạn lướt — không mở thêm trang nên không lo bị chặn.</p>`;
    }
    box.innerHTML = head + planLine + `<div class="kp">${kpi(fmt(A.med), 'View trung vị')}${kpi(pct(A.er, 1), 'ER trung vị', '(tim + bình luận + share + lưu) / view')}${kpi(A.perWeek.toFixed(1), 'Video/tuần (30 ngày)')}${kpi(pct(A.hit, 0), 'Video ≥ 2× trung vị')}</div>` + tabs + body;
  }

  // ---------- ✨ Phân tích viral & viết lại bằng ChatGPT / Claude ----------
  const GOALS = {
    viral: ['🔍 Vì sao viral', 'Phân tích vì sao video viral'],
    rewrite: ['✍️ Viết lại cho kênh tôi', 'Viết lại theo công thức viral cho kênh của tôi'],
    hooks: ['🎣 10 câu hook', 'Viết 10 câu hook 3 giây đầu'],
    sell: ['🛒 Kịch bản bán hàng', 'Chuyển thành kịch bản bán hàng'],
  };
  const ME_FIELDS = [['niche', 'Ngách / chủ đề kênh', 'vd: mẹo kinh doanh online cho mẹ bỉm'], ['product', 'Sản phẩm / dịch vụ', 'vd: khoá học bán hàng TikTok 1,99 triệu'],
    ['audience', 'Khách hàng mục tiêu', 'vd: nữ 25–40, nội trợ, muốn kiếm thêm thu nhập'], ['voice', 'Giọng văn', 'vd: gần gũi, xưng chị – các em, hài hước nhẹ'], ['avoid', 'Không dùng / tránh', 'vd: không nói giá, không dùng từ "cam kết"']];
  const aiVideos = (A, list) => {
    const ids = ST.ai.ids;
    const sorted = [...list].sort((x, y) => (ST.sort === 'ratio' ? A.ratio(y) - A.ratio(x) : y.views - x.views));
    return ids === 'top' ? sorted.slice(0, 10) : list.filter((v) => ids.includes(v.id));
  };

  function buildPrompt(A, list) {
    const vids = aiVideos(A, list), u = data.user, me = ST.me || {}, goal = ST.ai.goal, topic = (ST.ai.topic || '').trim();
    const many = vids.length > 1;
    const vtxt = vids.map((v, i) => [
      `### Video ${i + 1}${many ? '' : ''}: https://www.tiktok.com/@${v.author}/video/${v.id}`,
      `- Số liệu: ${fmt(v.views)} view (${A.ratio(v).toFixed(1)}× view trung vị của kênh), ER ${pct(er(v), 1)}, ${fmt(v.shares)} share, ${fmt(v.saves)} lưu${v.duration ? `, dài ${v.duration}s` : ''}${v.createTime ? `, đăng ${new Date(v.createTime * 1000).toLocaleDateString('vi-VN')}` : ''}${v.products?.length ? ', có gắn giỏ hàng' : ''}`,
      `- Caption: ${(v.desc || '').replace(/\s+/g, ' ').trim() || '–'}`,
      `- Kịch bản gốc (lời thoại): ${trOf(v) || '(không có lời thoại — video không lời hoặc chưa lấy được; hãy suy luận từ caption và số liệu)'}`,
    ].join('\n')).join('\n\n');
    const meTxt = ME_FIELDS.filter(([k]) => (me[k] || '').trim()).map(([k, l]) => `- ${l}: ${me[k].trim()}`).join('\n');
    const tasks = {
      viral: [
        `Phân tích vì sao ${many ? 'các video này' : 'video này'} viral:`,
        '1. Hook 3 giây đầu: trích nguyên văn, vì sao giữ chân người xem.',
        '2. Cấu trúc nội dung theo từng đoạn (mở – thân – kết), nhịp và cách chuyển ý.',
        '3. Cảm xúc / tâm lý người xem được khai thác (tò mò, sợ bỏ lỡ, đồng cảm, hài hước…).',
        '4. Lời kêu gọi hành động và lý do người xem bình luận / chia sẻ / lưu.',
        `5. Rút ra **công thức có thể tái sử dụng** dạng khung (Hook → … → CTA)${many ? ', và điểm chung giữa các video' : ''}.`,
        '6. Những điều KHÔNG nên bắt chước (dễ vi phạm, phụ thuộc người nổi tiếng, may mắn…).',
      ],
      rewrite: [
        'Bước 1: Tóm tắt ngắn công thức viral của video gốc (hook, cấu trúc, cảm xúc, CTA).',
        `Bước 2: Viết **3 kịch bản mới** cho kênh của tôi${topic ? ` về chủ đề / sản phẩm: ${topic}` : ''}, áp dụng công thức đó nhưng **không sao chép câu chữ gốc**. Mỗi kịch bản gồm:`,
        '- Tiêu đề ý tưởng; 2 phương án câu hook 3 giây đầu;',
        '- Thân bài theo từng cảnh: lời nói + hình ảnh quay + chữ trên màn hình;',
        '- Lời kêu gọi hành động; caption; 3–5 hashtag; độ dài dự kiến.',
      ],
      hooks: [
        `Dựa trên hook của video gốc, viết **10 câu hook 3 giây đầu** cho ${topic ? `chủ đề: ${topic}` : 'kênh của tôi'}, mỗi câu ≤ 15 từ, đa dạng kiểu: câu hỏi, con số, gây tò mò, cảnh báo, POV, trước/sau, phản bác.`,
        'Ghi kiểu hook cạnh mỗi câu. Đánh dấu 3 câu mạnh nhất và giải thích vì sao.',
      ],
      sell: [
        'Bước 1: Chỉ ra yếu tố nào của video gốc có thể dùng để bán hàng mà không lộ liễu.',
        `Bước 2: Viết **2 kịch bản bán hàng 30–45 giây** cho ${topic ? `sản phẩm: ${topic}` : 'sản phẩm của tôi'}, cấu trúc: hook → vấn đề → trải nghiệm / bằng chứng → giải pháp → kêu gọi bấm giỏ hàng. Mỗi kịch bản có lời nói theo cảnh, chữ trên màn hình, caption, hashtag.`,
        'Bước 3: Gợi ý 3 câu trả lời bình luận mẫu cho người hỏi giá / xin link.',
      ],
    }[goal];
    return [
      'Bạn là chuyên gia nội dung TikTok tại Việt Nam, giỏi phân tích video viral và viết kịch bản video ngắn.',
      `# Mục tiêu: ${GOALS[goal][1]}`,
      `## Nhiệm vụ\n${tasks.join('\n')}`,
      `## Dữ liệu kênh @${profile()}\n- ${u ? `${fmt(u.followers)} follower, ` : ''}view trung vị ${fmt(A.med)}/video, ER trung vị ${pct(A.er, 1)}, ${A.perWeek.toFixed(1)} video/tuần. Số liệu do tiện ích Viral Finder thu thập từ dữ liệu công khai ngày ${new Date().toLocaleDateString('vi-VN')}.`,
      `## ${many ? `${vids.length} video` : 'Video'} cần phân tích\n${vtxt}`,
      meTxt ? `## Hồ sơ kênh của tôi\n${meTxt}` : '',
      '## Lưu ý\nChỉ dựa trên dữ liệu ở trên; chỗ nào là suy đoán thì ghi rõ. Không sao chép nguyên văn nội dung của người khác. Trả lời bằng tiếng Việt, có tiêu đề rõ ràng, dễ làm theo.',
    ].filter(Boolean).join('\n\n');
  }

  function composer(A, list) {
    const vids = aiVideos(A, list), have = vids.filter((v) => trOf(v)).length, none = vids.filter((v) => !trOf(v) && ST.tr['x' + v.id]).length;
    const me = ST.me || {}, filled = ME_FIELDS.filter(([k]) => (me[k] || '').trim()).length;
    return `<div class="bar"><button data-a="aiback">← Quay lại</button><span class="sp"></span><b>✨ ChatGPT / Claude</b></div>
      <p class="sub">${vids.length > 1 ? `${vids.length} video top` : `Video: ${esc(hookOf(vids[0] || {}).slice(0, 70))}`} · lời thoại ${have}/${vids.length}${none ? ` (${none} video không lời)` : ''}${ST.fetching ? ` · ${esc(ST.prog)}` : have + none < vids.length ? ' <button data-a="aifetch">📝 Lấy lời thoại còn thiếu</button>' : ''}</p>
      <div class="goals">${Object.entries(GOALS).map(([k, [l]]) => `<button data-a="aigoal" data-g="${k}" class="${ST.ai.goal === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      ${ST.ai.goal === 'viral' ? '' : `<input class="in" id="ttaTopic" placeholder="${ST.ai.goal === 'sell' ? 'Sản phẩm cần bán (vd: kem chống nắng 199k)' : 'Chủ đề / sản phẩm cho lần này (không bắt buộc)'}" value="${esc(ST.ai.topic || '')}">`}
      <div class="bar"><button data-a="aiopen" data-to="chatgpt" class="pri">Mở ChatGPT ↗</button><button data-a="aiopen" data-to="claude" class="pri">Mở Claude ↗</button><button data-a="aicopy">📋 Copy prompt</button></div>
      ${ST.aiMsg ? `<p class="lockmsg">${esc(ST.aiMsg)} <button data-a="acct" class="pri">⭐ Nâng cấp</button></p>` : ''}
      <p class="note">Tiện ích copy sẵn prompt rồi mở ChatGPT / Claude (điền sẵn nếu prompt ngắn). Nếu ô chat trống: bấm <b>Ctrl+V</b> rồi Enter.</p>
      <details class="me"${ST.editMe ? ' open' : ''}><summary>👤 Hồ sơ kênh của tôi (${filled}/${ME_FIELDS.length}) — tự gắn vào mọi prompt</summary>
        ${ME_FIELDS.map(([k, l, ph]) => `<label>${l}<input class="in" data-me="${k}" placeholder="${esc(ph)}" value="${esc(me[k] || '')}"></label>`).join('')}
      </details>
      <details class="pv"><summary>Xem trước prompt (${buildPrompt(A, list).length.toLocaleString('vi-VN')} ký tự)</summary><div class="trx">${esc(buildPrompt(A, list))}</div></details>`;
  }

  async function fetchMissing(vids) {
    const todo = vids.filter((v) => !trOf(v) && !ST.tr['x' + v.id]);
    if (!todo.length) return;
    ST.fetching = true;
    for (let i = 0; i < todo.length; i++) {
      ST.prog = `⏳ lấy lời thoại ${i + 1}/${todo.length}…`; render();
      await fetchTr(todo[i]);
      if (i < todo.length - 1) await sleep(400 + Math.random() * 600);
    }
    ST.fetching = false; render();
  }

  // Mở ChatGPT / Claude: luôn copy prompt; prompt ngắn thì điền sẵn qua đường link (?q=)
  async function openAI(to, btn) {
    const A = analyze(data.list), prompt = buildPrompt(A, data.list);
    try { await navigator.clipboard.writeText(prompt); } catch (_) {}
    const base = to === 'claude' ? 'https://claude.ai/new' : 'https://chatgpt.com/';
    const url = base + '?q=' + encodeURIComponent(prompt);
    window.open(url.length < 7000 ? url : base, '_blank');
    btn.textContent = url.length < 7000 ? '✓ Đã mở (điền sẵn)' : '✓ Đã copy — dán Ctrl+V';
  }

  // ---------- lời thoại ----------
  async function fetchTr(v) {
    if (trOf(v) || ST.tr['x' + v.id]) return;
    const r = await chrome.runtime.sendMessage({ type: 'getOriginal', author: v.author, id: v.id, cacheOnly: true }).catch(() => null);
    if (r?.ok && r.result?.transcript) ST.tr[v.id] = r.result.transcript;
    else ST.tr['x' + v.id] = r?.result?.note || r?.error || 'Không lấy được lời thoại.';
    if (r?.locked) ST.q.tr = { ...(ST.q.tr || {}), left: 0 };
    else if (r?.ok) loadAuth();
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
    if (a === 'acct') { chrome.runtime.sendMessage({ type: 'openAccount' }); return; }
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
    if (a === 'ai') {
      ST.ai = { ids: b.dataset.id === 'top' ? 'top' : [b.dataset.id], goal: ST.ai?.goal || 'viral', topic: ST.ai?.topic || '' };
      render();
      const A = analyze(data.list);
      fetchMissing(aiVideos(A, data.list)); // tự lấy lời thoại còn thiếu (từ dữ liệu đã tải)
      return;
    }
    if (a === 'aiback') { ST.ai = null; render(); }
    if (a === 'aigoal') { ST.ai.goal = b.dataset.g; render(); }
    if (a === 'aifetch') fetchMissing(aiVideos(analyze(data.list), data.list));
    if (a === 'aicopy' || a === 'aiopen') {
      const u = await chrome.runtime.sendMessage({ type: 'useQuota', kind: 'ai' }).catch(() => null);
      if (u && !u.ok) { ST.aiMsg = u.msg; render(); return; }
      ST.aiMsg = '';
      if (a === 'aicopy') copy(b, buildPrompt(analyze(data.list), data.list)); else await openAI(b.dataset.to, b);
      loadAuth().then(() => { const p = box?.querySelector('.plan'); if (p) p.outerHTML = planInfo(ST.auth); });
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

  // Cập nhật ô xem trước prompt khi gõ chủ đề / hồ sơ (không vẽ lại cả cột để khỏi mất chỗ đang gõ)
  function refreshPreview() {
    const txt = buildPrompt(analyze(data.list), data.list);
    const sum = box?.querySelector('.pv summary'), pre = box?.querySelector('.pv .trx');
    if (sum) sum.textContent = `Xem trước prompt (${txt.length.toLocaleString('vi-VN')} ký tự)`;
    if (pre) pre.textContent = txt;
    const me = box?.querySelector('details.me summary');
    if (me) me.textContent = `👤 Hồ sơ kênh của tôi (${ME_FIELDS.filter(([k]) => (ST.me[k] || '').trim()).length}/${ME_FIELDS.length}) — tự gắn vào mọi prompt`;
  }

  function onInput(e) {
    const t = e.target;
    if (t.id === 'ttaTopic' && ST.ai) ST.ai.topic = t.value;
    if (t.dataset?.me) { ST.me[t.dataset.me] = t.value; clearTimeout(onInput.tm); onInput.tm = setTimeout(() => chrome.storage.local.set({ myProfile: ST.me }), 500); }
    if (ST.ai) refreshPreview();
  }

  // ---------- cập nhật ----------
  async function refresh() {
    if (box && box.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) { schedule(); return; } // đang gõ: để sau
    const user = profile();
    if (!user) { render(); return; }
    if (user !== lastUser) { lastUser = user; ST.tr = {}; ST.open1 = null; ST.ai = null; }
    await Promise.all([load(user), loadAuth()]);
    render();
  }
  // Gói cước + lượt còn lại trong ngày (hỏi qua phần nền; máy chủ chỉ được gọi 6 giờ/lần)
  async function loadAuth() {
    ST.auth = await chrome.runtime.sendMessage({ type: 'authState' }).catch(() => null);
    const [tr, ai] = await Promise.all(['tr', 'ai'].map((k) => chrome.runtime.sendMessage({ type: 'quota', kind: k }).catch(() => null)));
    ST.q = { tr, ai };
  }
  const schedule = () => { clearTimeout(timer); timer = setTimeout(refresh, 1200); };

  chrome.storage.local.get(['ttaPanelOpen', 'myProfile']).then(({ ttaPanelOpen, myProfile }) => { if (ttaPanelOpen === false) ST.open = false; ST.me = myProfile || {}; });
  chrome.storage.onChanged.addListener((ch) => { if (ch.videos || ch.users || ch.ttAccess || ch.ttAuth) schedule(); });
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
    #tta-side button.ai{border-color:#7c5cff}
    #tta-side .goals{display:flex;flex-wrap:wrap;gap:6px;margin:6px 0}
    #tta-side .in{width:100%;box-sizing:border-box;background:#1f1f23;color:#f1f1f2;border:1px solid #3a3a40;border-radius:6px;padding:6px 8px;font:13px system-ui;margin:4px 0}
    #tta-side .in:focus{outline:none;border-color:#25f4ee}
    #tta-side details{margin:8px 0}
    #tta-side summary{cursor:pointer;color:#c9c9d1;font-size:12px}
    #tta-side .me label{display:block;font-size:11px;color:#a8a8b0;margin-top:4px}
    #tta-side .pv .trx{max-height:220px}
    #tta-side .plan{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#1f1f23;border-radius:8px;padding:5px 8px;margin:6px 0;font-size:12px;color:#d6d6dd}
    #tta-side .plan.warn{border:1px solid #fe2c55}
    #tta-side .plan button{margin-left:auto}
    #tta-side .lock{background:#1f1f23;border-radius:8px;padding:10px;margin-top:8px}
    #tta-side .lockmsg{color:#ffb4c2;font-size:12px}
    #tta-side .tag{display:inline-block;background:#1f1f23;border-radius:999px;padding:0 6px;margin:2px 2px 0 0;font-size:11px}
  `;
  (document.head || document.documentElement).appendChild(style);
})();
