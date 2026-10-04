// Chạy trong "MAIN world" của Facebook: đọc phản hồi GraphQL mà chính trang đã tải
// (bài viết, Reels, video) rồi chuyển sang content.js. Không tự gửi request nào.
(() => {
  if (window.__FBA_INJECTED__) return;
  window.__FBA_INJECTED__ = true;
  const WATCH = /\/api\/graphql\/|\/ajax\/(route-definition|bulk-route-definitions|navigation)/;
  const emit = (text) => {
    if (!text || text.length < 50) return;
    if (!/creation_time|short_form_video_context|reaction_count|play_count|follower_count/.test(text)) return;
    window.postMessage({ __fba: true, kind: 'api', text }, '*');
  };
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const res = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (WATCH.test(url)) res.clone().text().then(emit).catch(() => {});
    } catch (_) {}
    return res;
  };
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__fbaUrl = String(url || '');
    return origOpen.call(this, method, url, ...rest);
  };
  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (WATCH.test(this.__fbaUrl || '')) {
      this.addEventListener('load', () => {
        try { if (this.responseType === '' || this.responseType === 'text') emit(this.responseText); } catch (_) {}
      });
    }
    return origSend.apply(this, args);
  };
})();
