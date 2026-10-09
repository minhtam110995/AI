// Lấy "nội dung gốc" của video: caption, hashtag, âm thanh và lời thoại
// (phụ đề tự động / phụ đề của tác giả do TikTok cung cấp). Chạy trong background.
const Transcript = (() => {
  const VIDEO_URL = /tiktok\.com\/(?:@([^/?#]+)\/)?(?:video|photo)\/(\d+)/;

  function parseLink(link) {
    const m = String(link || '').match(VIDEO_URL);
    return m ? { author: m[1] || '', id: m[2] } : null;
  }

  // Tìm object video gốc (itemStruct) có id cần tìm trong JSON của trang.
  function findRawItem(json, id) {
    let found = null;
    const seen = new WeakSet();
    const walk = (o, depth) => {
      if (found || !o || typeof o !== 'object' || depth > 14 || seen.has(o)) return;
      seen.add(o);
      if (!Array.isArray(o) && String(o.id) === id && o.stats && o.video) { found = o; return; }
      for (const k in o) walk(o[k], depth + 1);
    };
    walk(json, 0);
    return found;
  }

  async function fetchPageItem(link, id) {
    const res = await fetch(link, { credentials: 'include' });
    if (!res.ok) throw new Error(`Không tải được trang video (HTTP ${res.status}).`);
    const html = await res.text();
    const finalId = parseLink(res.url)?.id || id;
    for (const sid of ['__UNIVERSAL_DATA_FOR_REHYDRATION__', 'SIGI_STATE', '__NEXT_DATA__']) {
      const m = html.match(new RegExp(`<script[^>]*id="${sid}"[^>]*>([\\s\\S]*?)</script>`));
      if (!m) continue;
      try {
        const item = findRawItem(JSON.parse(m[1]), finalId);
        if (item) return item;
      } catch (_) {}
    }
    throw new Error('TikTok không trả về dữ liệu video (có thể cần mở tiktok.com và đăng nhập/xác minh captcha trước).');
  }

  // Gom các bản phụ đề có sẵn, ưu tiên bản gốc (ASR / phụ đề tác giả) hơn bản dịch máy.
  function listTracks(item) {
    const v = item.video || {};
    const tracks = [];
    (v.subtitleInfos || []).forEach((s) => s.Url && tracks.push({
      url: s.Url, lang: s.LanguageCodeName || s.LanguageID || '?', source: s.Source || '',
      original: /asr/i.test(s.Source || ''), format: s.Format || '',
    }));
    const cla = v.claInfo || item.claInfo || {};
    (cla.captionInfos || []).forEach((c) => {
      const url = c.url || c.urlList?.[0];
      if (url) tracks.push({ url, lang: c.languageCode || c.language || '?', source: c.isAutoGen ? 'ASR' : 'CREATOR', original: !!c.isOriginalCaption, format: c.captionFormat || '' });
    });
    const orig = (cla.originalLanguageInfo?.languageCode || item.textLanguage || '').toLowerCase();
    const seen = new Set();
    return tracks
      .map((t) => ({ ...t, original: t.original || (!!orig && t.lang.toLowerCase().startsWith(orig.slice(0, 2))) }))
      .filter((t) => !seen.has(t.lang + t.source) && seen.add(t.lang + t.source))
      .sort((a, b) => b.original - a.original);
  }

  const ts = (s) => {
    const m = s.match(/(?:(\d+):)?(\d+):(\d+)[.,](\d+)/);
    return m ? (+(m[1] || 0)) * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
  };

  function parseCaption(text) {
    const segs = [];
    if (/^\s*WEBVTT/.test(text) || /-->/.test(text)) {
      const blocks = text.replace(/\r/g, '').split(/\n\n+/);
      for (const b of blocks) {
        const lines = b.split('\n');
        const i = lines.findIndex((l) => l.includes('-->'));
        if (i < 0) continue;
        const t = lines.slice(i + 1).join(' ').replace(/<[^>]+>/g, '').trim();
        if (t) segs.push({ start: ts(lines[i].split('-->')[0]), text: t });
      }
    } else {
      try {
        const j = JSON.parse(text);
        const arr = j.utterances || j.captions || j.data?.utterances || (Array.isArray(j) ? j : []);
        arr.forEach((u) => (u.text || u.content) && segs.push({ start: (u.start_time ?? u.startTime ?? u.start ?? 0) / (u.start_time > 1000 ? 1000 : 1), text: u.text || u.content }));
      } catch (_) {
        if (text.trim()) segs.push({ start: 0, text: text.trim() });
      }
    }
    return segs.filter((s, i) => i === 0 || s.text !== segs[i - 1].text);
  }

  const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  async function getOriginal({ link, author, id, lang }) {
    const p = link ? parseLink(link) : { author, id };
    if (!p?.id) throw new Error('Link không hợp lệ. Hãy dán link dạng https://www.tiktok.com/@kenh/video/123…');
    const url = link && !/\/video\//.test(link) ? link : `https://www.tiktok.com/@${p.author || '_'}/video/${p.id}`;
    const item = await fetchPageItem(url, p.id);
    const tracks = listTracks(item);
    let track = (lang && tracks.find((t) => t.lang === lang)) || tracks[0];
    let segments = [];
    let error = '';
    if (track) {
      try {
        const r = await fetch(track.url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        segments = parseCaption(await r.text());
      } catch (e) { error = 'Không tải được phụ đề: ' + e.message; }
    }
    const video = TTA.normalizeVideo(item);
    const transcript = segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
    return {
      id: p.id,
      author: video?.author || p.author,
      video,
      caption: item.desc || '',
      hashtags: video?.hashtags || [],
      music: video?.music || '',
      lang: track?.lang || '',
      languages: tracks.map((t) => ({ lang: t.lang, source: t.source, original: t.original })),
      transcript,
      timed: segments.map((s) => `[${clock(s.start)}] ${s.text}`).join('\n'),
      segments,
      note: !tracks.length ? 'Video này không có phụ đề tự động (thường do video không có lời nói, chỉ có nhạc, hoặc TikTok chưa tạo phụ đề).' : error,
    };
  }

  return { getOriginal, parseLink, parseCaption, listTracks, fetchPageItem };
})();
