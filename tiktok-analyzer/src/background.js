importScripts('common.js', 'transcript.js');

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // Mở trang Dashboard khi người dùng bấm nút nổi trên TikTok.
  if (msg.type === 'openDashboard') {
    const q = msg.author ? '?author=' + encodeURIComponent(msg.author) : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + q) });
  }

  // Lấy nội dung gốc (caption + lời thoại) của 1 video, lưu kèm vào dữ liệu video.
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
  if (msg.type === 'analyzeChannel') { analyzeChannel(msg.username, msg.scrolls || 15, msg.maxProducts || 15); reply({ ok: true }); }
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
  const vid = id.replace(/^tta-/, '');
  chrome.storage.local.get('videos', ({ videos = {} }) => {
    const v = videos[vid];
    if (v) chrome.tabs.create({ url: `https://www.tiktok.com/@${v.author}/video/${v.id}` });
  });
});

// ---------- Dán kênh → phân tích affiliate ----------
// 1) mở kênh trong tab nền và tự cuộn để lấy video, 2) mở trang các sản phẩm gắn giỏ để lấy giá & "đã bán".
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const setJob = (job) => chrome.storage.local.set({ ttJob: { ...job, t: Date.now() } });
let analyzing = false;
async function analyzeChannel(input, scrolls, maxProducts) {
  const username = String(input || '').trim().replace(/^.*tiktok\.com\/@/, '').replace(/^@/, '').split(/[/?#\s]/)[0];
  if (!username || analyzing) return;
  analyzing = true;
  try {
    await setJob({ username, step: 'channel', msg: `Đang mở kênh @${username} và cuộn lấy video…` });
    const tab = await chrome.tabs.create({ url: `https://www.tiktok.com/@${encodeURIComponent(username)}`, active: false });
    await sleep(9000);
    try { await chrome.tabs.sendMessage(tab.id, { type: 'autoscroll', times: scrolls }); } catch (_) {}
    await sleep(scrolls * 2600 + 3000);
    try { await chrome.tabs.sendMessage(tab.id, { type: 'flushNow' }); } catch (_) {}
    try { await chrome.tabs.remove(tab.id); } catch (_) {}
    await sleep(1500);

    const { videos = {}, products = {} } = await chrome.storage.local.get(['videos', 'products']);
    const mine = Object.values(videos).filter((v) => v.author?.toLowerCase() === username.toLowerCase());
    const views = {};
    mine.forEach((v) => (v.products || []).forEach((p) => p.productId && (views[p.productId] = (views[p.productId] || 0) + v.views)));
    // ưu tiên sản phẩm có nhiều view nhất, bỏ qua sản phẩm vừa cập nhật trong 6 giờ
    const todo = Object.entries(views).sort((a, b) => b[1] - a[1]).map(([id]) => id)
      .filter((id) => !(products[id]?.updatedAt > Date.now() - 6 * 3600e3 && products[id]?.sold != null)).slice(0, maxProducts);
    for (let i = 0; i < todo.length; i++) {
      await setJob({ username, step: 'products', msg: `Đang lấy số "đã bán" sản phẩm ${i + 1}/${todo.length}…` });
      const t = await chrome.tabs.create({ url: `https://shop.tiktok.com/view/product/${todo[i]}?region=VN&locale=vi-VN`, active: false });
      await sleep(8000);
      try { await chrome.tabs.sendMessage(t.id, { type: 'flushNow' }); } catch (_) {}
      try { await chrome.tabs.remove(t.id); } catch (_) {}
      await sleep(2500 + Math.random() * 2500);
    }
    await setJob({ username, step: 'done', msg: `✓ Xong: ${mine.length} video của @${username}, ${todo.length} sản phẩm đã cập nhật.`, videos: mine.length });
  } catch (e) {
    await setJob({ username, step: 'error', msg: 'Lỗi: ' + (e.message || e) });
  }
  analyzing = false;
}
