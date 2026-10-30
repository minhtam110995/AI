const $ = (s) => document.querySelector(s);
let tab = null;
let profile = '';

function tile(label, value) {
  return `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
}

async function render() {
  const { videos, users } = await TTA.load();
  const all = Object.values(videos);
  let list = all;
  const u = profile && users[profile];
  if (profile) list = all.filter((v) => v.author === profile);
  const views = list.map((v) => v.views);
  const ers = list.filter((v) => v.views > 0).map(TTA.er);
  $('#tiles').innerHTML = profile
    ? tile('Follower', u ? TTA.fmt(u.followers) : '–') +
      tile('Video đã thu thập', `${list.length}${u ? ' / ' + TTA.fmt(u.videoCount) : ''}`) +
      tile('View trung vị', TTA.fmt(TTA.median(views))) +
      tile('Tỉ lệ tương tác TB', TTA.pct(ers.reduce((a, b) => a + b, 0) / (ers.length || 1)))
    : tile('Tổng video', TTA.fmt(all.length)) +
      tile('Số kênh', TTA.fmt(new Set(all.map((v) => v.author)).size)) +
      tile('Tổng lượt xem', TTA.fmt(all.reduce((a, v) => a + v.views, 0))) +
      tile('Kênh có hồ sơ', TTA.fmt(Object.keys(users).length));
}

let auth = null;
async function showAccount() {
  auth = await Auth.refresh();
  const locked = auth.plan === 'none';
  $('#loginGate').classList.toggle('hidden', !locked);
  $('#mainBox').classList.toggle('hidden', locked);
  if (locked) {
    $('#gateWhy').textContent = auth.loggedIn ? Auth.lockMsg(auth).replace(/^🔒\s*/, '') : '';
    $('#goLogin').textContent = auth.loggedIn ? '⚙️ Mở trang Tài khoản' : '🔐 Đăng nhập / Đăng ký';
  }
  if (auth.configured && auth.loggedIn) {
    const name = auth.plan === 'pro' ? (auth.isTrial ? 'Dùng thử Pro' : 'Pro') : Auth.PLANS[auth.plan]?.name || auth.plan;
    const left = auth.daysLeft != null ? ` · còn ${auth.daysLeft} ngày` : '';
    $('#acct').innerHTML = `<span>${auth.email || ''} · <span class="pbadge">${name}${left}</span></span><a id="accLink">${auth.plan === 'free' || (auth.daysLeft != null && auth.daysLeft <= 3) ? '⭐ Nâng cấp' : 'Tài khoản'}</a>`;
    $('#acct').classList.remove('hidden');
    $('#accLink').onclick = () => chrome.tabs.create({ url: Auth.accountUrl() });
  }
  if (!auth.limits.csv) $('#csv').textContent = '🔒 Xuất CSV (Pro)';
  return locked;
}
$('#goLogin').onclick = () => chrome.tabs.create({ url: Auth.accountUrl() });

async function init() {
  if (await showAccount()) return;
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onTikTok = /^https:\/\/www\.tiktok\.com\//.test(tab?.url || '');
  if (onTikTok) {
    try {
      const ctx = await chrome.tabs.sendMessage(tab.id, { type: 'context' });
      profile = ctx?.profile || '';
      if (ctx?.video) { $('#cmts').classList.remove('hidden'); }
      if (profile) {
        const { watchChannels = [] } = await chrome.storage.local.get('watchChannels');
        $('#watchCh').textContent = watchChannels.includes(profile) ? `★ Đang theo dõi @${profile} (bấm để bỏ)` : `⭐ Theo dõi kênh @${profile}`;
        $('#watchCh').classList.remove('hidden');
      }
      $('#ctx').textContent = profile ? `Kênh: @${profile} · +${ctx.sessionCount} video mới phiên này` : `Đang ở TikTok · +${ctx?.sessionCount || 0} video mới phiên này`;
      $('#scrollBox').classList.remove('hidden');
    } catch (_) {
      $('#ctx').textContent = 'Hãy tải lại (F5) trang TikTok để bắt đầu thu thập.';
    }
  } else {
    $('#ctx').textContent = 'Không ở trang TikTok · đang xem toàn bộ dữ liệu đã lưu';
  }
  render();
}

$('#open').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + (profile ? '?author=' + encodeURIComponent(profile) : '')) });
$('#kwOpen').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html#keyword') });
$('#original').onclick = () => {
  const isVideo = /tiktok\.com\/.*\/(video|photo)\/\d+/.test(tab?.url || '');
  chrome.tabs.create({ url: chrome.runtime.getURL('original.html' + (isVideo ? '?link=' + encodeURIComponent(tab.url) : '')) });
};
$('#cmts').onclick = () => { chrome.tabs.sendMessage(tab.id, { type: 'comments', max: 500 }); window.close(); };
$('#watchCh').onclick = async () => {
  const { watchChannels = [] } = await chrome.storage.local.get('watchChannels');
  const next = watchChannels.includes(profile) ? watchChannels.filter((u) => u !== profile) : [...watchChannels, profile];
  await chrome.storage.local.set({ watchChannels: next });
  $('#watchCh').textContent = next.includes(profile) ? `★ Đang theo dõi @${profile} (bấm để bỏ)` : `⭐ Theo dõi kênh @${profile}`;
};
$('#scroll').onclick = () => chrome.tabs.sendMessage(tab.id, { type: 'autoscroll', times: 30 });
$('#stop').onclick = () => chrome.tabs.sendMessage(tab.id, { type: 'stopScroll' });
$('#csv').onclick = async () => {
  if (!auth?.limits.csv) { chrome.tabs.create({ url: Auth.accountUrl() }); return; }
  const { videos } = await TTA.load();
  let list = Object.values(videos);
  if (profile) list = list.filter((v) => v.author === profile);
  TTA.download(`tiktok-${profile || 'all'}-${new Date().toISOString().slice(0, 10)}.csv`, TTA.toCSV(list));
};
$('#clear').onclick = () => {
  if (confirm('Xoá toàn bộ dữ liệu đã thu thập?')) chrome.storage.local.set({ videos: {}, users: {} }, render);
};
chrome.storage.onChanged.addListener(render);
init();
