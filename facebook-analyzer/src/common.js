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
    // Phụ đề tự động của Reels/video (nếu Facebook có tạo): link tệp SRT/VTT
    const captionsUrl = deepFind(n, (o) => (typeof o.captions_url === 'string' ? o.captions_url
      : typeof o.captionsUrl === 'string' ? o.captionsUrl
      : Array.isArray(o.video_available_captions_locales) ? o.video_available_captions_locales.find((c) => c?.captions_url)?.captions_url : undefined));
    const cover = deepFind(n, (o) => (typeof o.preferred_thumbnail?.image?.uri === 'string' ? o.preferred_thumbnail.image.uri
      : typeof o.thumbnailImage?.uri === 'string' ? o.thumbnailImage.uri : typeof o.first_frame_thumbnail === 'string' ? o.first_frame_thumbnail : undefined));
    return { actor, time, text, reactions, comments, shares, views, duration, videoId, url, type, captionsUrl, cover };
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
        captionsUrl: r.captionsUrl || null, cover: r.cover || null,
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

  // ---------- từ khoá, thời gian tương đối, phụ đề ----------
  const kwKey = (q) => String(q || '').toLowerCase().normalize('NFC').replace(/\s+/g, ' ').trim();

  // "3 ngày" / "2 tuần trước" / "5 giờ" / "hôm qua" / "12 tháng 3" / "12 thg 3, 2024" / "March 12" → giây (gần đúng)
  function parseRelTime(t, now = Date.now()) {
    const s = String(t || '').toLowerCase().normalize('NFC');
    const unit = { 'phút': 60, 'giờ': 3600, 'ngày': 86400, 'tuần': 7 * 86400, 'tháng': 30 * 86400, 'năm': 365 * 86400,
      m: 60, min: 60, mins: 60, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, d: 86400, day: 86400, days: 86400, w: 7 * 86400, wk: 7 * 86400, week: 7 * 86400, weeks: 7 * 86400, y: 365 * 86400, yr: 365 * 86400, year: 365 * 86400, years: 365 * 86400 };
    if (/hôm qua|yesterday/.test(s)) return Math.floor(now / 1000) - 86400;
    // Ngày cụ thể trước ("12 tháng 3"), để không nhầm với "12 tháng" (12 tháng trước)
    let m = s.match(/(\d{1,2})\s*(?:tháng|thg)\s*(\d{1,2})(?!\d)(?:,?\s*(\d{4}))?/);
    if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
      const y = m[3] ? Number(m[3]) : new Date(now).getFullYear();
      let d = new Date(y, Number(m[2]) - 1, Number(m[1]), 12);
      if (!m[3] && d.getTime() > now) d = new Date(y - 1, Number(m[2]) - 1, Number(m[1]), 12);
      return Math.floor(d.getTime() / 1000);
    }
    m = s.match(/(\d+)\s*(phút|giờ|ngày|tuần|tháng|năm|mins?|hrs?|hours?|days?|weeks?|wk|years?|yr|[mhdwy])(?![\p{L}])/u);
    return m ? Math.floor(now / 1000) - Number(m[1]) * unit[m[2]] : null;
  }

  // Tệp phụ đề SRT / WebVTT → văn bản liền mạch (bỏ số thứ tự, mốc thời gian, thẻ định dạng, dòng lặp)
  function parseCaptions(raw) {
    const out = [];
    for (const line of String(raw || '').replace(/\r/g, '').split('\n')) {
      const l = line.trim();
      if (!l || /^WEBVTT/i.test(l) || /^\d+$/.test(l) || /-->/.test(l) || /^(NOTE|STYLE|REGION)\b/.test(l)) continue;
      const t = l.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
      if (t && t !== out[out.length - 1]) out.push(t);
    }
    return out.join(' ').replace(/\s+/g, ' ').trim();
  }

  // ---------- video xu hướng (báo cáo từ khoá) ----------
  const ageDays = (p, now = Date.now()) => (p.time ? Math.max(1, (now / 1000 - p.time) / 86400) : null);
  const perDay = (p) => (p.views && p.time ? p.views / ageDays(p) : null);

  // ---------- prompt cho ChatGPT / Claude ----------
  const AI_GOALS = {
    viral: ['🔍 Vì sao viral', 'Phân tích vì sao nội dung viral'],
    rewrite: ['✍️ Viết lại cho trang tôi', 'Viết lại theo công thức viral cho fanpage của tôi'],
    hooks: ['🎣 10 câu hook', 'Viết 10 câu hook mở đầu'],
    sell: ['🛒 Kịch bản bán hàng', 'Chuyển thành kịch bản / bài bán hàng'],
  };
  const ME_FIELDS = [['niche', 'Ngách / chủ đề fanpage', 'vd: mẹo kinh doanh online cho mẹ bỉm'], ['product', 'Sản phẩm / dịch vụ', 'vd: khoá học bán hàng 1,99 triệu'],
    ['audience', 'Khách hàng mục tiêu', 'vd: nữ 25–40, nội trợ'], ['voice', 'Giọng văn', 'vd: gần gũi, xưng chị – các em'], ['avoid', 'Không dùng / tránh', 'vd: không nói giá']];
  // items: [{ p, ratio }] — bài / Reels đưa vào prompt (đã chọn sẵn)
  function aiPrompt({ goal = 'viral', items = [], topic = '', me = {}, source = '' }) {
    const many = items.length > 1;
    const body = items.map(({ p, ratio }, i) => [
      `### ${p.type === 'reel' || p.type === 'video' ? 'Reels/video' : 'Bài viết'} ${i + 1} — ${p.page || ''}${p.url ? ': ' + p.url : ''}`,
      `- Số liệu: ${p.views ? fmt(p.views) + ' lượt xem, ' : ''}${fmt(p.reactions)} cảm xúc, ${fmt(p.comments)} bình luận, ${fmt(p.shares)} chia sẻ${ratio ? ` (${ratio.toFixed(1)}× mức trung vị của trang)` : ''}${p.duration ? `, dài ${p.duration}s` : ''}${p.time ? `, đăng ${fmtDate(p.time)}` : ''}`,
      `- Nội dung / caption: ${(p.text || '').replace(/\s+/g, ' ').trim() || '–'}`,
      ...(p.type === 'reel' || p.type === 'video' ? [`- Lời thoại: ${p.transcript || '(chưa có — Reels không có phụ đề tự động hoặc chưa lấy; hãy suy luận từ caption và số liệu)'}`] : []),
    ].join('\n')).join('\n\n');
    const meTxt = ME_FIELDS.filter(([k]) => (me[k] || '').trim()).map(([k, l]) => `- ${l}: ${me[k].trim()}`).join('\n');
    const tasks = {
      viral: [`Phân tích vì sao ${many ? 'các nội dung này' : 'nội dung này'} viral trên Facebook:`,
        '1. Câu mở đầu / 3 giây đầu: trích nguyên văn, vì sao giữ chân người xem.',
        '2. Cấu trúc nội dung (mở – thân – kết), nhịp và cách chuyển ý.',
        '3. Cảm xúc / tâm lý được khai thác (tò mò, sợ bỏ lỡ, đồng cảm, hài hước…).',
        '4. Lời kêu gọi hành động và lý do người xem bình luận / chia sẻ.',
        `5. Rút ra **công thức có thể tái sử dụng** dạng khung (Hook → … → CTA)${many ? ', và điểm chung giữa các nội dung' : ''}.`,
        '6. Những điều KHÔNG nên bắt chước.'],
      rewrite: ['Bước 1: Tóm tắt ngắn công thức viral của nội dung gốc.',
        `Bước 2: Viết **3 nội dung mới** cho fanpage của tôi${topic ? ` về chủ đề / sản phẩm: ${topic}` : ''}, áp dụng công thức đó nhưng **không sao chép câu chữ gốc**. Mỗi nội dung gồm: 2 phương án câu mở đầu; thân bài (với Reels: lời nói + cảnh quay + chữ trên màn hình theo từng cảnh); lời kêu gọi hành động; caption; 3–5 hashtag.`],
      hooks: [`Dựa trên câu mở đầu của nội dung gốc, viết **10 câu hook** cho ${topic ? `chủ đề: ${topic}` : 'fanpage của tôi'}, mỗi câu ≤ 15 từ, đa dạng kiểu: câu hỏi, con số, gây tò mò, cảnh báo, POV, trước/sau, phản bác. Ghi kiểu hook cạnh mỗi câu, đánh dấu 3 câu mạnh nhất và giải thích.`],
      sell: [`Chuyển công thức của nội dung gốc thành **kịch bản Reels 30–60 giây và 1 bài đăng bán hàng** cho ${topic ? `sản phẩm: ${topic}` : 'sản phẩm của tôi'}: hook nêu nỗi đau / mong muốn, cho thấy sản phẩm giải quyết, bằng chứng, xử lý 1 lời từ chối, CTA rõ ràng. Không hứa hẹn quá mức, không vi phạm chính sách quảng cáo Facebook.`],
    };
    return [`Bạn là chuyên gia nội dung Facebook (fanpage & Reels) tại Việt Nam.`,
      `# Mục tiêu: ${AI_GOALS[goal]?.[1] || ''}`,
      source ? `Nguồn: ${source}` : '',
      meTxt ? `# Về fanpage của tôi\n${meTxt}` : '',
      `# Dữ liệu\n${body || '(chưa chọn nội dung)'}`,
      `# Yêu cầu\n${tasks[goal].join('\n')}`,
      'Trả lời bằng tiếng Việt, trình bày rõ ràng theo đề mục.'].filter(Boolean).join('\n\n');
  }
  const aiUrl = (to, prompt) => (to === 'claude' ? 'https://claude.ai/new?q=' : 'https://chatgpt.com/?q=') + encodeURIComponent(prompt);

  return {
    parseShort, parseResponse, extract, merge, engagement, metric, metricKind, er, textKey, fmt, pct, median, fmtDate, TYPE_LABEL,
    hookType, firstLine, download, toCSV, kwKey, parseRelTime, parseCaptions, ageDays, perDay, AI_GOALS, ME_FIELDS, aiPrompt, aiUrl,
  };
})();
