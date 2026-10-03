// Mở trang Dashboard khi người dùng bấm nút nổi trên TikTok.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'openDashboard') {
    const q = msg.author ? '?author=' + encodeURIComponent(msg.author) : '';
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html' + q) });
  }
});
