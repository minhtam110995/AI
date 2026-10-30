importScripts('config.js', 'common.js', 'transcript.js', 'auth.js');

// Lấy nội dung gốc (caption + lời thoại) của 1 video, lưu kèm vào dữ liệu video.
function handleOriginal(msg) {
  return Transcript.getOriginal(msg).then((r) => new Promise((done) => {
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
  }));
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // Mở trang Dashboard khi người dùng bấm nút nổi trên TikTok.
  if (msg.type === 'openDashboard') {
    const q = msg.author ? '?author=' + encodeURIComponent(msg.author) : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + q + (msg.hash ? '#' + msg.hash : '')) });
  }

  // Tài khoản / gói cước (cho cột phân tích trên trang TikTok — gọi máy chủ từ nền, không từ trang)
  if (msg.type === 'authState') { Auth.refresh(!!msg.force).then(reply); return true; }
  if (msg.type === 'quota') { Auth.quota(msg.kind).then(reply); return true; }
  if (msg.type === 'useQuota') { Auth.useQuota(msg.kind, msg.n || 1).then(reply); return true; }
  if (msg.type === 'openAccount') { chrome.tabs.create({ url: Auth.accountUrl() }); reply({ ok: true }); }

  if (msg.type === 'getOriginal') {
    // Lời thoại: gói Miễn phí giới hạn số video/ngày (chỉ trừ lượt khi lấy được lời thoại)
    (async () => {
      const q = await Auth.quota('tr');
      if (q.left <= 0) {
        const m = q.st.plan === 'none' ? Auth.lockMsg(q.st) : `🔒 Gói Miễn phí được lấy lời thoại ${q.max} video mỗi ngày (đã dùng hết). Nâng cấp Pro để không giới hạn.`;
        return { ok: false, locked: true, error: m };
      }
      const r = await handleOriginal(msg);
      if (r?.transcript) await Auth.useQuota('tr');
      return { ok: true, result: r };
    })().then(reply).catch((e) => reply({ ok: false, error: e.message || String(e) }));
    return true; // trả lời bất đồng bộ
  }

  if (msg.type === 'refreshChannels') { refreshChannels().then((n) => reply({ ok: true, n })); return true; }
  if (msg.type === 'runWatched') { runWatchedKeywords(); reply({ ok: true }); }
  if (msg.type === 'searchKeyword') { searchKeyword(msg.keyword, msg.scrolls || 15); reply({ ok: true }); }
  if (msg.type === 'analyzeChannel') { reply({ ok: !!channelOf(msg.input) }); analyzeChannel(msg.input, msg.scrolls || 25, { comments: msg.comments !== false, transcripts: !!msg.transcripts }); }
  if (msg.type === 'channelComments') { reply({ ok: !analyzing }); channelComments(msg.user, msg.ids); }
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
// TikTok chặn tạm (HTTP 403 / trang lỗi): trang không chạy được content script → không trả lời.
const BLOCKED_MSG = '⛔ TikTok đang chặn tạm truy cập (lỗi 403) vì có nhiều lượt mở tự động. Hãy: (1) mở tiktok.com ở tab thường xem có vào được không, đăng nhập / giải captcha nếu có; (2) tắt VPN / proxy nếu đang bật; (3) đợi 15–30 phút rồi thử lại, chọn mức quét "Nhanh".';
async function pageAlive(tabId, ms = 20000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if (await chrome.tabs.sendMessage(tabId, { type: 'context' })) return true; } catch (_) {}
    await sleep(1500);
  }
  return false;
}

async function openWorkWindow(url, { wide = false } = {}) {
  // Lấy bình luận cần cửa sổ rộng: TikTok chỉ hiện khung bình luận bên phải ở giao diện máy tính
  // Màn hình nhỏ: Chrome từ chối cửa sổ quá to → lùi dần về kích thước nhỏ hơn
  const sizes = wide ? [[1200, 900], [1000, 760], [520, 900], [520, 640]] : [[520, 900], [520, 640]];
  let w = null, err = null;
  for (const [width, height] of sizes) {
    try { w = await chrome.windows.create({ url, type: 'popup', focused: true, width, height, left: 20, top: 20 }); break; } catch (e) { err = e; }
  }
  if (!w) w = await chrome.windows.create({ url, type: 'popup', focused: true }).catch(() => { throw err; });
  return { winId: w.id, tabId: w.tabs[0].id };
}
async function searchKeyword(input, scrolls, { silent = false } = {}) {
  const keyword = String(input || '').trim();
  if (!keyword || searching) return;
  if (!silent) {
    const u = await Auth.useQuota('search');
    if (!u.ok) { await chrome.storage.local.set({ kwJob: { keyword, step: 'error', msg: u.msg, locked: true, t: Date.now() } }); return; }
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
    if (!(await pageAlive(win.tabId))) throw new Error(BLOCKED_MSG);
    await sleep(6000);
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
    await setKw({ step: 'error', msg: (e.message || '').startsWith('⛔') ? e.message : 'Lỗi: ' + (e.message || e) });
  }
  if (win) try { await chrome.windows.remove(win.winId); } catch (_) {}
  searching = false;
}

// ---------- Phân tích kênh: dán link / @tên kênh → tự thu thập ----------
// Mở trang kênh trong cửa sổ nhỏ, tự cuộn lấy toàn bộ video, rồi lấy lời thoại của các video nhiều view nhất.
const channelOf = (input) => {
  const s = String(input || '').trim();
  const m = s.match(/tiktok\.com\/@([\w.-]+)/i) || s.match(/^@?([\w.-]{2,})$/);
  return m ? m[1] : '';
};
let analyzing = false;
const COMMENT_VIDEOS = 3;
const channelVideos = async (user) => Object.values((await chrome.storage.local.get('videos')).videos || {})
  .filter((v) => (v.author || '').toLowerCase() === user.toLowerCase() && !v.isAd);

// Lấy bình luận của các video nhiều view nhất (chưa có bình luận) trong cửa sổ làm việc đang mở
async function commentsForTop(win, user, vids, setJob, ids = null) {
  // Video cần lấy: theo danh sách Dashboard gửi (top của khoảng thời gian đang lọc),
  // nếu không có thì lấy top view trong 90 ngày (đủ 3 video), không thì toàn kênh.
  const recent = vids.filter((v) => v.createTime > Date.now() / 1000 - 90 * 86400);
  const pool = ids?.length ? ids.map((id) => vids.find((v) => v.id === id)).filter(Boolean) : (recent.length >= COMMENT_VIDEOS ? recent : vids);
  const have = await chrome.storage.local.get(pool.map((v) => 'c:' + v.id));
  const todo = [...pool].sort((a, b) => b.views - a.views).filter((v) => !(have['c:' + v.id] || []).length).slice(0, COMMENT_VIDEOS);
  let got = 0;
  for (let i = 0; i < todo.length; i++) {
    await setJob({ step: 'run', msg: `Đang lấy bình luận video top ${i + 1}/${todo.length} của @${user}…` });
    if (i) await sleep(4000 + Math.random() * 4000); // nghỉ giữa các video để TikTok không chặn
    await chrome.tabs.update(win.tabId, { url: `https://www.tiktok.com/@${encodeURIComponent(todo[i].author)}/video/${todo[i].id}` });
    await sleep(3000);
    if (!(await pageAlive(win.tabId))) throw new Error(BLOCKED_MSG);
    await sleep(4000);
    const timeout = sleep(90000);
    try { await Promise.race([chrome.tabs.sendMessage(win.tabId, { type: 'comments', max: 150, wait: true }), timeout]); } catch (_) {}
    try { await chrome.tabs.sendMessage(win.tabId, { type: 'flushNow' }); } catch (_) {}
    await sleep(1000);
    const k = 'c:' + todo[i].id;
    if (((await chrome.storage.local.get(k))[k] || []).length) got++;
  }
  return { tried: todo.length, got };
}

async function channelComments(user, ids) {
  if (!user || analyzing) return;
  const st = await Auth.refresh();
  if (!st.limits.comments) {
    await chrome.storage.local.set({ chJob: { user, step: 'error', msg: st.plan === 'none' ? Auth.lockMsg(st) : '🔒 Lấy bình luận khán giả có trong gói Pro. Mở trang Tài khoản để nâng cấp.', locked: true, t: Date.now(), noPick: true } });
    return;
  }
  analyzing = true;
  const setJob = (job) => chrome.storage.local.set({ chJob: { user, ...job, t: Date.now(), noPick: true } });
  let win = null;
  try {
    const vids = await channelVideos(user);
    win = await openWorkWindow(`https://www.tiktok.com/@${encodeURIComponent(user)}`, { wide: true });
    const r = await commentsForTop(win, user, vids, setJob, ids);
    await setJob({ step: 'done', msg: !r.tried ? `Các video top của @${user} đã có bình luận.`
      : r.got ? `✓ Đã lấy bình luận ${r.got}/${r.tried} video top của @${user}.`
      : `⚠️ Không lấy được bình luận (${r.tried} video). Hãy đăng nhập tiktok.com, mở thử 1 video xem có hiện bình luận không (captcha?), rồi thử lại.` });
  } catch (e) {
    await setJob({ step: 'error', msg: (e.message || '').startsWith('⛔') ? e.message : 'Lỗi: ' + (e.message || e) });
  }
  if (win) try { await chrome.windows.remove(win.winId); } catch (_) {}
  analyzing = false;
}

async function analyzeChannel(input, scrolls, { comments = true, transcripts = false } = {}) {
  const user = channelOf(input);
  if (!user || analyzing) return;
  const u = await Auth.useQuota('channel');
  if (!u.ok) { await chrome.storage.local.set({ chJob: { user, step: 'error', msg: u.msg, locked: true, t: Date.now() } }); return; }
  scrolls = Math.min(scrolls, u.st.limits.maxDepth === 10 ? 10 : scrolls); // Miễn phí: chỉ quét nhanh
  if (!u.st.limits.comments) comments = false;
  if (!u.st.limits.bulkTranscript) transcripts = false;
  analyzing = true;
  const setJob = (job) => chrome.storage.local.set({ chJob: { user, ...job, t: Date.now() } });
  const mine = () => channelVideos(user);
  let win = null;
  try {
    const before = (await mine()).length;
    await setJob({ step: 'run', msg: `Đang mở kênh @${user} trong cửa sổ nhỏ (để cửa sổ đó mở, đừng thu nhỏ)…` });
    win = await openWorkWindow(`https://www.tiktok.com/@${encodeURIComponent(user)}`);
    if (!(await pageAlive(win.tabId))) throw new Error(BLOCKED_MSG);
    await sleep(6000);
    const tick = setInterval(async () => setJob({ step: 'run', msg: `Đang cuộn kênh @${user}: ${(await mine()).length} video…` }), 5000);
    try { await chrome.tabs.sendMessage(win.tabId, { type: 'autoscroll', times: scrolls, wait: true }); } catch (_) { await sleep(scrolls * 3000); }
    clearInterval(tick);
    try { await chrome.tabs.sendMessage(win.tabId, { type: 'flushNow' }); } catch (_) {}
    await sleep(1000);
    if (comments) {
      // chuyển sang cửa sổ rộng để TikTok hiện khung bình luận
      for (const width of [1200, 1000]) { try { await chrome.windows.update(win.winId, { width }); break; } catch (_) {} }
      await commentsForTop(win, user, await mine(), setJob);
    }
    try { await chrome.windows.remove(win.winId); } catch (_) {}
    win = null;

    const vids = await mine();
    if (!vids.length) {
      await setJob({ step: 'error', msg: `Không lấy được video nào của @${user}. Kiểm tra lại tên kênh, hoặc mở tiktok.com, đăng nhập (giải captcha) rồi thử lại.` });
    } else {
      // Lời thoại cho 10 video nhiều view nhất (để phân tích hook chính xác hơn)
      // Chỉ khi người dùng chọn: tải trang video ở chế độ nền dễ khiến TikTok chặn tạm (403)
      const todo = transcripts ? vids.sort((a, b) => b.views - a.views).slice(0, 10).filter((v) => !v.transcript) : [];
      for (let i = 0; i < todo.length; i++) {
        await setJob({ step: 'run', msg: `Đã có ${vids.length} video. Đang lấy lời thoại video top ${i + 1}/${todo.length}…` });
        const err = await handleOriginal({ author: todo[i].author, id: todo[i].id }).then(() => null, (e) => e);
        if (/HTTP 4(03|29)/.test(err?.message || '')) throw new Error(BLOCKED_MSG); // bị chặn → dừng ngay, không gọi tiếp
        await sleep(2000 + Math.random() * 1500);
      }
      await setJob({ step: 'done', msg: `✓ Xong: có ${vids.length} video của @${user} (+${Math.max(0, vids.length - before)} video mới lần này).`, n: vids.length });
    }
  } catch (e) {
    await setJob({ step: 'error', msg: (e.message || '').startsWith('⛔') ? e.message : 'Lỗi: ' + (e.message || e) });
  }
  if (win) try { await chrome.windows.remove(win.winId); } catch (_) {}
  analyzing = false;
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

