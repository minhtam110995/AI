importScripts('config.js', 'common.js', 'transcript.js', 'auth.js');

// Trình phát của tiện ích: gửi kèm Referer tiktok.com khi tải video từ máy chủ TikTok
// (giống khi xem trên chính trang TikTok). Chỉ áp dụng cho yêu cầu do tiện ích tạo ra.
chrome.declarativeNetRequest.updateSessionRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1, priority: 1,
    action: { type: 'modifyHeaders', requestHeaders: [{ header: 'referer', operation: 'set', value: 'https://www.tiktok.com/' }] },
    condition: {
      initiatorDomains: [chrome.runtime.id],
      requestDomains: ['tiktok.com', 'tiktokcdn.com', 'tiktokcdn-us.com', 'tiktokcdn-eu.com', 'tiktokv.com', 'tiktokv.us', 'tiktokv.eu', 'byteoversea.com', 'ibytedtos.com'],
      resourceTypes: ['media', 'xmlhttprequest', 'other'],
    },
  }],
}).catch(() => {});

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // Mở trang Dashboard khi người dùng bấm nút nổi trên TikTok.
  if (msg.type === 'openDashboard') {
    const q = msg.author ? '?author=' + encodeURIComponent(msg.author) : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + q + (msg.hash ? '#' + msg.hash : '')) });
  }

  // Lấy nội dung gốc (caption + lời thoại) của 1 video, lưu kèm vào dữ liệu video.
  // Lấy địa chỉ phát mới nhất của 1 video (dùng cho trình phát video gắn giỏ)
  if (msg.type === 'getPlayUrls') { getPlayUrls(msg).then(reply); return true; }
  if (msg.type === 'getOriginal') {
    Transcript.getOriginal(msg)
      .then((r) => new Promise((done) => {
        chrome.storage.local.get({ videos: {} }, ({ videos }) => {
          // Chỉ lưu bản lời thoại mặc định (bản gốc), không ghi đè khi người dùng xem bản dịch.
          if (r.video && !msg.lang) {
            videos[r.id] = {
              ...videos[r.id], ...r.video,
              hist: videos[r.id]?.hist,
              transcript: r.transcript || videos[r.id]?.transcript || '',
              transcriptLang: r.lang || videos[r.id]?.transcriptLang || '',
              hookLine: r.segments?.length ? r.segments.slice(0, 2).map((s) => s.text).join(' ').slice(0, 160) : videos[r.id]?.hookLine,
              hasSpeech: !!r.transcript || videos[r.id]?.hasSpeech,
            };
          }
          chrome.storage.local.set({ videos }, () => done(r));
        });
      }))
      .then((r) => reply({ ok: true, result: r }))
      .catch((e) => reply({ ok: false, error: e.message || String(e) }));
    return true; // trả lời bất đồng bộ
  }

  if (msg.type === 'refreshChannels') { refreshChannels().then((n) => reply({ ok: true, n })); return true; }
  if (msg.type === 'runWatched') { runWatchedKeywords(); reply({ ok: true }); }
  if (msg.type === 'searchKeyword') { searchKeyword(msg.keyword, msg.scrolls || 15); reply({ ok: true }); }
  if (msg.type === 'flushed') scheduleBreakoutCheck();
});

// ---------- theo dõi kênh đối thủ ----------
// Mở lần lượt trang kênh trong tab nền để chính TikTok tải số liệu mới, rồi đóng tab.
let refreshing = false;
async function refreshChannels() {
  if (refreshing) return 0;
  refreshing = true;
  const { watchChannels = [] } = await chrome.storage.local.get('watchChannels');
  let n = 0;
  for (const u of watchChannels) {
    const tab = await chrome.tabs.create({ url: `https://www.tiktok.com/@${encodeURIComponent(u)}`, active: false });
    await new Promise((r) => setTimeout(r, 15000));
    try { await chrome.tabs.sendMessage(tab.id, { type: 'flushNow' }); } catch (_) {}
    try { await chrome.tabs.remove(tab.id); } catch (_) {}
    n++;
    await new Promise((r) => setTimeout(r, 5000 + Math.random() * 5000));
  }
  await chrome.storage.local.set({ lastChannelRefresh: Date.now() });
  refreshing = false;
  checkBreakouts();
  return n;
}

async function syncAlarm() {
  const { ttSettings = {} } = await chrome.storage.local.get('ttSettings');
  if (ttSettings.autoRefresh) chrome.alarms.create('refreshChannels', { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  else chrome.alarms.clear('refreshChannels');
}
chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(syncAlarm);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'refreshChannels') refreshChannels(); });
chrome.storage.onChanged.addListener((ch) => { if (ch.ttSettings) syncAlarm(); });

// Cảnh báo video bứt phá của kênh đang theo dõi: đăng ≤ 3 ngày, view ≥ 3× trung vị kênh
let bt = null;
function scheduleBreakoutCheck() { clearTimeout(bt); bt = setTimeout(checkBreakouts, 30000); }
async function checkBreakouts() {
  const { watchChannels = [], videos = {}, notified = [], ttSettings = {} } = await chrome.storage.local.get(['watchChannels', 'videos', 'notified', 'ttSettings']);
  if (ttSettings.notify === false || !watchChannels.length) return;
  const done = new Set(notified);
  const now = Date.now() / 1000;
  for (const u of watchChannels) {
    const vs = Object.values(videos).filter((v) => v.author === u);
    if (vs.length < 5) continue;
    const med = TTA.median(vs.map((v) => v.views));
    for (const v of vs) {
      if (done.has(v.id) || now - v.createTime > 3 * 86400 || v.views < 3 * med) continue;
      done.add(v.id);
      chrome.notifications.create('tta-' + v.id, {
        type: 'basic', iconUrl: 'icons/icon128.png',
        title: `🔥 @${u} có video bứt phá`,
        message: `${TTA.fmt(v.views)} view (gấp ${(v.views / med).toFixed(1)}× trung vị) · ${(v.desc || '').slice(0, 80)}`,
      });
    }
  }
  await chrome.storage.local.set({ notified: [...done].slice(-2000) });
}

chrome.notifications.onClicked.addListener((id) => {
  if (id.startsWith('ttkw-')) { openReport(id.slice(5)); return; }
  const vid = id.replace(/^tta-/, '');
  chrome.storage.local.get('videos', ({ videos = {} }) => {
    const v = videos[vid];
    if (v) chrome.tabs.create({ url: `https://www.tiktok.com/@${v.author}/video/${v.id}` });
  });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Tìm theo từ khoá → video nhiều view ----------
// Mở trang tìm kiếm video của TikTok trong tab nền, tự cuộn để TikTok tải kết quả, rồi đóng tab.
let searching = false;
// Mở (hoặc chuyển tới) báo cáo từ khoá trong Dashboard
async function openReport(keyword) {
  const base = chrome.runtime.getURL('dashboard.html');
  const url = `${base}#keyword?kw=${encodeURIComponent(TTA.kwKey(keyword))}`;
  const [tab] = await chrome.tabs.query({ url: base + '*' }).catch(() => []);
  if (tab) { await chrome.tabs.update(tab.id, { url, active: true }); await chrome.windows.update(tab.windowId, { focused: true }); }
  else await chrome.tabs.create({ url });
}

// Cửa sổ nhỏ hiển thị thật (tab nền bị Chrome tạm dừng vẽ nên TikTok không tải thêm kết quả khi cuộn)
async function openWorkWindow(url) {
  const w = await chrome.windows.create({ url, type: 'popup', focused: true, width: 520, height: 900, left: 40, top: 40 });
  return { winId: w.id, tabId: w.tabs[0].id };
}
async function searchKeyword(input, scrolls, { silent = false } = {}) {
  const keyword = String(input || '').trim();
  if (!keyword || searching) return;
  // Kiểm tra gói: chưa đăng nhập / hết lượt tìm trong ngày / giới hạn độ sâu
  if (!silent) {
    const u = await Auth.useSearch();
    if (!u.ok) {
      const msg = u.st.plan === 'none'
        ? (u.st.reason === 'device' ? '🔒 Tài khoản đã dùng đủ số máy của gói. Mở trang Tài khoản để xoá máy cũ hoặc nâng cấp.' : '🔒 Hãy đăng nhập (trang Tài khoản) để tìm theo từ khoá.')
        : `🔒 Gói Miễn phí được ${u.st.limits.searchesPerDay} lượt tìm mỗi ngày (đã dùng ${u.used}). Nâng cấp Pro để tìm không giới hạn.`;
      await chrome.storage.local.set({ kwJob: { keyword, step: 'error', msg, locked: true, t: Date.now() } });
      return;
    }
    scrolls = Math.min(scrolls, u.st.limits.maxDepth);
  }
  searching = true;
  const setKw = (job) => chrome.storage.local.set({ kwJob: { keyword, ...job, t: Date.now() } });
  const key = TTA.kwKey(keyword);
  const count = async () => Object.values((await chrome.storage.local.get('videos')).videos || {}).filter((v) => v.kw?.includes(key)).length;
  let win = null;
  try {
    const before = await count();
    await setKw({ step: 'run', msg: `Đang tìm "${keyword}" trên TikTok trong cửa sổ nhỏ (để cửa sổ đó mở, đừng thu nhỏ)…` });
    win = await openWorkWindow(`https://www.tiktok.com/search/video?q=${encodeURIComponent(keyword)}`);
    await sleep(8000);
    const tick = setInterval(async () => setKw({ step: 'run', msg: `Đang cuộn lấy kết quả "${keyword}": ${await count()} video… (để cửa sổ TikTok nhỏ mở)` }), 5000);
    try { await chrome.tabs.sendMessage(win.tabId, { type: 'autoscroll', times: scrolls, wait: true }); } catch (_) { await sleep(scrolls * 3000); }
    clearInterval(tick);
    try { await chrome.tabs.sendMessage(win.tabId, { type: 'flushNow' }); } catch (_) {}
    await sleep(1000);
    const n = await count();
    if (win) { try { await chrome.windows.remove(win.winId); } catch (_) {} win = null; }
    if (n && !silent) await openReport(keyword);
    await setKw({ step: 'done', msg: n ? `✓ Xong: có ${n} video cho từ khoá "${keyword}" (+${Math.max(0, n - before)} video mới lần này).` : `Không lấy được video nào. Hãy mở tiktok.com, đăng nhập (hoặc giải captcha) rồi thử lại.`, n });
  } catch (e) {
    await setKw({ step: 'error', msg: 'Lỗi: ' + (e.message || e) });
  }
  if (win) try { await chrome.windows.remove(win.winId); } catch (_) {}
  searching = false;
}

// ---------- Theo dõi từ khoá hằng ngày ----------
// Tự quét các từ khoá đã ⭐ vào giờ đã chọn, rồi thông báo video xu hướng mới.
async function syncKwAlarm() {
  const { kwWatch = [], kwSettings = {} } = await chrome.storage.local.get(['kwWatch', 'kwSettings']);
  if (!kwWatch.length) return chrome.alarms.clear('kwDaily');
  const at = new Date();
  at.setHours(kwSettings.hour ?? 7, 3, 0, 0);
  if (at <= new Date()) at.setDate(at.getDate() + 1);
  const cur = await chrome.alarms.get('kwDaily');
  if (cur && Math.abs(cur.scheduledTime - at.getTime()) < 60e3) return;
  chrome.alarms.create('kwDaily', { when: at.getTime(), periodInMinutes: 24 * 60 });
}
chrome.runtime.onInstalled.addListener(syncKwAlarm);
chrome.runtime.onStartup.addListener(syncKwAlarm);
chrome.storage.onChanged.addListener((ch) => { if (ch.kwWatch || ch.kwSettings) syncKwAlarm(); });
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'kwDaily') runWatchedKeywords(); });

async function runWatchedKeywords() {
  const st = await Auth.refresh();
  const { kwWatch: watchList = [] } = await chrome.storage.local.get('kwWatch');
  const kwWatch = watchList.slice(0, st.limits.watch); // số từ khoá theo dõi theo gói
  if (!kwWatch.length) return;
  for (const kw of kwWatch) {
    await searchKeyword(kw, 25, { silent: true });
    await sleep(5000 + Math.random() * 5000);
  }
  const { videos = {}, users = {}, kwNotified = [], ttSettings = {} } = await chrome.storage.local.get(['videos', 'users', 'kwNotified', 'ttSettings']);
  if (ttSettings.notify === false) return;
  const all = Object.values(videos).filter((v) => !v.isAd);
  const K = TTA.trendKit(all, users);
  const done = new Set(kwNotified);
  const recent = Date.now() / 1000 - 30 * 86400;
  for (const kw of kwWatch) {
    const fresh = all.filter((v) => v.kw?.includes(kw) && v.createTime >= recent && K.isTrend(v) && !done.has(kw + ':' + v.id))
      .sort((a, b) => K.score(b) - K.score(a));
    if (!fresh.length) continue;
    fresh.forEach((v) => done.add(kw + ':' + v.id));
    chrome.notifications.create('ttkw-' + kw, {
      type: 'basic', iconUrl: 'icons/icon128.png',
      title: `📈 "${kw}": ${fresh.length} video xu hướng mới`,
      message: `Top: ${TTA.fmt(fresh[0].views)} view · điểm ${K.score(fresh[0])} · ${(fresh[0].desc || '').slice(0, 70)}`,
    });
  }
  await chrome.storage.local.set({ kwNotified: [...done].slice(-5000) });
}

// ---------- địa chỉ phát cho video gắn giỏ bị chặn trên web ----------
// 1) trang video (dữ liệu nhúng), 2) trang nhúng embed/v2. Trả kèm thông tin chẩn đoán.
async function getPlayUrls({ id, author }) {
  const diag = { id };
  let urls = [], products = [], item = null;
  try {
    item = await Transcript.fetchPageItem(`https://www.tiktok.com/@${author || '_'}/video/${id}`, String(id));
    urls = TTA.playUrlsOf(item);
    products = TTA.normalizeVideo(item)?.products || [];
    diag.page = { urls: urls.length, itemKeys: Object.keys(item).slice(0, 60), videoKeys: Object.keys(item.video || {}).slice(0, 60), isECVideo: item.isECVideo, anchors: (item.anchors || []).length };
  } catch (e) { diag.page = { error: e.message }; }
  if (!urls.length) {
    try {
      const html = await (await fetch(`https://www.tiktok.com/embed/v2/${id}`, { credentials: 'include' })).text();
      const found = new Set();
      const text = html.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
      for (const m of text.matchAll(/https?:\/\/[^"'\s<>]+/g)) if (TTA.isVideoUrl(m[0])) found.add(m[0].replace(/&amp;/g, '&'));
      urls = [...found].slice(0, 6);
      diag.embed = { status: 'ok', urls: urls.length, size: html.length };
      if (!products.length) products = TTA.deepProducts({ html: text });
    } catch (e) { diag.embed = { error: e.message }; }
  }
  return { ok: true, urls, products, cover: item?.video?.cover || '', diag };
}
