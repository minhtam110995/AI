// Chạy trong "MAIN world" của trang TikTok: nghe các phản hồi API mà chính trang
// đã tải (danh sách video, thông tin kênh, tìm kiếm...) rồi chuyển sang content.js.
// Không gửi thêm request nào, chỉ đọc dữ liệu trang đã nhận.
(() => {
  if (window.__TTA_INJECTED__) return;
  window.__TTA_INJECTED__ = true;

  const WATCH = /\/api\/(post\/item_list|recommend\/item_list|related\/item_list|challenge\/item_list|music\/item_list|search\/|user\/detail|item\/detail|repost\/item_list|favorite\/item_list|preload\/item_list|comment\/list|explore\/item_list|user\/playlist)/;

  const emit = (url, text) => {
    if (!text || text[0] !== '{') return;
    try {
      window.postMessage({ __tta: true, kind: 'api', url, data: JSON.parse(text) }, '*');
    } catch (_) { /* không phải JSON */ }
  };

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (WATCH.test(url)) res.clone().text().then((t) => emit(url, t)).catch(() => {});
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__ttaUrl = String(url || '');
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (WATCH.test(this.__ttaUrl || '')) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') emit(this.__ttaUrl, this.responseText);
          else if (this.responseType === 'json') emit(this.__ttaUrl, JSON.stringify(this.response));
        } catch (_) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
