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
      musicId: it.music?.id ? String(it.music.id) : '',
      musicOriginal: !!it.music?.original,
      hasSpeech: !!((it.video?.subtitleInfos || []).length || (it.video?.claInfo?.captionInfos || []).length),
      authorFollowers: it.authorStats ? num(it.authorStats.followerCount) : null,
      products: shopProducts(it),
      seenAt: Date.now(),
    };
  }

  // Sản phẩm gắn giỏ (TikTok Shop) – đọc từ "anchors" của video, nếu có.
  function shopProducts(it) {
    const out = [];
    for (const a of it.anchors || []) {
      let extra = {};
      try { extra = typeof a.extra === 'string' ? JSON.parse(a.extra) : a.extra || {}; } catch (_) {}
      const title = a.keyword || a.description || extra.title || extra.product_name || '';
      const looksShop = /shop|product|ecom/i.test(String(a.type) + (a.icon?.urlList?.[0] || '') + (a.schema || '') + JSON.stringify(a.logExtra || '')) || [33, 35, 72].includes(Number(a.type));
      if (title && looksShop) out.push({ id: String(a.id || title), title, price: extra.price || extra.min_price || null, thumb: a.thumbnail?.urlList?.[0] || '' });
    }
    if (!out.length && it.isECVideo) out.push({ id: 'ec-' + it.id, title: '(Sản phẩm TikTok Shop)', price: null, thumb: '' });
    return out;
  }

  function normalizeComment(o) {
    if (!o.cid || !o.aweme_id || typeof o.text !== 'string') return null;
    return {
      cid: String(o.cid), vid: String(o.aweme_id), text: o.text,
      likes: num(o.digg_count), replies: num(o.reply_comment_total), t: num(o.create_time),
      user: o.user?.nickname || o.user?.unique_id || '',
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
    const comments = [];
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
      if (o.cid && o.aweme_id) {
        const c = normalizeComment(o);
        if (c) comments.push(c);
      }
      for (const k in o) walk(o[k], depth + 1);
    };
    walk(json, 0);
    return { videos, users, comments };
  }

  // ---------- phân tích nội dung (chạy hoàn toàn trên máy) ----------
  const norm = (t) => String(t || '').toLowerCase().normalize('NFC');

  const HOOKS = [
    ['Câu hỏi', /\?|^(bạn có biết|tại sao|vì sao|làm sao|làm thế nào|có phải|ai đã|có ai|bạn đã bao giờ)/],
    ['Con số / danh sách', /(^|\s)\d+\s*(cách|bước|mẹo|lý do|sai lầm|điều|thứ|món|tips?|ngày)/],
    ['POV / nhập vai', /^pov|\bpov\b/],
    ['Cảnh báo / phản bác', /^(đừng|dừng lại|cảnh báo|sai lầm|không ai nói|ngừng|thôi ngay|đừng bao giờ)|sai lầm|đừng mua/],
    ['Gây tò mò', /(bí mật|sự thật|không ngờ|ai cũng|chưa ai|ít ai biết|cuối video|xem đến cuối|bất ngờ|plot twist)/],
    ['Kể chuyện', /^(hôm nay|hôm qua|mình đã|tôi đã|em đã|hồi|câu chuyện|chuyện là|năm \d{4})/],
    ['Kết quả / trước-sau', /(trước và sau|before|after|sau \d+ (ngày|tuần|tháng)|kết quả)/],
  ];
  function hookType(text) {
    const t = norm(text).trim();
    if (!t) return 'Không rõ';
    for (const [name, re] of HOOKS) if (re.test(t)) return name;
    return 'Khác';
  }

  const FORMATS = [
    ['Review / dùng thử', /(review|đánh giá|dùng thử|test thử|trải nghiệm|có đáng)/],
    ['Unbox / đập hộp', /(unbox|đập hộp|mở hộp|khui)/],
    ['Hướng dẫn / mẹo', /(cách |hướng dẫn|mẹo|tips?|tutorial|bước \d|công thức|how to)/],
    ['So sánh', /(so sánh| vs |versus|hay là|nên chọn)/],
    ['Bán hàng / khuyến mãi', /(giảm giá|sale|khuyến mãi|mua ngay|giỏ hàng|link|ưu đãi|freeship|voucher|chốt đơn)/],
    ['Vlog / đời sống', /(vlog|một ngày|daily|cuộc sống|routine|đi chơi)/],
    ['Hài / giải trí', /(hài|funny|troll|trend|meme|thử thách|challenge)/],
  ];
  function formatType(text) {
    const t = norm(text);
    for (const [name, re] of FORMATS) if (re.test(t)) return name;
    return 'Khác';
  }

  // Bình luận có ý định mua
  const INTENT = /(giá|bao nhiêu|bn\b|mấy k|ib|inbox|check ib|mua ở đâu|mua đâu|link|order|đặt hàng|ship|còn hàng|còn không|còn ko|xin link|cho xin|tư vấn|size|địa chỉ|shop ơi|chốt|lấy \d|mua \d|cần mua|muốn mua|bán không|có bán)/;
  const QUESTION = /\?|(không ạ|ko ạ|không vậy|ko vậy|sao ạ|nào ạ|được không|đc ko|có không|có ko|bao lâu|thế nào|như nào|làm sao|ở đâu)/;
  const isIntent = (t) => INTENT.test(norm(t));
  const isQuestion = (t) => QUESTION.test(norm(t));

  const STOP = new Set('và của cho có là các những một được không với này khi đã thì mà rất cũng như để ra vào lại nên nhưng bị từ trong theo sẽ đến hơn nhiều ạ nha nhé ok mình em anh chị bạn thấy dùng còn vẫn đều hết luôn quá lắm thôi rồi ko k kh dc đc vs j gì nào đây đó kia ah à ơi vậy vì do nếu hay hoặc cái thế ai tui tôi mn mọi người video clip'.split(' '));
  function tokens(text) {
    return norm(text).replace(/https?:\/\/\S+/g, ' ').replace(/@\S+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/).filter((w) => w && w.length > 1 && !/^\d+$/.test(w));
  }
  function phrases(texts, top = 25) {
    const counts = new Map();
    for (const text of texts) {
      const t = tokens(text);
      const seen = new Set();
      for (let n = 2; n <= 3; n++) {
        for (let i = 0; i + n <= t.length; i++) {
          const g = t.slice(i, i + n);
          if (STOP.has(g[0]) || STOP.has(g[n - 1])) continue;
          const k = g.join(' ');
          if (seen.has(k)) continue;
          seen.add(k);
          counts.set(k, (counts.get(k) || 0) + 1);
        }
      }
    }
    const arr = [...counts.entries()].filter(([, c]) => c >= 2).map(([phrase, count]) => ({ phrase, count }));
    const tri = arr.filter((c) => c.phrase.split(' ').length === 3);
    return arr.filter((c) => c.phrase.split(' ').length === 3 || !tri.some((x) => x.phrase.includes(c.phrase) && x.count >= c.count * 0.8))
      .sort((a, b) => b.count - a.count).slice(0, top);
  }

  // Câu mở đầu: 1–2 câu phụ đề đầu tiên, nếu chưa có lời thoại thì lấy câu đầu của caption
  function hookText(v) {
    if (v.hookLine) return v.hookLine;
    if (v.transcript) return v.transcript.split(/(?<=[.!?…])\s+/).slice(0, 1).join(' ').slice(0, 160);
    return (v.desc || '').replace(/#\S+/g, '').split(/[.!?\n]/)[0].trim().slice(0, 160);
  }

  // Tốc độ tăng view (view/giờ) giữa 2 lần ghi nhận gần nhất
  function viewVelocity(v) {
    const h = v.hist || [];
    if (h.length < 2) return null;
    const a = h[h.length - 2], b = h[h.length - 1];
    const hrs = (b.t - a.t) / 3600e3;
    return hrs >= 0.25 ? Math.max(0, (b.views - a.views) / hrs) : null;
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

  return {
    extract, normalizeVideo, normalizeUser, engagement, er, fmt, pct, median, fmtDate, load, toCSV, download,
    hookType, formatType, isIntent, isQuestion, phrases, hookText, viewVelocity, HOOKS, FORMATS,
  };
})();
