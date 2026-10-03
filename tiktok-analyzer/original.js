const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const results = [];

const ask = (msg) => new Promise((resolve) => chrome.runtime.sendMessage({ type: 'getOriginal', ...msg }, resolve));

function copy(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const old = btn.textContent;
    btn.textContent = '✓ Đã copy';
    setTimeout(() => (btn.textContent = old), 1200);
  });
}

function fullText(r) {
  return [
    `Video: https://www.tiktok.com/@${r.author}/video/${r.id}`,
    `Caption: ${r.caption}`,
    r.hashtags.length ? `Hashtag: ${r.hashtags.map((h) => '#' + h).join(' ')}` : '',
    r.music ? `Âm thanh: ${r.music}` : '',
    '',
    `Lời thoại${r.lang ? ' (' + r.lang + ')' : ''}:`,
    r.transcript || '(không có)',
  ].filter((x, i) => x || i === 4).join('\n');
}

function renderItem(box, r, link) {
  if (!r) {
    box.innerHTML = `<p class="err">❌ ${esc(link)}<br>${esc(box.dataset.error || 'Lỗi không xác định')}</p>`;
    return;
  }
  const v = r.video || {};
  const url = `https://www.tiktok.com/@${esc(r.author)}/video/${r.id}`;
  const langs = r.languages.length > 1
    ? `<select data-act="lang">${r.languages.map((l) => `<option value="${esc(l.lang)}" ${l.lang === r.lang ? 'selected' : ''}>${esc(l.lang)}${l.original ? ' (gốc)' : l.source === 'MT' ? ' (dịch máy)' : ''}</option>`).join('')}</select>` : '';
  box.innerHTML = `
    <h3><a href="${url}" target="_blank">@${esc(r.author)} · ${esc(TTA.fmtDate(v.createTime))}</a></h3>
    <div class="stats">👁 ${TTA.fmt(v.views)} · ❤ ${TTA.fmt(v.likes)} · 💬 ${TTA.fmt(v.comments)} · ↗ ${TTA.fmt(v.shares)} · 🔖 ${TTA.fmt(v.saves)} · ⏱ ${v.duration || '–'}s</div>
    <div class="block"><div class="head"><b>Caption</b><button class="small" data-act="cap">Copy</button></div>
      <div class="text">${esc(r.caption) || '<span class="muted">(không có caption)</span>'}</div></div>
    ${r.music ? `<div class="block small"><b>Âm thanh:</b> ${esc(r.music)}</div>` : ''}
    <div class="block"><div class="head"><b>Lời thoại ${r.lang ? '· ' + esc(r.lang) : ''}</b>
      <span class="bar" style="margin:0">${langs}
        <label class="small"><input type="checkbox" data-act="timed"> Mốc thời gian</label>
        <button class="small" data-act="tr">Copy</button>
        <button class="small" data-act="all">Copy tất cả</button>
        <button class="small" data-act="txt">Tải .txt</button></span></div>
      <div class="text" data-el="tr">${esc(r.transcript) || '<span class="muted">(không có lời thoại)</span>'}</div></div>
    ${r.note ? `<div class="note">ℹ️ ${esc(r.note)}</div>` : ''}`;
  box.onclick = (e) => {
    const act = e.target.dataset?.act;
    if (act === 'cap') copy(r.caption, e.target);
    if (act === 'tr') copy(box.querySelector('[data-act=timed]').checked ? r.timed : r.transcript, e.target);
    if (act === 'all') copy(fullText(r), e.target);
    if (act === 'txt') TTA.download(`tiktok-${r.author}-${r.id}.txt`, '﻿' + fullText(r) + (r.timed ? '\n\nCó mốc thời gian:\n' + r.timed : ''), 'text/plain');
  };
  box.onchange = async (e) => {
    const act = e.target.dataset?.act;
    if (act === 'timed') box.querySelector('[data-el=tr]').textContent = (e.target.checked ? r.timed : r.transcript) || '(không có lời thoại)';
    if (act === 'lang') {
      box.querySelector('[data-el=tr]').textContent = 'Đang tải…';
      const res = await ask({ author: r.author, id: r.id, lang: e.target.value });
      if (res?.ok) { Object.assign(r, res.result); renderItem(box, r, link); }
    }
  };
}

async function run() {
  const links = [...new Set($('#links').value.split(/\s+/).map((s) => s.trim()).filter((s) => /tiktok\.com/.test(s)))].slice(0, 50);
  if (!links.length) { $('#progress').textContent = 'Chưa có link TikTok hợp lệ.'; return; }
  $('#go').disabled = true;
  $('#results').innerHTML = '';
  results.length = 0;
  for (let i = 0; i < links.length; i++) {
    $('#progress').textContent = `Đang xử lý ${i + 1}/${links.length}…`;
    const box = document.createElement('section');
    box.className = 'card item';
    box.innerHTML = '<p class="muted">Đang tải…</p>';
    $('#results').appendChild(box);
    const res = await ask({ link: links[i] });
    if (res?.ok) { results.push(res.result); renderItem(box, res.result, links[i]); }
    else { box.dataset.error = res?.error; renderItem(box, null, links[i]); }
    if (i < links.length - 1) await new Promise((r) => setTimeout(r, 1200)); // nghỉ giữa các link, tránh bị TikTok chặn
  }
  $('#progress').textContent = `Xong ${results.length}/${links.length} video.`;
  $('#csv').classList.toggle('hidden', !results.length);
  $('#go').disabled = false;
}

$('#go').onclick = run;
$('#csv').onclick = () => TTA.download(`tiktok-noi-dung-goc-${new Date().toISOString().slice(0, 10)}.csv`,
  TTA.toCSV(results.map((r) => ({ ...(r.video || { id: r.id, author: r.author, hashtags: r.hashtags, views: 0, likes: 0, comments: 0, shares: 0, saves: 0 }), transcript: r.transcript }))));

// Mở sẵn từ popup / dashboard: original.html?link=... hoặc ?author=...&id=...
const q = new URLSearchParams(location.search);
const pre = q.get('link') || (q.get('id') ? `https://www.tiktok.com/@${q.get('author') || '_'}/video/${q.get('id')}` : '');
if (pre) { $('#links').value = pre; run(); }
