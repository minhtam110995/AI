const $ = (s) => document.querySelector(s);
let tab = null, ctx = null;
const tile = (l, v) => `<div class="tile"><b>${v}</b><span>${l}</span></div>`;

async function render() {
  const { posts = {}, pages = {}, watchPages = [] } = await chrome.storage.local.get(['posts', 'pages', 'watchPages']);
  const ps = Object.values(posts);
  const name = ctx?.page?.name;
  const mine = name ? ps.filter((p) => p.page === name) : [];
  $('#tiles').innerHTML = (name ? tile(`bài của ${name.replace(/</g, '&lt;')}`, mine.length) + tile('Reels của trang', mine.filter((p) => p.type === 'reel').length) : '') +
    tile('Tổng bài đã lưu', FBA.fmt(ps.length)) + tile('Fanpage', new Set(ps.map((p) => p.page)).size) +
    tile('Reels đã lưu', ps.filter((p) => p.type === 'reel').length) + tile('Đang theo dõi', watchPages.length);
  if (name) $('#watch').textContent = watchPages.includes(name) ? `★ Đang theo dõi (bấm để bỏ)` : `⭐ Theo dõi fanpage này`;
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (/^https:\/\/(www|web)\.facebook\.com\//.test(tab?.url || '')) {
    try {
      ctx = await chrome.tabs.sendMessage(tab.id, { type: 'context' });
      $('#ctx').textContent = ctx.page ? `Fanpage: ${ctx.page.name} · +${ctx.newCount} bài mới` : `Đang ở Facebook · +${ctx.newCount} bài mới`;
      if (ctx.page) $('#pageBox').classList.remove('hidden');
    } catch (_) { $('#ctx').textContent = 'Hãy tải lại (F5) trang Facebook để bắt đầu.'; }
  } else $('#ctx').textContent = 'Không ở Facebook · đang xem dữ liệu đã lưu';
  render();
}

$('#open').onclick = () => chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + (ctx?.page ? '?page=' + encodeURIComponent(ctx.page.name) : '')) });
$('#scroll').onclick = () => { chrome.tabs.sendMessage(tab.id, { type: 'autoscroll', times: 30 }); window.close(); };
$('#reels').onclick = async () => {
  const url = `https://www.facebook.com/${ctx.page.slug}/reels/`;
  if (!ctx.page.reels) { await chrome.tabs.update(tab.id, { url }); await new Promise((r) => setTimeout(r, 6000)); }
  chrome.tabs.sendMessage(tab.id, { type: 'autoscroll', times: 30 });
  window.close();
};
$('#stop').onclick = () => chrome.tabs.sendMessage(tab.id, { type: 'stopScroll' });
$('#watch').onclick = async () => {
  const name = ctx.page.name;
  const { watchPages = [] } = await chrome.storage.local.get('watchPages');
  await chrome.storage.local.set({ watchPages: watchPages.includes(name) ? watchPages.filter((x) => x !== name) : [...watchPages, name] });
  render();
};
$('#reset').onclick = async () => {
  if (!confirm('Xoá TOÀN BỘ dữ liệu đã lưu (bài viết, Reels, fanpage, danh sách theo dõi)?')) return;
  const all = await chrome.storage.local.get(null);
  await chrome.storage.local.remove(Object.keys(all).filter((k) => k !== 'fbSettings'));
  render();
};
init();
