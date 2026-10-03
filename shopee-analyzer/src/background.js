// Service worker: mở trang, tải ảnh, cập nhật danh sách theo dõi, cảnh báo, gửi Google Sheets.

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type === 'open') chrome.tabs.create({ url: chrome.runtime.getURL(msg.page || 'dashboard.html') });

  if (msg.type === 'downloadImages') {
    (msg.images || []).forEach((url, i) => chrome.downloads.download({
      url, filename: `shopee/${msg.key}/${String(i + 1).padStart(2, '0')}.jpg`, conflictAction: 'uniquify',
    }));
  }

  if (msg.type === 'refreshWatch') { refreshWatch().then((n) => reply({ ok: true, n })); return true; }

  if (msg.type === 'pushSheets') {
    fetch(msg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(msg.payload) })
      .then((r) => r.text())
      .then((t) => reply({ ok: true, text: t }))
      .catch((e) => reply({ ok: false, error: e.message }));
    return true;
  }
});

// ---------- cập nhật danh sách theo dõi ----------
// Mở lần lượt từng sản phẩm trong tab nền để chính trang Shopee tải số liệu mới, rồi đóng tab.
let refreshing = false;
async function refreshWatch() {
  if (refreshing) return 0;
  refreshing = true;
  const { watch = [] } = await chrome.storage.local.get('watch');
  let n = 0;
  for (const key of watch) {
    const [shopid, itemid] = key.split('_');
    const tab = await chrome.tabs.create({ url: `https://shopee.vn/product/${shopid}/${itemid}`, active: false });
    await new Promise((r) => setTimeout(r, 12000));
    try { await chrome.tabs.sendMessage(tab.id, { type: 'flushNow' }); } catch (_) {}
    try { await chrome.tabs.remove(tab.id); } catch (_) {}
    n++;
    await new Promise((r) => setTimeout(r, 4000 + Math.random() * 4000));
  }
  await chrome.storage.local.set({ lastRefresh: Date.now() });
  refreshing = false;
  return n;
}

async function syncAlarm() {
  const { settings = {} } = await chrome.storage.local.get('settings');
  if (settings.autoRefresh) chrome.alarms.create('refreshWatch', { periodInMinutes: 24 * 60, delayInMinutes: 1 });
  else chrome.alarms.clear('refreshWatch');
}
chrome.runtime.onInstalled.addListener(syncAlarm);
chrome.runtime.onStartup.addListener(syncAlarm);
chrome.alarms.onAlarm.addListener((a) => { if (a.name === 'refreshWatch') refreshWatch(); });

// ---------- cảnh báo đổi giá / hết hàng ----------
chrome.storage.onChanged.addListener(async (changes) => {
  if (changes.settings) syncAlarm();
  const { watch = [], settings = {} } = await chrome.storage.local.get(['watch', 'settings']);
  if (settings.notify === false) return;
  const w = new Set(watch);
  for (const k in changes) {
    if (!k.startsWith('p:') || !w.has(k.slice(2))) continue;
    const { oldValue: o, newValue: n } = changes[k];
    if (!o || !n) continue;
    const lines = [];
    if (o.price != null && n.price != null && o.price !== n.price) {
      const d = (n.price - o.price) / o.price;
      lines.push(`Giá: ${Math.round(o.price).toLocaleString('vi-VN')}đ → ${Math.round(n.price).toLocaleString('vi-VN')}đ (${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}%)`);
    }
    if (o.stock > 0 && n.stock === 0) lines.push('Đã HẾT HÀNG');
    if (o.stock === 0 && n.stock > 0) lines.push('Đã có hàng trở lại');
    if (lines.length) {
      chrome.notifications.create('spa-' + k + '-' + Date.now(), {
        type: 'basic', iconUrl: 'icons/icon128.png',
        title: (n.name || 'Sản phẩm theo dõi').slice(0, 60), message: lines.join('\n'),
      });
    }
  }
});
