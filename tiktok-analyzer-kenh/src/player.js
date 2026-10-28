// Trình phát chạy trong trang của tiện ích (nhúng vào TikTok bằng iframe).
// Trang tiện ích tải video với cookie đăng nhập + Referer tiktok.com (do luật DNR thêm),
// không bị CORS chặn; nếu phát thẳng không được thì tải về bộ nhớ (blob) rồi phát.
(() => {
  const video = document.querySelector('video');
  const up = (m) => parent.postMessage({ tta: 'pl', ...m }, '*');
  const host = (u) => { try { return new URL(u).host; } catch (_) { return '?'; } };
  const ac = new AbortController();

  // Chờ video phát được, lỗi, hoặc quá thời gian → 'ok' | mã lỗi | 'timeout'
  function play(src, ms) {
    return new Promise((done) => {
      let t;
      const end = (r) => { clearTimeout(t); video.removeEventListener('loadeddata', onOk); video.removeEventListener('error', onErr); done(r); };
      const onOk = () => end('ok');
      const onErr = () => end(video.error?.code || 'error');
      video.addEventListener('loadeddata', onOk);
      video.addEventListener('error', onErr);
      t = setTimeout(() => end(video.readyState >= 2 ? 'ok' : 'timeout'), ms);
      video.src = src;
      video.play().catch(() => {});
    });
  }

  // Đọc mã codec trong phần đầu file mp4 (avc1 = H.264, hvc1/hev1 = H.265)
  async function codecOf(blob) {
    const s = new TextDecoder('latin1').decode(await blob.slice(0, 256 * 1024).arrayBuffer());
    return (s.match(/avc1|hvc1|hev1|av01|vp09/) || [])[0] || (/webm|matroska/i.test(s) ? 'webm' : '?');
  }

  async function attempt(url, rec) {
    up({ type: 'status', text: `Đang phát (nguồn ${rec.n})…` });
    rec.direct = await play(url, 8000);
    if (rec.direct === 'ok') return true;
    // Không phát thẳng được → hỏi máy chủ trả gì, nếu là video thì tải về rồi phát
    up({ type: 'status', text: `Nguồn ${rec.n}: đang tải video về bộ nhớ…` });
    try {
      const res = await fetch(url, { credentials: 'include', cache: 'no-store', signal: ac.signal });
      rec.status = res.status;
      rec.type = res.headers.get('content-type') || '';
      if (!res.ok) { res.body?.cancel(); return false; }
      const blob = await res.blob();
      rec.size = blob.size;
      rec.codec = await codecOf(blob);
      if (blob.size < 20000) return false; // không phải file video thật
      const type = /video|mp4|webm/.test(rec.type) ? rec.type : (rec.codec === 'webm' ? 'video/webm' : 'video/mp4');
      rec.blob = await play(URL.createObjectURL(new Blob([blob], { type })), 10000);
      return rec.blob === 'ok';
    } catch (e) { rec.fetchError = e.message; return false; }
  }

  // Chỉ tải từ máy chủ TikTok
  const allowed = (u) => /^https:\/\/[^/]+\.(tiktok\.com|tiktokcdn(-us|-eu)?\.com|tiktokv\.(com|us|eu)|byteoversea\.com|ibytedtos\.com)\//.test(String(u));

  async function run({ id, author, urls }) {
    urls = (urls || []).filter(allowed);
    const diag = {
      id, fromPage: urls.length, tried: [], fresh: null,
      hevc: video.canPlayType('video/mp4; codecs="hvc1.1.6.L93.B0"') || 'no',
    };
    const done = new Set();
    let n = 0;
    const tryList = async (list) => {
      for (const url of list) {
        if (done.has(url)) continue;
        done.add(url);
        const rec = { n: ++n, host: host(url) };
        diag.tried.push(rec);
        if (await attempt(url, rec)) return true;
      }
      return false;
    };
    if (await tryList(urls)) return up({ type: 'ok', diag });
    up({ type: 'status', text: 'Đang tìm địa chỉ video ở nguồn khác…' });
    const r = await chrome.runtime.sendMessage({ type: 'getPlayUrls', id, author }).catch(() => null);
    diag.fresh = r?.diag || null;
    if (r?.products?.length) up({ type: 'products', products: r.products });
    if (await tryList((r?.urls || []).filter(allowed))) return up({ type: 'ok', diag });
    video.removeAttribute('src');
    up({ type: 'fail', diag });
  }

  addEventListener('message', (e) => {
    if (e.source === parent && e.data?.tta === 'start') run(e.data);
  });
  addEventListener('pagehide', () => ac.abort());
  up({ type: 'ready' });
})();
