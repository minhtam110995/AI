// Giao diện Video Studio (không cần build): gọi API của server cục bộ.
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const store = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

const DURATIONS = [15, 30, 45, 60, 90];
const ASPECT_LABELS = { '9:16': '📱 Dọc 9:16', '16:9': '🖥 Ngang 16:9', '1:1': '⬛ Vuông 1:1', '4:5': '📷 4:5' };
const ROLE_LABELS = { hook: 'Hook', 'van-de': 'Vấn đề', 'giai-phap': 'Giải pháp', 'bang-chung': 'Bằng chứng', 'loi-ich': 'Lợi ích', 'huong-dan': 'Hướng dẫn', 'cau-chuyen': 'Câu chuyện', cta: 'Kêu gọi' };
const WORDS_PER_SEC = 3.1;

const state = {
  settings: {},
  catalog: { templates: [], fonts: {}, aspects: {}, elevenModels: [], music: [], sfx: [] },
  job: null,
  duration: store.get('duration', 30),
  aspect: null,
  template: null,
  provider: store.get('provider', 'gemini'),
  voiceId: store.get('voiceId', {}),
  voices: {},
  polling: false,
};

// ---------- tiện ích ----------
async function api(path, opts = {}) {
  const init = { ...opts };
  if (opts.json !== undefined) {
    init.method = init.method || 'POST';
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(opts.json);
  }
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Lỗi ${res.status}`);
  return data;
}

function toast(msg, ms = 3500) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), ms);
}

function setStatus(el, text, kind = '') {
  el.className = `status ${kind}`;
  el.innerHTML = kind === 'busy' ? `<span class="spinner"></span>${esc(text)}` : esc(text);
}

const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : `${Math.round(s)}s`);

// ---------- khởi động ----------
async function init() {
  [state.settings, state.catalog] = await Promise.all([api('/api/settings'), api('/api/catalog')]);
  buildStaticControls();
  bindEvents();
  const id = new URLSearchParams(location.hash.slice(1)).get('job');
  if (id) await openJob(id).catch(() => history.replaceState(null, '', location.pathname));
  if (!state.settings.hasGemini) {
    toast('Bước đầu tiên: nhập Gemini API key trong ⚙ Cài đặt', 6000);
    openSettings();
  }
}

function buildStaticControls() {
  $('#durationChips').innerHTML = DURATIONS.map((d) => `<button class="chip" data-duration="${d}">${fmtSec(d)}</button>`).join('');
  $('#aspectChips').innerHTML = Object.keys(state.catalog.aspects).map((a) => `<button class="chip" data-aspect="${a}">${ASPECT_LABELS[a] || a}</button>`).join('');
  $('#sFont').innerHTML = '<option value="">Theo template</option>' + Object.entries(state.catalog.fonts).map(([k, f]) => `<option value="${k}">${esc(f.label)}</option>`).join('');
  $('#mEleven').innerHTML = state.catalog.elevenModels.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  renderMusicOptions();
  $('#sfxHint').textContent = state.catalog.sfx.length
    ? `🔊 Hiệu ứng âm thanh có sẵn: ${state.catalog.sfx.join(', ')}`
    : '🔊 Chưa có hiệu ứng âm thanh. Vào ⚙ Cài đặt → "Tạo bộ hiệu ứng âm thanh", hoặc chép whoosh.mp3 / pop.mp3 / ding.mp3 vào assets/sfx/.';
  $('#pexelsHint').textContent = state.settings.hasPexels ? '' : '(cần Pexels API key trong Cài đặt)';
  syncChips();
}

function renderMusicOptions() {
  const cur = $('#music').value;
  const opts = ['<option value="none">Không nhạc</option>'];
  if (state.job?.music) opts.push(`<option value="job">🎵 ${esc(state.job.music.name)}</option>`);
  for (const f of state.catalog.music) opts.push(`<option value="lib:${esc(f)}">📚 ${esc(f)}</option>`);
  $('#music').innerHTML = opts.join('');
  if ([...$('#music').options].some((o) => o.value === cur)) $('#music').value = cur;
  else if (state.job?.music) $('#music').value = 'job';
}

function syncChips() {
  document.querySelectorAll('[data-duration]').forEach((b) => b.classList.toggle('active', +b.dataset.duration === +state.duration));
  if (!DURATIONS.includes(+state.duration)) $('#durationCustom').value = state.duration;
  const aspect = state.aspect || state.job?.brief?.aspect || state.job?.source?.aspect || '9:16';
  document.querySelectorAll('[data-aspect]').forEach((b) => b.classList.toggle('active', b.dataset.aspect === aspect));
  document.querySelectorAll('[data-provider]').forEach((b) => b.classList.toggle('active', b.dataset.provider === state.provider));
  $('#toneWrap').classList.toggle('hidden', state.provider !== 'gemini');
  renderTemplates();
}

const currentAspect = () => state.aspect || state.job?.brief?.aspect || state.job?.source?.aspect || '9:16';
const currentTemplate = () => state.template || state.job?.brief?.template || state.job?.analysis?.recommendedTemplate || state.catalog.templates[0]?.id;

function renderTemplates() {
  const rec = state.job?.analysis?.recommendedTemplate;
  const cur = currentTemplate();
  $('#templateGrid').innerHTML = state.catalog.templates
    .map(
      (t) => `<button class="tpl ${t.id === cur ? 'active' : ''}" data-template="${t.id}" title="Hợp: ${esc(t.bestFor)}">
        ${t.id === rec ? '<span class="star">⭐</span>' : ''}
        <div class="t">${t.emoji} ${esc(t.name)}</div><div class="d">${esc(t.description)}</div></button>`,
    )
    .join('');
}

// ---------- dự án ----------
async function openJob(id) {
  state.job = await api(`/api/jobs/${id}`);
  history.replaceState(null, '', `#job=${id}`);
  state.aspect = state.job.brief?.aspect || null;
  state.template = state.job.brief?.template || null;
  if (state.job.brief?.duration) state.duration = state.job.brief.duration;
  fillBrief(state.job.brief || {});
  renderJob();
  if (state.job.status?.state === 'running') poll();
}

function fillBrief(b) {
  $('#bTopic').value = b.topic || '';
  $('#bDetails').value = b.details || '';
  $('#bAudience').value = b.audience || '';
  $('#bCta').value = b.cta || '';
  $('#bTone').value = b.tone || '';
  $('#bNotes').value = b.notes || '';
}

function readBrief() {
  return {
    topic: $('#bTopic').value.trim(),
    details: $('#bDetails').value.trim(),
    audience: $('#bAudience').value.trim(),
    cta: $('#bCta').value.trim(),
    tone: $('#bTone').value.trim(),
    notes: $('#bNotes').value.trim(),
    duration: +state.duration,
    aspect: currentAspect(),
    template: currentTemplate(),
  };
}

async function poll() {
  if (state.polling) return;
  state.polling = true;
  try {
    for (;;) {
      const job = await api(`/api/jobs/${state.job.id}`);
      state.job = job;
      renderStatus();
      if (job.status?.state !== 'running') break;
      await new Promise((r) => setTimeout(r, 1200));
    }
  } finally {
    state.polling = false;
  }
  const { stage, state: st } = state.job.status || {};
  renderJob();
  if (stage === 'ingest' && st === 'done' && !state.job.analysis) {
    if (state.settings.hasGemini) runAnalyze();
    else toast('Đã tải video. Nhập Gemini API key để phân tích.');
  }
  if (stage === 'render' && st === 'done') {
    toast('🎉 Video đã xong!');
    $('#resultBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function renderStatus() {
  const s = state.job?.status || {};
  const running = s.state === 'running';
  const msg = s.state === 'error' ? `❌ ${s.error}` : running ? s.message || 'Đang xử lý…' : '';
  const kind = s.state === 'error' ? 'err' : running ? 'busy' : '';
  const targets = { ingest: '#sourceStatus', analyze: '#analysisStatus', script: '#scriptStatus', render: '#renderStatus' };
  for (const [stage, sel] of Object.entries(targets)) {
    const el = $(sel);
    if (!el) continue;
    if (stage === s.stage) setStatus(el, msg, kind);
    else if (el.classList.contains('busy')) setStatus(el, '');
  }
  for (const id of ['#btnFetch', '#btnScript', '#btnRender', '#btnReanalyze']) $(id).disabled = running;
  const bar = $('#renderProgress');
  bar.classList.toggle('hidden', !(running && s.stage === 'render'));
  bar.firstElementChild.style.width = `${Math.round((s.progress || 0) * 100)}%`;
}

function renderJob() {
  const j = state.job;
  $('#step2').classList.toggle('hidden', !j?.source);
  $('#step3').classList.toggle('hidden', !j || (!!j.sourceUrl && !j.source && !j.analysis));
  $('#step4').classList.toggle('hidden', !j?.script);
  renderSource();
  renderAnalysis();
  syncChips();
  renderScript();
  renderMedia();
  renderMusicOptions();
  renderResult();
  if (j?.script) loadVoices();
  renderStatus();
}

function renderSource() {
  const j = state.job;
  if (!j) return ($('#sourceBox').innerHTML = '');
  const s = j.source;
  $('#sourceBox').innerHTML = `
    <p class="status" id="sourceStatus"></p>
    ${s ? `<div class="source">
      <video src="${s.url}" controls preload="metadata" poster="${s.thumb}"></video>
      <div class="meta">
        <div><b>${esc(s.title || 'Video mẫu')}</b></div>
        <div class="muted small">${esc(s.uploader || '')}</div>
        <div class="tags" style="margin-top:8px">
          <span class="tag">⏱ <b>${fmtSec(s.duration)}</b></span>
          <span class="tag">📐 <b>${s.width}×${s.height}</b> (${s.aspect})</span>
          ${j.analysis?.measured ? `<span class="tag">✂ <b>${j.analysis.measured.cuts}</b> lần cắt · ${j.analysis.measured.avgShotSec.toFixed(1)}s/cảnh</span>` : ''}
        </div>
        ${j.sourceUrl ? `<p class="small"><a href="${esc(j.sourceUrl)}" target="_blank">Mở link gốc ↗</a></p>` : ''}
      </div></div>` : ''}`;
}

function renderAnalysis() {
  const a = state.job?.analysis;
  const box = $('#analysisBox');
  if (!a) {
    box.innerHTML = `<p class="status" id="analysisStatus"></p>${state.job?.source ? '<p class="muted small">Chưa phân tích. Bấm "↻ Phân tích lại" nếu bước này chưa tự chạy.</p>' : ''}`;
    return;
  }
  const e = a.editStyle || {};
  const tpl = state.catalog.templates.find((t) => t.id === a.recommendedTemplate);
  const sw = (c) => (c ? `<span class="swatch" style="background:${esc(c)}"></span>${esc(c)}` : '');
  box.innerHTML = `
    <p class="status" id="analysisStatus"></p>
    <div class="analysis">
      <div class="box"><h4>📝 Tóm tắt</h4><p>${esc(a.summary)}</p>
        <div class="tags"><span class="tag">Loại: <b>${esc(a.videoType)}</b></span>${tpl ? `<span class="tag">Template gợi ý: <b>${tpl.emoji} ${esc(tpl.name)}</b></span>` : ''}</div>
        ${a.templateReason ? `<p class="muted small">${esc(a.templateReason)}</p>` : ''}</div>
      <div class="box"><h4>🪝 Hook (3 giây đầu)</h4><p><b>"${esc(a.hook?.text)}"</b></p>
        <p class="small">Kỹ thuật: ${esc(a.hook?.technique)}<br/>Hình ảnh: ${esc(a.hook?.visual)}</p></div>
      <div class="box"><h4>🎞 Phong cách edit</h4><p class="small">${esc(e.summary || '')}</p>
        <div class="tags">
          <span class="tag">Nhịp: <b>${esc(e.pacing)}</b></span>
          <span class="tag">Phụ đề: <b>${e.captionsOn === false ? 'không' : `${esc(e.captionPosition)} · ${esc(e.captionFont)}${e.captionUppercase ? ' · IN HOA' : ''}`}</b></span>
          <span class="tag">Chữ ${sw(e.captionColor)}</span><span class="tag">Tô từ ${sw(e.highlightColor)}</span><span class="tag">Nhấn ${sw(e.accentColor)}</span>
          <span class="tag">Chuyển cảnh: <b>${esc(e.transition)}</b></span>
          <span class="tag">Zoom giật: <b>${e.zoomPunch ? 'có' : 'không'}</b></span>
          <span class="tag">Màu: <b>${esc(e.colorGrade)}</b></span>
          ${e.music ? `<span class="tag">Nhạc: <b>${e.music.present ? esc(`${e.music.mood || ''} ${e.music.tempo || ''}`) : 'không'}</b></span>` : ''}
          ${e.voice ? `<span class="tag">Giọng: <b>${esc([e.voice.type, e.voice.gender, e.voice.tone].filter(Boolean).join(' · '))}</b></span>` : ''}
        </div>
        ${(e.sfx || []).length ? `<p class="small">SFX: ${esc(e.sfx.join(', '))}</p>` : ''}
        ${(e.notes || []).length ? `<ul class="small">${e.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>
      <div class="box"><h4>💡 Vì sao video hiệu quả</h4><ul>${(a.whyItWorks || []).map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>
    </div>
    <div class="box" style="margin-top:14px"><h4>🧩 Cấu trúc kịch bản</h4>
      <table class="structure"><tr><th>Thời gian</th><th>Phần</th><th>Lời đọc</th><th>Chữ trên màn hình</th><th>Hình ảnh</th></tr>
      ${(a.structure || []).map((s) => `<tr><td>${(+s.start || 0).toFixed(1)}–${(+s.end || 0).toFixed(1)}s</td><td>${esc(ROLE_LABELS[s.role] || s.role)}</td><td>${esc(s.voiceover)}</td><td>${esc(s.onScreenText)}</td><td>${esc(s.visual)}</td></tr>`).join('')}
      </table>
      ${a.transcript ? `<details class="small"><summary>Lời thoại đầy đủ</summary><p>${esc(a.transcript)}</p></details>` : ''}
    </div>`;
}

// ---------- kịch bản ----------
function renderScript() {
  const sc = state.job?.script;
  const box = $('#scriptBox');
  if (!sc) return (box.innerHTML = '');
  const media = state.job.media || [];
  const words = sc.scenes.reduce((n, s) => n + (s.voiceover || '').split(/\s+/).filter(Boolean).length, 0);
  const est = words / WORDS_PER_SEC;
  const off = Math.abs(est - state.duration) / state.duration > 0.2;
  box.innerHTML = `
    <div class="box" style="margin-top:12px">
      <h4>💡 ${esc(sc.title || 'Kịch bản')}</h4>
      ${sc.whyThisWorks ? `<p class="small muted">${esc(sc.whyThisWorks)}</p>` : ''}
      <div class="grid2">
        <label>Tiêu đề hook (in trên video)<input data-top="headline" value="${esc(sc.headline)}" /></label>
        <div class="grid2">
          <label>Nút CTA<input data-cta="text" value="${esc(sc.cta?.text)}" /></label>
          <label>Dòng phụ CTA<input data-cta="sub" value="${esc(sc.cta?.sub)}" /></label>
        </div>
      </div>
    </div>
    <div class="meter ${off ? 'warn' : ''}" id="meter" style="margin-top:10px">
      📏 ${words} tiếng ≈ <b>${fmtSec(est)}</b> giọng đọc / mục tiêu <b>${fmtSec(state.duration)}</b>
      ${off ? ' — lệch nhiều, nên thêm/bớt lời (máy sẽ chỉnh tốc độ đọc tối đa ±20%)' : ' — vừa khớp ✓'}
    </div>
    <div class="scenes">
      ${sc.scenes.map((s, i) => `
        <div class="scene" data-i="${i}">
          <div class="idx">#${i + 1}</div>
          <div class="fields">
            <label class="vo">🎙 Lời đọc · <i>${esc(ROLE_LABELS[s.role] || s.role || '')}</i><textarea rows="2" data-f="voiceover">${esc(s.voiceover)}</textarea></label>
            <label>🅰 Chữ trên màn hình<input data-f="onScreenText" value="${esc(s.onScreenText)}" /></label>
            <label>🔎 Từ khoá kho video (EN)<input data-f="stockKeywords" value="${esc(s.stockKeywords)}" /></label>
            <label>🖼 Nguồn hình<select data-f="source"><option value="product" ${s.source === 'product' ? 'selected' : ''}>Ảnh/clip của bạn</option><option value="stock" ${s.source !== 'product' ? 'selected' : ''}>Kho video (Pexels)</option></select></label>
            <label>📎 Chọn file cụ thể<select data-f="mediaId"><option value="">Tự động</option>${media.map((m) => `<option value="${m.id}" ${s.mediaId === m.id ? 'selected' : ''}>${esc(m.name)}</option>`).join('')}</select></label>
            <div class="tools">
              <span class="muted small" style="margin-right:auto">${esc(s.visualDescription || '')}</span>
              <button type="button" class="ghost small" data-act="up" title="Lên">↑</button>
              <button type="button" class="ghost small" data-act="down" title="Xuống">↓</button>
              <button type="button" class="ghost small" data-act="dup" title="Thêm cảnh dưới">＋</button>
              <button type="button" class="ghost small" data-act="del" title="Xoá">🗑</button>
            </div>
          </div>
        </div>`).join('')}
    </div>
    ${sc.postCaption ? `<div class="box" style="margin-top:12px"><h4>📣 Caption đăng bài</h4><p style="white-space:pre-wrap">${esc(sc.postCaption)}</p></div>` : ''}`;
}

let saveTimer;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      await api(`/api/jobs/${state.job.id}/script`, { method: 'PUT', json: { script: state.job.script, brief: readBrief() } });
    } catch (e) {
      toast(`Không lưu được kịch bản: ${e.message}`);
    }
  }, 600);
}

function updateMeter() {
  const sc = state.job.script;
  const words = sc.scenes.reduce((n, s) => n + (s.voiceover || '').split(/\s+/).filter(Boolean).length, 0);
  const est = words / WORDS_PER_SEC;
  const off = Math.abs(est - state.duration) / state.duration > 0.2;
  const m = $('#meter');
  if (!m) return;
  m.className = `meter ${off ? 'warn' : ''}`;
  m.innerHTML = `📏 ${words} tiếng ≈ <b>${fmtSec(est)}</b> giọng đọc / mục tiêu <b>${fmtSec(state.duration)}</b>${off ? ' — lệch nhiều, nên thêm/bớt lời' : ' — vừa khớp ✓'}`;
}

// ---------- giọng ----------
async function loadVoices(force = false) {
  const p = state.provider;
  const list = $('#voiceList');
  if (!state.voices[p] || force) {
    list.innerHTML = '<p class="status"><span class="spinner"></span>Đang tải danh sách giọng…</p>';
    try {
      state.voices[p] = await api(`/api/voices?provider=${p}`);
    } catch (e) {
      list.innerHTML = `<p class="status err">${esc(e.message)}</p>`;
      return;
    }
  }
  renderVoices();
}

function renderVoices() {
  const p = state.provider;
  const q = $('#voiceSearch').value.toLowerCase();
  const g = $('#voiceGender').value;
  const all = state.voices[p] || [];
  if (!state.voiceId[p] && all[0]) state.voiceId[p] = all[0].id;
  const items = all.filter((v) => (!g || v.gender === g) && (!q || `${v.name} ${v.description}`.toLowerCase().includes(q)));
  $('#voiceList').innerHTML = items.length
    ? items.map((v) => `
      <div class="voice ${v.id === state.voiceId[p] ? 'active' : ''}" data-voice="${esc(v.id)}">
        <div><div class="n">${esc(v.name)} <span class="muted small">${esc(v.gender)}</span></div><div class="s">${esc(v.description)}</div></div>
        <button type="button" data-preview="${esc(v.id)}" title="Nghe thử tiếng Việt">▶</button>
      </div>`).join('')
    : '<p class="muted">Không có giọng phù hợp.</p>';
}

let previewAudio;
async function previewVoice(btn, voiceId) {
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const { url } = await api('/api/voices/preview', { json: { provider: state.provider, voiceId, speed: +$('#voiceSpeed').value } });
    previewAudio?.pause();
    previewAudio = new Audio(url);
    await previewAudio.play();
  } catch (e) {
    toast(e.message, 6000);
  } finally {
    btn.disabled = false;
    btn.textContent = '▶';
  }
}

// ---------- media ----------
function renderMedia() {
  const media = state.job?.media || [];
  $('#mediaGrid').innerHTML = media
    .map((m) => `<div class="media">${m.type === 'video' ? `<video src="${m.url}#t=0.5" muted preload="metadata"></video>` : `<img src="${m.url}" />`}
      <button type="button" data-del-media="${m.id}" title="Xoá">✕</button><span>${m.type === 'video' ? '🎞 ' : ''}${esc(m.name)}</span></div>`)
    .join('');
}

async function uploadMedia(files) {
  if (!files?.length || !state.job) return;
  const fd = new FormData();
  for (const f of files) fd.append('files', f);
  toast(`Đang tải lên ${files.length} file…`);
  try {
    state.job = await api(`/api/jobs/${state.job.id}/media`, { method: 'POST', body: fd });
    renderMedia();
    renderScript();
    toast('Đã thêm ảnh/clip');
  } catch (e) {
    toast(e.message);
  }
}

function renderResult() {
  const o = state.job?.output;
  if (!o) return ($('#resultBox').innerHTML = '');
  const tempoNote = o.tempo && Math.abs(o.tempo - 1) > 0.01 ? `Đã chỉnh tốc độ đọc ×${o.tempo.toFixed(2)} để khớp thời lượng.` : '';
  $('#resultBox').innerHTML = `
    <div class="result">
      <video src="${o.url}?v=${o.createdAt}" controls></video>
      <div class="side">
        <h3 style="margin:0">✅ Video hoàn thiện</h3>
        <div class="tags"><span class="tag">⏱ <b>${fmtSec(o.duration)}</b></span><span class="tag">📐 <b>${esc(state.job.produceOptions?.aspect || '')}</b></span></div>
        ${tempoNote ? `<p class="small muted">${tempoNote}</p>` : ''}
        <a href="${o.url}" download="video-${state.job.id}.mp4"><button class="primary" type="button">⬇ Tải video MP4</button></a>
        ${state.job.script?.postCaption ? '<button type="button" id="btnCopyCaption">📋 Sao chép caption</button>' : ''}
        ${o.credits?.length ? `<p class="small muted">Video kho: ${esc([...new Set(o.credits)].join(', '))}</p>` : ''}
        <p class="small muted">Muốn đổi? Sửa kịch bản, giọng hoặc phong cách rồi bấm "Tạo video" lại.</p>
      </div>
    </div>`;
}

// ---------- hành động ----------
async function runAnalyze() {
  try {
    await api(`/api/jobs/${state.job.id}/analyze`, { method: 'POST' });
    $('#step2').classList.remove('hidden');
    poll();
  } catch (e) {
    toast(e.message);
  }
}

function renderOptions() {
  const style = {};
  const pick = (id, key, fn = (v) => v) => {
    const v = $(id).value;
    if (v !== '') style[key] = fn(v);
  };
  pick('#sFont', 'captionFont');
  pick('#sPos', 'captionPosition');
  pick('#sTransition', 'transition');
  pick('#sGrade', 'colorGrade');
  pick('#sZoom', 'zoomPunch', (v) => v === '1');
  pick('#sProgress', 'progressBar', (v) => v === '1');
  if (!$('#sCaptions').checked) style.captionsOn = false;
  for (const [id, key] of [['#sColor', 'captionColor'], ['#sHighlight', 'highlightColor'], ['#sAccent', 'accentColor']]) {
    if ($(id).dataset.touched) style[key] = $(id).value;
  }
  return {
    provider: state.provider,
    voiceId: state.voiceId[state.provider],
    speed: +$('#voiceSpeed').value,
    tone: $('#voiceTone').value.trim(),
    duration: +state.duration,
    aspect: currentAspect(),
    template: currentTemplate(),
    useStock: $('#useStock').checked,
    copyStyle: $('#copyStyle').checked,
    fitDuration: $('#fitDuration').checked,
    brand: $('#brand').value.trim(),
    music: $('#music').value,
    style,
  };
}

function bindEvents() {
  $('#btnFetch').onclick = async () => {
    const url = $('#url').value.trim();
    if (!url) return toast('Hãy dán link video mẫu');
    try {
      state.job = await api('/api/jobs', { json: { url } });
      state.aspect = state.template = null;
      history.replaceState(null, '', `#job=${state.job.id}`);
      renderJob();
      poll();
    } catch (e) {
      toast(e.message);
    }
  };
  $('#url').onkeydown = (e) => e.key === 'Enter' && $('#btnFetch').click();

  $('#fileSource').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    toast('Đang tải video lên…');
    try {
      state.job = await api('/api/jobs', { method: 'POST', body: fd });
      state.aspect = state.template = null;
      history.replaceState(null, '', `#job=${state.job.id}`);
      renderJob();
      poll();
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  };

  $('#btnBlank').onclick = async () => {
    state.job = await api('/api/jobs', { json: { blank: true } });
    state.aspect = state.template = null;
    history.replaceState(null, '', `#job=${state.job.id}`);
    renderJob();
    $('#step3').scrollIntoView({ behavior: 'smooth' });
  };

  $('#btnReanalyze').onclick = () => runAnalyze();

  $('#durationChips').onclick = (e) => {
    const d = e.target.closest('[data-duration]');
    if (!d) return;
    state.duration = +d.dataset.duration;
    $('#durationCustom').value = '';
    store.set('duration', state.duration);
    syncChips();
    if (state.job?.script) updateMeter();
  };
  $('#durationCustom').oninput = (e) => {
    const v = +e.target.value;
    if (v >= 5) {
      state.duration = v;
      syncChips();
      if (state.job?.script) updateMeter();
    }
  };
  $('#aspectChips').onclick = (e) => {
    const a = e.target.closest('[data-aspect]');
    if (!a) return;
    state.aspect = a.dataset.aspect;
    syncChips();
  };
  $('#templateGrid').onclick = (e) => {
    const t = e.target.closest('[data-template]');
    if (!t) return;
    state.template = t.dataset.template;
    renderTemplates();
  };

  $('#btnScript').onclick = async () => {
    const brief = readBrief();
    if (!brief.topic) return toast('Hãy nhập chủ đề / sản phẩm của bạn');
    if (state.job?.script && !confirm('Viết lại kịch bản mới? Kịch bản hiện tại sẽ bị thay thế.')) return;
    try {
      if (!state.job) state.job = await api('/api/jobs', { json: { blank: true } });
      await api(`/api/jobs/${state.job.id}/script`, { json: brief });
      poll();
    } catch (e) {
      toast(e.message);
    }
  };

  // Sửa kịch bản trực tiếp
  $('#scriptBox').addEventListener('input', (e) => {
    const sc = state.job?.script;
    if (!sc) return;
    const el = e.target;
    if (el.dataset.top) sc[el.dataset.top] = el.value;
    else if (el.dataset.cta) sc.cta = { ...(sc.cta || {}), [el.dataset.cta]: el.value };
    else if (el.dataset.f) {
      const i = +el.closest('.scene').dataset.i;
      sc.scenes[i][el.dataset.f] = el.value;
      if (el.dataset.f === 'voiceover') updateMeter();
    } else return;
    scheduleSave();
  });
  $('#scriptBox').addEventListener('change', (e) => {
    if (e.target.tagName !== 'SELECT' || !e.target.dataset.f) return;
    const i = +e.target.closest('.scene').dataset.i;
    state.job.script.scenes[i][e.target.dataset.f] = e.target.value;
    scheduleSave();
  });
  $('#scriptBox').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const scenes = state.job.script.scenes;
    const i = +b.closest('.scene').dataset.i;
    const act = b.dataset.act;
    if (act === 'up' && i > 0) [scenes[i - 1], scenes[i]] = [scenes[i], scenes[i - 1]];
    if (act === 'down' && i < scenes.length - 1) [scenes[i + 1], scenes[i]] = [scenes[i], scenes[i + 1]];
    if (act === 'dup') scenes.splice(i + 1, 0, { role: '', voiceover: 'Lời đọc mới…', onScreenText: '', stockKeywords: scenes[i].stockKeywords, source: scenes[i].source });
    if (act === 'del') {
      if (scenes.length <= 1) return toast('Cần ít nhất 1 cảnh');
      scenes.splice(i, 1);
    }
    renderScript();
    scheduleSave();
  });

  // Giọng
  $('#providerChips').onclick = (e) => {
    const b = e.target.closest('[data-provider]');
    if (!b) return;
    if (b.dataset.provider === 'elevenlabs' && !state.settings.hasElevenLabs) {
      toast('Cần nhập ElevenLabs API key trong ⚙ Cài đặt');
      openSettings();
      return;
    }
    state.provider = b.dataset.provider;
    store.set('provider', state.provider);
    syncChips();
    loadVoices();
  };
  $('#voiceSearch').oninput = renderVoices;
  $('#voiceGender').onchange = renderVoices;
  $('#voiceSpeed').oninput = (e) => ($('#voiceSpeedVal').textContent = `${(+e.target.value).toFixed(2)}×`);
  $('#voiceList').onclick = (e) => {
    const pv = e.target.closest('[data-preview]');
    if (pv) return previewVoice(pv, pv.dataset.preview);
    const v = e.target.closest('[data-voice]');
    if (!v) return;
    state.voiceId[state.provider] = v.dataset.voice;
    store.set('voiceId', state.voiceId);
    renderVoices();
  };

  // Media
  $('#mediaFiles').onchange = (e) => {
    uploadMedia(e.target.files);
    e.target.value = '';
  };
  const dz = $('#dropzone');
  dz.ondragover = (e) => {
    e.preventDefault();
    dz.classList.add('over');
  };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove('over');
    uploadMedia(e.dataTransfer.files);
  };
  $('#mediaGrid').onclick = async (e) => {
    const b = e.target.closest('[data-del-media]');
    if (!b) return;
    state.job = await api(`/api/jobs/${state.job.id}/media/${b.dataset.delMedia}`, { method: 'DELETE' });
    renderMedia();
    renderScript();
  };
  $('#musicFile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const fd = new FormData();
    fd.append('file', f);
    try {
      state.job = await api(`/api/jobs/${state.job.id}/music`, { method: 'POST', body: fd });
      renderMusicOptions();
      $('#music').value = 'job';
      toast('Đã thêm nhạc nền');
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  };
  for (const id of ['#sColor', '#sHighlight', '#sAccent']) $(id).addEventListener('input', (e) => (e.target.dataset.touched = '1'));

  $('#btnRender').onclick = async () => {
    const opts = renderOptions();
    if (!opts.voiceId) return toast('Hãy chọn một giọng đọc');
    clearTimeout(saveTimer);
    try {
      await api(`/api/jobs/${state.job.id}/script`, { method: 'PUT', json: { script: state.job.script, brief: readBrief() } });
      await api(`/api/jobs/${state.job.id}/render`, { json: opts });
      poll();
    } catch (e) {
      toast(e.message, 6000);
    }
  };
  $('#resultBox').onclick = (e) => {
    if (e.target.id === 'btnCopyCaption') navigator.clipboard.writeText(state.job.script.postCaption).then(() => toast('Đã sao chép caption'));
  };

  // Thanh trên cùng
  $('#btnNew').onclick = () => {
    state.job = null;
    state.aspect = state.template = null;
    history.replaceState(null, '', location.pathname);
    $('#url').value = '';
    fillBrief({});
    renderJob();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  $('#btnSettings').onclick = openSettings;
  $('#btnSaveSettings').onclick = saveSettings;
  $('#btnProjects').onclick = openProjects;
  $('#projectList').onclick = async (e) => {
    const del = e.target.closest('[data-del-job]');
    if (del) {
      e.preventDefault();
      if (!confirm('Xoá dự án này và mọi file của nó?')) return;
      await api(`/api/jobs/${del.dataset.delJob}`, { method: 'DELETE' });
      if (state.job?.id === del.dataset.delJob) $('#btnNew').click();
      return openProjects();
    }
    const open = e.target.closest('[data-open-job]');
    if (open) {
      $('#projectsDlg').close();
      openJob(open.dataset.openJob);
    }
  };
  $('#btnUpdateYt').onclick = async () => {
    $('#toolMsg').textContent = 'Đang cập nhật…';
    try {
      $('#toolMsg').textContent = (await api('/api/tools/update-ytdlp', { method: 'POST' })).message;
    } catch (e) {
      $('#toolMsg').textContent = e.message;
    }
  };
  $('#btnGenSfx').onclick = async () => {
    $('#toolMsg').textContent = 'Đang tạo whoosh, pop, ding bằng ElevenLabs…';
    try {
      const r = await api('/api/tools/generate-sfx', { method: 'POST' });
      $('#toolMsg').textContent = `Đã tạo: ${r.files.join(', ')}`;
      state.catalog = await api('/api/catalog');
      buildStaticControls();
    } catch (e) {
      $('#toolMsg').textContent = e.message;
    }
  };
}

function openSettings() {
  const s = state.settings;
  $('#kGemini').value = '';
  $('#kEleven').value = '';
  $('#kPexels').value = '';
  $('#kGemini').placeholder = s.geminiApiKey || 'Chưa có';
  $('#kEleven').placeholder = s.elevenLabsApiKey || 'Chưa có';
  $('#kPexels').placeholder = s.pexelsApiKey || 'Chưa có';
  $('#mGemini').value = s.geminiModel || '';
  $('#mGeminiTts').value = s.geminiTtsModel || '';
  $('#mEleven').value = s.elevenLabsModel || 'eleven_flash_v2_5';
  $('#cookies').value = s.cookiesFromBrowser || 'none';
  $('#toolMsg').textContent = '';
  $('#settingsDlg').showModal();
}

async function saveSettings(e) {
  e.preventDefault();
  const patch = {
    geminiModel: $('#mGemini').value,
    geminiTtsModel: $('#mGeminiTts').value,
    elevenLabsModel: $('#mEleven').value,
    cookiesFromBrowser: $('#cookies').value,
  };
  if ($('#kGemini').value.trim()) patch.geminiApiKey = $('#kGemini').value;
  if ($('#kEleven').value.trim()) patch.elevenLabsApiKey = $('#kEleven').value;
  if ($('#kPexels').value.trim()) patch.pexelsApiKey = $('#kPexels').value;
  state.settings = await api('/api/settings', { json: patch });
  state.voices = {};
  $('#settingsDlg').close();
  buildStaticControls();
  if (state.job?.script) loadVoices();
  toast('Đã lưu cài đặt');
}

async function openProjects() {
  const jobs = await api('/api/jobs');
  $('#projectList').innerHTML = jobs.length
    ? jobs.map((j) => `<div class="project">
        ${j.thumb ? `<img src="${j.thumb}" />` : '<img />'}
        <div class="t" data-open-job="${j.id}"><b>${esc(j.title)}</b><div class="muted small">${new Date(j.createdAt).toLocaleString('vi-VN')} ${j.hasOutput ? '· ✅ có video' : ''}</div></div>
        <button class="ghost small" data-del-job="${j.id}">🗑</button></div>`).join('')
    : '<p class="muted">Chưa có dự án nào.</p>';
  if (!$('#projectsDlg').open) $('#projectsDlg').showModal();
}

init().catch((e) => toast(`Không kết nối được server: ${e.message}`, 8000));
