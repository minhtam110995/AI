// Hàm dùng chung: đọc dữ liệu Facebook, định dạng số, phân loại nội dung.
const FBA = (() => {
  const num = (v) => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

  // "1,2K" → 1200, "3,4 Tr" → 3400000, "12 N" → 12000, "1.234" → 1234, "1.2M" → 1200000
  function parseShort(t) {
    if (t == null) return null;
    if (typeof t === 'number') return t;
    const m = String(t).toLowerCase().replace(/\s+/g, ' ').match(/([\d.,]+)\s*(nghìn|ngàn|triệu|tỷ|k|n|tr|m|b)?(?![\p{L}])/u);
    if (!m) return null;
    const unit = m[2];
    let n;
    if (unit) n = Number(m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    else n = Number(m[1].replace(/[.,]/g, ''));
    if (!Number.isFinite(n)) return null;
    const mul = { k: 1e3, n: 1e3, 'nghìn': 1e3, 'ngàn': 1e3, tr: 1e6, 'triệu': 1e6, m: 1e6, b: 1e9, 'tỷ': 1e9 }[unit] || 1;
    return Math.round(n * mul);
  }

  // Phản hồi GraphQL có thể gồm nhiều JSON nối nhau theo dòng, có thể có tiền tố "for (;;);"
  function parseResponse(text) {
    const out = [];
    const t = String(text).replace(/^for \(;;\);/, '');
    for (const line of t.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || (s[0] !== '{' && s[0] !== '[')) continue;
      try { out.push(JSON.parse(s)); } catch (_) {}
    }
    if (!out.length) { try { out.push(JSON.parse(t)); } catch (_) {} }
    return out;
  }

  // Tìm theo chiều rộng trong 1 bài viết, không đi vào bài viết lồng (bài được chia sẻ)
  function deepFind(root, test, maxDepth = 16) {
    const q = [[root, 0]];
    const seen = new Set();
    for (let i = 0; i < q.length && i < 20000; i++) {
      const [o, d] = q[i];
      if (!o || typeof o !== 'object' || seen.has(o)) continue;
      seen.add(o);
      if (o !== root && o.__typename === 'Story') continue;
      const r = test(o);
      if (r !== undefined && r !== null) return r;
      if (d < maxDepth) for (const k in o) { const v = o[k]; if (v && typeof v === 'object') q.push([v, d + 1]); }
    }
    return null;
  }

  const countOf = (x) => (x == null ? undefined : typeof x === 'number' ? x : typeof x === 'object' && x.count != null ? num(x.count) : undefined);

  function readPost(n, isReelNode) {
    const actor = deepFind(n, (o) => (Array.isArray(o.actors) && o.actors[0]?.name ? o.actors[0]
      : o.video_owner?.name ? o.video_owner : o.owning_profile?.name ? o.owning_profile : o.owner?.name && o.owner.__typename !== 'User' ? o.owner : undefined));
    const time = deepFind(n, (o) => num(o.creation_time) || num(o.publish_time) || undefined);
    const text = deepFind(n, (o) => (o.message && typeof o.message.text === 'string' ? o.message.text : undefined)) || '';
    const reactions = deepFind(n, (o) => countOf(o.reaction_count) ?? countOf(o.reactors) ?? countOf(o.unified_reactors) ?? (o.i18n_reaction_count ? parseShort(o.i18n_reaction_count) : undefined));
    const comments = deepFind(n, (o) => num(o.total_comment_count) ?? (o.comments && typeof o.comments.total_count === 'number' ? o.comments.total_count : undefined) ?? (o.comment_count ? num(o.comment_count.total_count) : undefined) ?? undefined);
    const shares = deepFind(n, (o) => countOf(o.share_count) ?? (o.i18n_share_count ? parseShort(o.i18n_share_count) : undefined));
    const views = deepFind(n, (o) => num(o.play_count) || num(o.video_view_count) || num(o.post_view_count) || (o.i18n_play_count ? parseShort(o.i18n_play_count) : undefined) || undefined);
    const duration = deepFind(n, (o) => num(o.length_in_second) || (o.playable_duration_in_ms ? o.playable_duration_in_ms / 1000 : undefined) || undefined);
    const videoId = deepFind(n, (o) => (o.short_form_video_context?.video?.id ? String(o.short_form_video_context.video.id)
      : o.short_form_video_context?.playback_video?.id ? String(o.short_form_video_context.playback_video.id)
      : o.__typename === 'Video' && o.id ? String(o.id) : undefined));
    const url = deepFind(n, (o) => (typeof o.permalink_url === 'string' ? o.permalink_url
      : typeof o.shareable_url === 'string' ? o.shareable_url
      : typeof o.url === 'string' && /facebook\.com\/.+\/(posts|videos|reel|photos|permalink)|\/reel\/\d/.test(o.url) ? o.url : undefined));
    const reel = isReelNode || !!deepFind(n, (o) => (o.short_form_video_context || (typeof o.url === 'string' && /\/reel\/\d/.test(o.url)) ? true : undefined));
    const photos = (() => { let c = 0; deepFind(n, (o) => { if (o.__typename === 'Photo') c++; return undefined; }); return c; })();
    const link = !!deepFind(n, (o) => (o.__typename === 'ExternalUrl' || o.external_url ? true : undefined));
    const type = reel ? 'reel' : videoId || views ? 'video' : photos > 1 ? 'album' : photos ? 'photo' : link ? 'link' : 'text';
    return { actor, time, text, reactions, comments, shares, views, duration, videoId, url, type };
  }

  function extract(json) {
    const posts = [];
    const seen = new WeakSet();
    const add = (n, isReel) => {
      const r = readPost(n, isReel);
      const postId = n.post_id ? String(n.post_id) : null;
      if (!r.actor?.name || (r.reactions == null && r.views == null && !r.text)) return;
      const id = r.videoId && (r.type === 'reel' || r.type === 'video') ? 'v:' + r.videoId : 'p:' + (postId || n.id);
      if (!postId && !n.id && !r.videoId) return;
      posts.push({
        key: id, postId, videoId: r.videoId || null, page: r.actor.name, pageId: r.actor.id ? String(r.actor.id) : null,
        time: r.time || null, text: r.text, type: r.type,
        reactions: r.reactions ?? null, comments: r.comments ?? null, shares: r.shares ?? null, views: r.views ?? null,
        duration: r.duration ? Math.round(r.duration) : null,
        url: r.url || (r.videoId && r.type === 'reel' ? `https://www.facebook.com/reel/${r.videoId}` : null),
        hashtags: [...new Set((r.text.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1).toLowerCase()))],
        src: 'api',
      });
    };
    const walk = (o, d) => {
      if (!o || typeof o !== 'object' || d > 40 || seen.has(o)) return;
      seen.add(o);
      if (Array.isArray(o)) { o.forEach((x) => walk(x, d + 1)); return; }
      if (o.__typename === 'Story' && (o.post_id || o.id)) add(o, false);
      else if (o.short_form_video_context && typeof o.short_form_video_context === 'object') add(o, true);
      for (const k in o) walk(o[k], d + 1);
    };
    walk(json, 0);
    return posts;
  }

  // Gộp: chỉ ghi đè trường có giá trị
  function merge(prev, next) {
    const out = { ...(prev || {}) };
    for (const k in next) if (next[k] != null && next[k] !== '' && !(Array.isArray(next[k]) && !next[k].length && out[k]?.length)) out[k] = next[k];
    return out;
  }

  // ---------- chỉ số ----------
  const engagement = (p) => (p.reactions || 0) + (p.comments || 0) + (p.shares || 0);
  // Reels/video đo bằng lượt xem; bài thường đo bằng tổng tương tác
  // Reels/video có lượt xem → so theo lượt xem; còn lại → so theo tương tác
  const metricKind = (p) => ((p.type === 'reel' || p.type === 'video') && p.views ? 'view' : 'eng');
  const metric = (p) => (metricKind(p) === 'view' ? p.views : engagement(p));
  const er = (p) => (p.views && p.reactions != null ? engagement(p) / p.views : null);
  const textKey = (t) => String(t || '').toLowerCase().replace(/\s+/g, '').replace(/[^\p{L}\p{N}]/gu, '').slice(0, 60);

  const fmt = (n) => {
    if (n == null || !Number.isFinite(n)) return '–';
    const a = Math.abs(n);
    if (a >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (a >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (a >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return String(Math.round(n));
  };
  const pct = (x, d = 1) => (x == null || !Number.isFinite(x) ? '–' : (x * 100).toFixed(d) + '%');
  const median = (arr) => {
    const s = arr.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  const fmtDate = (sec) => (sec ? new Date(sec * 1000).toLocaleDateString('vi-VN') : '–');
  const TYPE_LABEL = { reel: 'Reels', video: 'Video', photo: 'Ảnh', album: 'Album ảnh', link: 'Link', text: 'Chỉ chữ' };

  // ---------- phân loại nội dung (chạy trên máy) ----------
  const norm = (t) => String(t || '').toLowerCase().normalize('NFC');
  const HOOKS = [
    ['Câu hỏi', /\?|^(bạn có biết|tại sao|vì sao|làm sao|làm thế nào|có phải|ai đã|có ai|bạn đã bao giờ)/],
    ['Con số / danh sách', /(^|\s)\d+\s*(cách|bước|mẹo|lý do|sai lầm|điều|thứ|món|tips?|ngày)/],
    ['POV / nhập vai', /^pov|\bpov\b/],
    ['Cảnh báo / phản bác', /^(đừng|dừng lại|cảnh báo|sai lầm|không ai nói|ngừng|thôi ngay|đừng bao giờ)|sai lầm|đừng mua/],
    ['Gây tò mò', /(bí mật|sự thật|không ngờ|ai cũng|chưa ai|ít ai biết|cuối video|xem đến cuối|bất ngờ|plot twist)/],
    ['Kể chuyện', /^(hôm nay|hôm qua|mình đã|tôi đã|em đã|hồi|câu chuyện|chuyện là|năm \d{4})/],
    ['Ưu đãi / khuyến mãi', /(giảm giá|sale|khuyến mãi|ưu đãi|freeship|tặng|quà|voucher|chỉ còn|flash)/],
  ];
  const firstLine = (t) => String(t || '').replace(/#\S+/g, '').split(/[\n.!]/).map((s) => s.trim()).find(Boolean) || '';
  function hookType(text) {
    const t = norm(firstLine(text)).trim();
    if (!t) return 'Không có caption';
    for (const [name, re] of HOOKS) if (re.test(t)) return name;
    return 'Khác';
  }

  function download(name, text, type = 'text/csv') {
    const u = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = u; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }

  function toCSV(posts) {
    const q = (x) => { const s = String(x ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const cols = ['page', 'type', 'time', 'reactions', 'comments', 'shares', 'views', 'duration', 'er', 'text', 'url'];
    return '﻿' + cols.join(',') + '\n' + posts.map((p) => [p.page, TYPE_LABEL[p.type] || p.type, p.time ? new Date(p.time * 1000).toISOString() : '',
      p.reactions, p.comments, p.shares, p.views, p.duration, er(p)?.toFixed(4) ?? '', p.text, p.url].map(q).join(',')).join('\n');
  }

  return {
    parseShort, parseResponse, extract, merge, engagement, metric, metricKind, er, textKey, fmt, pct, median, fmtDate, TYPE_LABEL,
    hookType, firstLine, download, toCSV,
  };
})();
