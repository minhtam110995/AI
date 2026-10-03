const $ = (s) => document.querySelector(s);
let tab = null;
let ctx = null;

const tile = (label, value) => `<div class="tile"><b>${value}</b><span>${label}</span></div>`;
const open = (page) => chrome.tabs.create({ url: chrome.runtime.getURL(page) });

async function render() {
  const db = await SPA.loadAll();
  const ps = Object.values(db.products);
  const c = ctx?.ctx;
  const icon = { kw: '🔍', shop: '🏪', cat: '📂' };
  const here = c ? db.keywords[c.key] : null;
  $('#tiles').innerHTML = (c ? `<div class="tile" style="grid-column:1/-1"><b>${here ? Object.keys(here.items).length : 0} SP</b><span>đã lưu trong phiên ${icon[c.type]} ${c.label.replace(/</g, '&lt;')}</span></div>` : '') +
    tile('Sản phẩm đã lưu', SPA.fmt(ps.length)) +
    tile('Shop', SPA.fmt(Object.keys(db.shops).length || new Set(ps.map((p) => p.shopid)).size)) +
    tile('Phiên đã quét', SPA.fmt(Object.keys(db.keywords).length)) +
    tile('Đang theo dõi', SPA.fmt(db.watch.length));
}

async function init() {
  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (/^https:\/\/shopee\.vn\//.test(tab?.url || '')) {
    try {
      ctx = await chrome.tabs.sendMessage(tab.id, { type: 'context' });
      $('#ctx').textContent = ctx.productKey ? 'Đang xem trang sản phẩm' : `Trang này: ${ctx.pageCount || 0} sản phẩm · mới lưu ${ctx.newCount}`;
      $(ctx.productKey ? '#productBox' : '#crawlBox').classList.remove('hidden');
    } catch (_) {
      $('#ctx').textContent = 'Hãy tải lại (F5) trang Shopee để bắt đầu.';
    }
  } else {
    $('#ctx').textContent = 'Không ở trang Shopee · đang xem dữ liệu đã lưu';
  }
  render();
}

$('#open').onclick = () => open('dashboard.html' + (ctx?.productKey ? '#product=' + ctx.productKey : ctx?.ctx ? '#market&ctx=' + encodeURIComponent(ctx.ctx.key) : ''));
$('#watchBtn').onclick = () => open('dashboard.html#watch');
$('#profit').onclick = () => open('dashboard.html#profit=');
$('#crawl').onclick = () => { chrome.tabs.sendMessage(tab.id, { type: 'crawl', pages: Number($('#pages').value) }); window.close(); };
$('#stop').onclick = () => chrome.tabs.sendMessage(tab.id, { type: 'stopCrawl' });
$('#reviews').onclick = () => { chrome.tabs.sendMessage(tab.id, { type: 'reviews', max: 500 }); window.close(); };
init();
