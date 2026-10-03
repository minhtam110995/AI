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

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const onTikTok = /^https:\/\/www\.tiktok\.com\//.test(tab?.url || '');
  if (onTikTok) {
    try {
      const ctx = await chrome.tabs.sendMessage(tab.id, { type: 'context' });
      profile = ctx?.profile || '';
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
$('#scroll').onclick = () => chrome.tabs.sendMessage(tab.id, { type: 'autoscroll', times: 30 });
$('#stop').onclick = () => chrome.tabs.sendMessage(tab.id, { type: 'stopScroll' });
$('#csv').onclick = async () => {
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
