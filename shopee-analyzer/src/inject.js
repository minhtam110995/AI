// Chạy trong "MAIN world" của trang Shopee: đọc các phản hồi API mà chính trang đã tải
// (tìm kiếm, danh mục, sản phẩm, shop, đánh giá) rồi chuyển sang content.js.
// Không tự gửi request nào.
(() => {
  if (window.__SPA_INJECTED__) return;
  window.__SPA_INJECTED__ = true;

  const WATCH = /\/api\/v[24]\//;
  const SKIP = /\/(tracking|log|event|ads_track|metrics|abtest|cart\/get_mini|notification)/;

  const emit = (url, text) => {
    if (!text || (text[0] !== '{' && text[0] !== '[')) return;
    try {
      window.postMessage({ __spa: true, kind: 'api', url: new URL(url, location.href).href, data: JSON.parse(text) }, '*');
    } catch (_) { /* không phải JSON */ }
  };
  const want = (url) => WATCH.test(url) && !SKIP.test(url);

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (want(url)) res.clone().text().then((t) => emit(url, t)).catch(() => {});
    } catch (_) {}
    return res;
  };

  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__spaUrl = String(url || '');
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (want(this.__spaUrl || '')) {
      this.addEventListener('load', () => {
        try {
          if (this.responseType === '' || this.responseType === 'text') emit(this.__spaUrl, this.responseText);
          else if (this.responseType === 'json') emit(this.__spaUrl, JSON.stringify(this.response));
        } catch (_) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
