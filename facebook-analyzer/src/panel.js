// Cột phân tích bên phải khi đang xem một fanpage: số liệu nhanh, nội dung hot (copy nội dung + lời thoại),
// ✨ đưa sang ChatGPT / Claude — không cần mở Dashboard.
(() => {
  if (window.top !== window) return;
  const ST = { open: false, tab: 'hot', goal: 'viral', topic: '', page: null, posts: [], me: {} };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const isReel = (p) => p.type === 'reel' || p.type === 'video';
  const trDone = (p) => !!p.trTried && typeof p.transcript === 'string';
  let root, btn;

  const css = `
    #fba-side{position:fixed;top:56px;right:0;bottom:0;width:360px;max-width:92vw;z-index:2147483646;background:#fff;color:#111;border-left:1px solid #ddd;box-shadow:-4px 0 18px rgba(0,0,0,.12);font:13px/1.45 system-ui,sans-serif;display:flex;flex-direction:column}
    #fba-side *{box-sizing:border-box}
    #fba-side .hd{padding:10px 12px;border-bottom:1px solid #eee;display:flex;gap:8px;align-items:center}
    #fba-side .hd b{flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #fba-side .bd{overflow:auto;padding:10px 12px;flex:1}
    #fba-side button{border:1px solid #d0d0d0;background:#fff;color:#111;border-radius:7px;padding:4px 9px;font:600 12px system-ui;cursor:pointer}
    #fba-side button.on,#fba-side button.pri{background:#1877f2;border-color:#1877f2;color:#fff}
    #fba-side .kp{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
    #fba-side .kp div{border:1px solid #eee;border-radius:8px;padding:6px 8px}
    #fba-side .kp b{display:block;font-size:16px}
    #fba-side .kp span{color:#666;font-size:11px}
    #fba-side .tabs{display:flex;gap:6px;margin-bottom:8px}
    #fba-side .it{border:1px solid #eee;border-radius:8px;padding:7px 8px;margin-bottom:6px}
    #fba-side .it a{color:#111;text-decoration:none}
    #fba-side .mt{color:#666;font-size:11.5px;margin:2px 0 4px}
    #fba-side .hot{background:#f02849;color:#fff;border-radius:999px;padding:0 6px;font-size:10.5px;font-weight:700}
    #fba-side input,#fba-side textarea{width:100%;border:1px solid #d0d0d0;border-radius:7px;padding:6px 8px;font:13px system-ui;margin:4px 0}
    #fba-side .row{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0}
    #fba-side .muted{color:#666;font-size:12px}
    #fba-tog{position:fixed;right:12px;bottom:70px;z-index:2147483647;background:#1877f2;color:#fff;border:0;border-radius:999px;padding:9px 14px;font:700 13px system-ui;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.3)}`;

  function medians(list) {
    const m = {};
    for (const kind of ['view', 'eng']) {
      const vs = list.filter((p) => FBA.metricKind(p) === kind).map(FBA.metric);
      m[kind] = vs.length >= 3 ? FBA.median(vs) : null;
    }
    return m;
  }

  async function load() {
    const ctx = window.__FBA_CTX?.();
    ST.page = ctx && ctx.name && !/^facebook$/i.test(ctx.name) ? ctx : null;
    if (!ST.page) { root?.remove(); root = null; btn?.remove(); btn = null; return; }
    const { posts = {}, fbMe = {}, fbPanelOpen = false } = await chrome.storage.local.get(['posts', 'fbMe', 'fbPanelOpen']);
    ST.posts = Object.values(posts).filter((p) => p.page === ST.page.name);
    ST.me = fbMe; ST.open = fbPanelOpen;
    draw();
  }

  function draw() {
    if (!document.body) return;
    if (!document.getElementById('fba-side-css')) { const s = document.createElement('style'); s.id = 'fba-side-css'; s.textContent = css; document.head.appendChild(s); }
    if (!btn) { btn = document.createElement('button'); btn.id = 'fba-tog'; btn.onclick = () => chrome.storage.local.set({ fbPanelOpen: !ST.open }); document.body.appendChild(btn); }
    btn.textContent = ST.open ? '✕ Đóng phân tích' : '📊 Phân tích trang';
    if (!ST.open) { root?.remove(); root = null; return; }
    if (!root) { root = document.createElement('div'); root.id = 'fba-side'; document.body.appendChild(root); root.addEventListener('click', onClick); root.addEventListener('input', onInput); }
    // Đang gõ trong cột → không vẽ lại (mất chữ)
    if (root.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
    const list = ST.posts, med = medians(list);
    const ratio = (p) => { const m = med[FBA.metricKind(p)]; return m ? FBA.metric(p) / m : null; };
    const hot = [...list].sort((a, b) => (ratio(b) ?? 0) - (ratio(a) ?? 0) || FBA.metric(b) - FBA.metric(a)).slice(0, 10);
    ST.hot = hot; ST.ratio = ratio;
    const reels = list.filter(isReel);
    const head = `<div class="hd"><b title="${esc(ST.page.name)}">📘 ${esc(ST.page.name)}</b><button data-a="dash">Dashboard</button></div>`;
    const kp = `<div class="kp"><div><b>${list.length}</b><span>bài / Reels đã lưu</span></div><div><b>${reels.length}</b><span>Reels / video</span></div>
      <div><b>${FBA.fmt(FBA.median(list.filter((p) => !isReel(p)).map(FBA.engagement)))}</b><span>tương tác trung vị / bài</span></div>
      <div><b>${FBA.fmt(FBA.median(reels.map((p) => p.views)))}</b><span>view trung vị / Reels</span></div></div>`;
    const tabs = `<div class="tabs"><button data-a="tab" data-t="hot" class="${ST.tab === 'hot' ? 'on' : ''}">🔥 Nội dung hot</button><button data-a="tab" data-t="ai" class="${ST.tab === 'ai' ? 'on' : ''}">✨ ChatGPT / Claude</button></div>`;
    let body;
    if (!list.length) body = `<p class="muted">Chưa có dữ liệu của trang này. Bấm <b>⬇ Cuộn lấy bài</b> (hoặc mở tab Reels của trang rồi bấm) để tiện ích ghi lại bài khi Facebook tải.</p>`;
    else if (ST.tab === 'hot') body = hot.map((p, i) => `<div class="it"><a href="${esc(p.url || '#')}" target="_blank">${i + 1}. ${esc((p.text || '(không có chữ)').slice(0, 90))}</a>
        <div class="mt">${FBA.TYPE_LABEL[p.type] || ''} · ${FBA.fmtDate(p.time)}${p.views ? ' · ▶ ' + FBA.fmt(p.views) : ''} · 👍 ${FBA.fmt(p.reactions)} · 💬 ${FBA.fmt(p.comments)}${ratio(p) >= 2 ? ` <span class="hot">🔥 ${ratio(p).toFixed(1)}×</span>` : ''}</div>
        <button data-a="copy" data-k="${esc(p.key)}" class="${!isReel(p) || trDone(p) ? 'pri' : ''}">📋 Copy nội dung${isReel(p) ? ' + lời thoại' : ''}</button></div>`).join('');
    else {
      const filled = FBA.ME_FIELDS.filter(([k]) => (ST.me[k] || '').trim()).length;
      body = `<p class="muted">Gửi 5 nội dung hot nhất của trang (số liệu, nội dung, lời thoại Reels nếu đã lấy) sang AI.</p>
        <div class="row">${Object.entries(FBA.AI_GOALS).map(([k, [l]]) => `<button data-a="goal" data-g="${k}" class="${ST.goal === k ? 'on' : ''}">${l}</button>`).join('')}</div>
        <input data-in="topic" placeholder="Chủ đề / sản phẩm của bạn (không bắt buộc)" value="${esc(ST.topic)}">
        <div class="row"><button data-a="ai" data-to="chatgpt" class="pri">Mở ChatGPT</button><button data-a="ai" data-to="claude" class="pri">Mở Claude</button><button data-a="copyPrompt">Copy prompt</button></div>
        <details><summary class="muted">👤 Hồ sơ fanpage của tôi (${filled}/${FBA.ME_FIELDS.length})</summary>${FBA.ME_FIELDS.map(([k, l, ph]) => `<label class="muted">${l}<input data-me="${k}" placeholder="${esc(ph)}" value="${esc(ST.me[k] || '')}"></label>`).join('')}</details>`;
    }
    root.innerHTML = head + `<div class="bd">${kp}<div class="row"><button data-a="scroll">⬇ Cuộn lấy bài</button></div>${tabs}${body}</div>`;
  }

  const prompt = () => FBA.aiPrompt({ goal: ST.goal, items: ST.hot.slice(0, 5).map((p) => ({ p, ratio: ST.ratio(p) })), topic: ST.topic, me: ST.me, source: `fanpage ${ST.page.name}` });
  const fullText = (p) => [`${p.url || ''} — ${p.page}`, `Số liệu: ${p.views ? FBA.fmt(p.views) + ' lượt xem · ' : ''}${FBA.fmt(p.reactions)} cảm xúc · ${FBA.fmt(p.comments)} bình luận · ${FBA.fmt(p.shares)} chia sẻ`,
    `Nội dung: ${(p.text || '').trim() || '–'}`, ...(isReel(p) ? [`Lời thoại: ${p.transcript || (trDone(p) ? '(Reels này không có phụ đề tự động)' : '(chưa lấy)')}`] : [])].join('\n');
  const flash = (b, t) => { const o = b.textContent; b.textContent = t; setTimeout(() => (b.textContent = o), 1500); };

  async function onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    if (a === 'dash') chrome.runtime.sendMessage({ type: 'openDashboard', page: ST.page.name });
    if (a === 'tab') { ST.tab = b.dataset.t; draw(); }
    if (a === 'goal') { ST.goal = b.dataset.g; draw(); }
    if (a === 'scroll') { chrome.runtime.sendMessage({ type: 'scrollMe', times: 15 }); flash(b, '⬇ Đang cuộn…'); }
    if (a === 'copy') {
      const p = ST.posts.find((x) => x.key === b.dataset.k);
      if (!p) return;
      if (isReel(p) && !trDone(p)) {
        b.disabled = true; b.textContent = '⏳ Đang lấy lời thoại…';
        const r = await chrome.runtime.sendMessage({ type: 'getTranscript', key: p.key }).catch(() => null);
        b.disabled = false;
        if (!r?.ok) { b.textContent = '📋 Copy nội dung + lời thoại'; alert(r?.error || 'Chưa lấy được lời thoại.'); return; }
        p.transcript = r.transcript; p.trTried = true;
        b.textContent = r.transcript ? '📋 Đã lấy xong — bấm để copy' : '📋 Không có phụ đề — bấm để copy nội dung'; b.classList.add('pri');
        return;
      }
      navigator.clipboard.writeText(fullText(p)).then(() => flash(b, '✓ Đã copy')).catch(() => alert('Trình duyệt chặn copy, bấm lại một lần nữa.'));
    }
    if (a === 'copyPrompt') navigator.clipboard.writeText(prompt()).then(() => flash(b, '✓ Đã copy'));
    if (a === 'ai') {
      const pr = prompt(), url = FBA.aiUrl(b.dataset.to, pr);
      if (url.length < 7000) { window.open(url, '_blank'); return; }
      await navigator.clipboard.writeText(pr).catch(() => {});
      alert('Prompt dài nên đã copy sẵn. Trang AI sẽ mở — dán (Ctrl+V) vào ô chat rồi gửi.');
      window.open(b.dataset.to === 'claude' ? 'https://claude.ai/new' : 'https://chatgpt.com/', '_blank');
    }
  }
  function onInput(e) {
    const t = e.target;
    if (t.dataset.in === 'topic') ST.topic = t.value;
    if (t.dataset.me) { ST.me = { ...ST.me, [t.dataset.me]: t.value }; clearTimeout(onInput.t); onInput.t = setTimeout(() => chrome.storage.local.set({ fbMe: ST.me }), 600); }
  }

  let lt;
  chrome.storage.onChanged.addListener((ch) => { if (ch.posts || ch.fbMe || ch.fbPanelOpen) { clearTimeout(lt); lt = setTimeout(load, ch.fbPanelOpen ? 0 : 1200); } });
  let last = '';
  setInterval(() => { if (location.href !== last) { last = location.href; setTimeout(load, 1500); } }, 1000);
})();
