// Hàm dùng chung cho content script, popup và dashboard.
const TTA = (() => {
  const num = (v) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  };

  // Chuẩn hoá một video TikTok (itemStruct) về dạng gọn để lưu.
  function normalizeVideo(it) {
    if (!it || !it.id || !it.stats) return null;
    const s = it.statsV2 || it.stats;
    const a = it.author || {};
    const tags = new Set();
    (it.textExtra || []).forEach((t) => t.hashtagName && tags.add(t.hashtagName.toLowerCase()));
    (it.challenges || []).forEach((c) => c.title && tags.add(c.title.toLowerCase()));
    return {
      id: String(it.id),
      author: a.uniqueId || it.authorUniqueId || '',
      nickname: a.nickname || '',
      desc: it.desc || '',
      createTime: num(it.createTime),
      duration: num(it.video?.duration),
      cover: it.video?.cover || it.video?.originCover || '',
      music: it.music ? `${it.music.title || ''}${it.music.authorName ? ' – ' + it.music.authorName : ''}` : '',
      isAd: !!it.isAd,
      views: num(s.playCount),
      likes: num(s.diggCount),
      comments: num(s.commentCount),
      shares: num(s.shareCount),
      saves: num(s.collectCount),
      hashtags: [...tags],
      seenAt: Date.now(),
    };
  }

  function normalizeUser(info) {
    const u = info?.user;
    const st = info?.stats || info?.statsV2;
    if (!u?.uniqueId || !st) return null;
    return {
      uniqueId: u.uniqueId,
      nickname: u.nickname || '',
      avatar: u.avatarThumb || u.avatarMedlarger || '',
      signature: u.signature || '',
      verified: !!u.verified,
      followers: num(st.followerCount),
      following: num(st.followingCount),
      hearts: num(st.heartCount ?? st.heart),
      videoCount: num(st.videoCount),
    };
  }

  // Duyệt toàn bộ JSON để tìm video và kênh, không phụ thuộc cấu trúc API cụ thể.
  function extract(json) {
    const videos = [];
    const users = [];
    const seen = new WeakSet();
    const walk = (o, depth) => {
      if (!o || typeof o !== 'object' || depth > 12 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { o.forEach((x) => walk(x, depth + 1)); return; }
      if (o.id && o.stats && 'createTime' in o && ('playCount' in o.stats || 'diggCount' in o.stats)) {
        const v = normalizeVideo(o);
        if (v) videos.push(v);
      }
      if (o.user?.uniqueId && o.stats && 'followerCount' in o.stats) {
        const u = normalizeUser(o);
        if (u) users.push(u);
      }
      for (const k in o) walk(o[k], depth + 1);
    };
    walk(json, 0);
    return { videos, users };
  }

  const engagement = (v) => v.likes + v.comments + v.shares + v.saves;
  const er = (v) => (v.views > 0 ? engagement(v) / v.views : 0);

  const fmt = (n) => {
    if (!Number.isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  };
  const pct = (x, d = 1) => (Number.isFinite(x) ? (x * 100).toFixed(d) + '%' : '–');
  const median = (arr) => {
    if (!arr.length) return 0;
    const s = [...arr].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const fmtDate = (sec) => (sec ? new Date(sec * 1000).toLocaleDateString('vi-VN') : '–');

  const load = () => new Promise((r) => chrome.storage.local.get({ videos: {}, users: {} }, r));

  function toCSV(videos) {
    const cols = ['id', 'author', 'createTime', 'views', 'likes', 'comments', 'shares', 'saves', 'er', 'duration', 'hashtags', 'music', 'desc', 'transcript', 'url'];
    const esc = (x) => {
      const s = String(x ?? '');
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const rows = videos.map((v) => [
      v.id, v.author, v.createTime ? new Date(v.createTime * 1000).toISOString() : '',
      v.views, v.likes, v.comments, v.shares, v.saves, er(v).toFixed(4), v.duration,
      v.hashtags.map((h) => '#' + h).join(' '), v.music, v.desc, v.transcript || '',
      `https://www.tiktok.com/@${v.author}/video/${v.id}`,
    ].map(esc).join(','));
    return '﻿' + cols.join(',') + '\n' + rows.join('\n');
  }

  function download(name, text, type = 'text/csv') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return { extract, normalizeVideo, normalizeUser, engagement, er, fmt, pct, median, fmtDate, load, toCSV, download };
})();
