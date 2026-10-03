importScripts('common.js', 'transcript.js');

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  // Mở trang Dashboard khi người dùng bấm nút nổi trên TikTok.
  if (msg.type === 'openDashboard') {
    const q = msg.author ? '?author=' + encodeURIComponent(msg.author) : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + q) });
  }

  // Lấy nội dung gốc (caption + lời thoại) của 1 video, lưu kèm vào dữ liệu video.
  if (msg.type === 'getOriginal') {
    Transcript.getOriginal(msg)
      .then((r) => new Promise((done) => {
        chrome.storage.local.get({ videos: {} }, ({ videos }) => {
          // Chỉ lưu bản lời thoại mặc định (bản gốc), không ghi đè khi người dùng xem bản dịch.
          if (r.video && !msg.lang) {
            videos[r.id] = {
              ...videos[r.id], ...r.video,
              transcript: r.transcript || videos[r.id]?.transcript || '',
              transcriptLang: r.lang || videos[r.id]?.transcriptLang || '',
            };
          }
          chrome.storage.local.set({ videos }, () => done(r));
        });
      }))
      .then((r) => reply({ ok: true, result: r }))
      .catch((e) => reply({ ok: false, error: e.message || String(e) }));
    return true; // trả lời bất đồng bộ
  }
});
