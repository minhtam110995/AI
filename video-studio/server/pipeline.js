// Luồng chính: tải video mẫu → phân tích → viết kịch bản → tạo giọng → chọn hình → dựng video.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { CACHE_DIR, ASSETS_DIR, PORT, getSettings } from './config.js';
import { jobDir, loadJob, updateJob, fileUrl, absoluteUrl } from './jobs.js';
import { downloadVideo } from './downloader.js';
import * as ff from './ffmpeg.js';
import * as gemini from './gemini.js';
import * as eleven from './elevenlabs.js';
import * as pexels from './pexels.js';
import { analysisPrompt, scriptPrompt, voiceStyleHint } from './prompts.js';
import { resolveStyle, TEMPLATES } from '../remotion/templates/catalog.js';
import { renderVideo } from './renderer.js';

const FPS = 30;
const GAP = 0.18; // nghỉ giữa các câu (giây)
const TAIL = 0.7; // khoảng lặng cuối video
const OVERLAP = 0.5; // phần hình kéo dài để chuyển cảnh chồng mượt

export const ASPECTS = {
  '9:16': { width: 1080, height: 1920, orientation: 'portrait' },
  '16:9': { width: 1920, height: 1080, orientation: 'landscape' },
  '1:1': { width: 1080, height: 1080, orientation: 'square' },
  '4:5': { width: 1080, height: 1350, orientation: 'portrait' },
};

const hash = (...parts) => crypto.createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);

// ---------- 1. Video mẫu ----------

async function finishIngest(id, file, meta, log) {
  log('Đang đọc thông tin video…');
  const info = await ff.probe(file);
  if (!info.hasVideo) throw new Error('File không có hình ảnh video.');
  const thumb = await ff.snapshot(file, Math.min(1, info.duration / 3), path.join(jobDir(id), 'thumb.jpg'));
  updateJob(id, (j) => {
    j.source = {
      file,
      url: fileUrl(file),
      thumb: fileUrl(thumb),
      duration: info.duration,
      width: info.width,
      height: info.height,
      aspect: info.width && info.height ? closestAspect(info.width, info.height) : '9:16',
      ...meta,
    };
  });
}

export function closestAspect(w, h) {
  const r = w / h;
  return Object.entries(ASPECTS).sort(
    ([, a], [, b]) => Math.abs(a.width / a.height - r) - Math.abs(b.width / b.height - r),
  )[0][0];
}

export async function ingestUrl(id, url, log) {
  const meta = await downloadVideo(url, jobDir(id), log);
  await finishIngest(id, meta.file, { title: meta.title, description: meta.description, uploader: meta.uploader }, log);
}

export async function ingestFile(id, file, originalName, log) {
  const ext = path.extname(originalName || '.mp4').toLowerCase() || '.mp4';
  const target = path.join(jobDir(id), `source${ext}`);
  fs.renameSync(file, target);
  await finishIngest(id, target, { title: path.basename(originalName || '', ext), description: '' }, log);
}

// ---------- 2. Phân tích ----------

export async function analyze(id, log) {
  const job = loadJob(id);
  if (!job.source) throw new Error('Chưa có video mẫu.');
  const { file, duration, width, height, title = '', description = '' } = job.source;

  log('Đang đo nhịp cắt cảnh…', 0.05);
  const cuts = await ff.detectCuts(file).catch(() => []);
  const measured = {
    duration, width, height,
    cuts: cuts.length,
    cutTimes: cuts,
    avgShotSec: duration / (cuts.length + 1),
  };

  const ext = path.extname(file).slice(1).toLowerCase();
  const mime = { mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', mkv: 'video/x-matroska' }[ext] || 'video/mp4';
  const uploaded = await gemini.uploadFile(file, mime, (m) => log(m, 0.3));
  log('Gemini đang phân tích kịch bản và phong cách edit…', 0.6);
  const analysis = await gemini.generateJson({ prompt: analysisPrompt({ title, description, measured }), file: uploaded, temperature: 0.3 });

  analysis.measured = measured;
  if (!TEMPLATES.some((t) => t.id === analysis.recommendedTemplate)) analysis.recommendedTemplate = TEMPLATES[0].id;
  updateJob(id, (j) => (j.analysis = analysis));
}

// ---------- 3. Kịch bản ----------

export async function writeScript(id, brief, log) {
  const job = loadJob(id);
  const duration = Number(brief.duration) || 30;
  const aspect = ASPECTS[brief.aspect] ? brief.aspect : job.source?.aspect || '9:16';
  const templateId = brief.template || job.analysis?.recommendedTemplate || TEMPLATES[0].id;
  log('Gemini đang viết kịch bản mới…', 0.3);
  const script = await gemini.generateJson({
    prompt: scriptPrompt({ analysis: job.analysis, brief, duration, aspect, templateId, hasUserMedia: job.media.length > 0 }),
    temperature: 0.9,
  });
  script.scenes = (script.scenes || []).filter((s) => s.voiceover?.trim()).map((s, i) => ({ id: `s${i + 1}`, ...s }));
  if (!script.scenes.length) throw new Error('Gemini chưa viết được cảnh nào, hãy thử lại.');
  updateJob(id, (j) => {
    j.script = script;
    j.brief = { ...brief, duration, aspect, template: templateId };
  });
}

// ---------- 4. Giọng đọc ----------

function proportionalWords(text, duration, offset = 0.05) {
  const tokens = text.split(/\s+/).filter(Boolean);
  const weights = tokens.map((t) => t.length + 2 + (/[.,!?…;:]$/.test(t) ? 4 : 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  const usable = Math.max(0.1, duration - offset - 0.1);
  let t = offset;
  return tokens.map((tok, i) => {
    const d = (weights[i] / total) * usable;
    const w = { text: tok, start: t, end: t + d };
    t += d;
    return w;
  });
}

async function synthesize({ provider, voiceId, text, speed, styleHint }) {
  const dir = path.join(CACHE_DIR, 'tts');
  fs.mkdirSync(dir, { recursive: true });
  const key = hash(provider, voiceId, text, speed, styleHint, provider === 'elevenlabs' ? getSettings().elevenLabsModel : getSettings().geminiTtsModel);
  const meta = path.join(dir, `${key}.json`);
  if (fs.existsSync(meta)) {
    const cached = JSON.parse(fs.readFileSync(meta, 'utf8'));
    if (fs.existsSync(cached.file)) return cached;
  }
  let result;
  if (provider === 'elevenlabs') {
    const { audio, words } = await eleven.tts(text, voiceId, { speed });
    const file = path.join(dir, `${key}.mp3`);
    fs.writeFileSync(file, audio);
    result = { file, words };
  } else {
    const pcm = await gemini.tts(text, voiceId, styleHint);
    const file = ff.pcmToWav(pcm, path.join(dir, `${key}.wav`));
    result = { file, words: null };
  }
  result.duration = (await ff.probe(result.file)).duration;
  if (!result.words?.length) result.words = proportionalWords(text, result.duration);
  fs.writeFileSync(meta, JSON.stringify(result));
  return result;
}

export async function voicePreview({ provider, voiceId, speed = 1 }) {
  const text = 'Xin chào, đây là giọng đọc thử cho video của bạn. Nghe có hay không nào?';
  const r = await synthesize({ provider, voiceId, text, speed: Number(speed) || 1, styleHint: '' });
  const out = path.join(CACHE_DIR, 'previews', `${path.basename(r.file)}`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  if (!fs.existsSync(out)) fs.copyFileSync(r.file, out);
  return `/files/cache/previews/${path.basename(out)}`;
}

async function buildVoice(job, opts, log) {
  const scenes = job.script.scenes;
  const styleHint = opts.provider === 'gemini' ? voiceStyleHint(job.analysis, opts.tone) : '';
  const raw = [];
  for (let i = 0; i < scenes.length; i++) {
    log(`Đang tạo giọng đọc cảnh ${i + 1}/${scenes.length}…`, 0.05 + 0.3 * (i / scenes.length));
    raw.push(await synthesize({ provider: opts.provider, voiceId: opts.voiceId, text: scenes[i].voiceover.trim(), speed: opts.speed, styleHint }));
  }

  // Khớp thời lượng đã chọn: nếu lệch > 8% thì tăng/giảm tốc độ đọc (giữ nguyên cao độ).
  const speech = raw.reduce((a, r) => a + r.duration, 0);
  const target = Number(opts.duration) || speech + GAP * scenes.length + TAIL;
  const room = Math.max(1, target - GAP * (scenes.length - 1) - TAIL);
  let tempo = speech / room;
  tempo = Math.abs(tempo - 1) < 0.08 || !opts.fitDuration ? 1 : Math.min(1.3, Math.max(0.82, tempo));

  const dir = path.join(jobDir(job.id), 'render');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const out = [];
  for (let i = 0; i < raw.length; i++) {
    const file = path.join(dir, `voice-${i + 1}.wav`);
    await ff.retimeAudio(raw[i].file, file, tempo);
    const duration = (await ff.probe(file)).duration;
    out.push({ file, duration, words: raw[i].words.map((w) => ({ ...w, start: w.start / tempo, end: w.end / tempo })) });
  }

  // Còn ngắn hơn mục tiêu nhiều → giãn khoảng nghỉ một chút (tối đa 0.6s/câu).
  const total = out.reduce((a, r) => a + r.duration, 0) + GAP * (out.length - 1) + TAIL;
  let gap = GAP;
  if (opts.fitDuration && target - total > 0.5 && out.length > 1) gap = Math.min(0.6, GAP + (target - total) / (out.length - 1));
  return { voices: out, tempo, gap };
}

// ---------- 5. Hình ảnh ----------

async function buildMedia(job, sceneTimes, opts, log) {
  const { width, height, orientation } = ASPECTS[opts.aspect];
  const dir = path.join(jobDir(job.id), 'render');
  const pool = job.media.filter((m) => fs.existsSync(m.file));
  const usedStock = new Set();
  const useCount = new Map();
  let poolIdx = 0;
  const nextFromPool = () => (pool.length ? pool[poolIdx++ % pool.length] : null);
  const credits = [];

  const result = [];
  for (let i = 0; i < job.script.scenes.length; i++) {
    const scene = job.script.scenes[i];
    const dur = sceneTimes[i].duration + OVERLAP;
    log(`Đang chuẩn bị hình cảnh ${i + 1}/${job.script.scenes.length}…`, 0.4 + 0.25 * (i / job.script.scenes.length));

    let src = null; // { file, type }
    if (scene.mediaId) src = pool.find((m) => m.id === scene.mediaId) || null;
    const wantStock = scene.source === 'stock' || !pool.length;
    if (!src && !wantStock) src = nextFromPool();
    if (!src && opts.useStock && pexels.hasPexels()) {
      const queries = [scene.stockKeywords, job.script.scenes[0]?.stockKeywords, 'abstract background'].filter(Boolean);
      for (const q of queries) {
        try {
          const found = await pexels.findStock(q, { orientation, minDuration: dur, usedIds: usedStock });
          if (!found) continue;
          const ext = found.type === 'video' ? '.mp4' : '.jpg';
          const cached = path.join(CACHE_DIR, 'stock', hash(found.url) + ext);
          fs.mkdirSync(path.dirname(cached), { recursive: true });
          if (!fs.existsSync(cached)) await pexels.download(found.url, cached);
          src = { file: cached, type: found.type };
          credits.push(found.credit);
          break;
        } catch (e) {
          console.warn('Pexels:', e.message);
        }
      }
    }
    if (!src) src = nextFromPool();

    if (!src) {
      result.push({ type: 'none' });
      continue;
    }
    if (src.type === 'video') {
      const out = path.join(dir, `scene-${i + 1}.mp4`);
      const n = useCount.get(src.file) || 0;
      useCount.set(src.file, n + 1);
      const info = await ff.probe(src.file);
      // Dùng lại cùng clip ở cảnh khác → lấy đoạn khác của clip.
      const startAt = info.duration > dur ? ((n * dur) % Math.max(0.01, info.duration - dur)) : 0;
      await ff.normalizeClip(src.file, out, { width, height, duration: dur, fps: FPS, startAt });
      result.push({ type: 'video', src: absoluteUrl(out) });
    } else {
      const out = path.join(dir, `scene-${i + 1}.jpg`);
      await ff.normalizeImage(src.file, out);
      result.push({ type: 'image', src: absoluteUrl(out) });
    }
  }
  return { media: result, credits };
}

// ---------- 6. Dựng video ----------

function assetUrl(rel) {
  const file = path.join(ASSETS_DIR, rel);
  return fs.existsSync(file) ? `http://127.0.0.1:${PORT}/assets/${rel.split(path.sep).join('/')}` : null;
}

function musicUrl(job, opts) {
  if (opts.music === 'none') return null;
  if (opts.music === 'job' && job.music && fs.existsSync(job.music.file)) return absoluteUrl(job.music.file);
  if (opts.music && opts.music.startsWith('lib:')) return assetUrl(path.join('music', path.basename(opts.music.slice(4))));
  return null;
}

export async function produce(id, opts, log) {
  updateJob(id, (j) => {
    if (j.script?.scenes) j.script.scenes = j.script.scenes.filter((s) => (s.voiceover || '').trim());
  });
  let job = loadJob(id);
  if (!job.script?.scenes?.length) throw new Error('Chưa có kịch bản (cần ít nhất 1 cảnh có lời đọc).');
  if (!opts.voiceId) throw new Error('Chưa chọn giọng đọc.');
  opts = {
    ...opts,
    provider: opts.provider === 'elevenlabs' ? 'elevenlabs' : 'gemini',
    aspect: ASPECTS[opts.aspect] ? opts.aspect : ASPECTS[job.brief?.aspect] ? job.brief.aspect : '9:16',
    template: opts.template || job.brief?.template || job.analysis?.recommendedTemplate || TEMPLATES[0].id,
    duration: Number(opts.duration) || job.brief?.duration || 0,
    speed: Number(opts.speed) || 1,
    fitDuration: opts.fitDuration !== false,
    useStock: opts.useStock !== false,
    copyStyle: opts.copyStyle !== false,
  };
  updateJob(id, (j) => (j.produceOptions = opts));

  const { voices, tempo, gap } = await buildVoice(job, opts, log);
  let t = 0;
  const sceneTimes = voices.map((v, i) => {
    const isLast = i === voices.length - 1;
    const duration = v.duration + (isLast ? TAIL : gap);
    const s = { start: t, duration };
    t += duration;
    return s;
  });
  const total = t;

  job = loadJob(id);
  const { media, credits } = await buildMedia(job, sceneTimes, opts, log);

  const { width, height } = ASPECTS[opts.aspect];
  const fromAnalysis = { ...(job.analysis?.editStyle || {}) };
  if (!opts.copyStyle) for (const k of Object.keys(fromAnalysis)) delete fromAnalysis[k];
  const style = resolveStyle(opts.template, { ...fromAnalysis, ...(opts.style || {}) });

  const plan = {
    fps: FPS,
    width,
    height,
    durationInFrames: Math.ceil(total * FPS),
    template: opts.template,
    style,
    headline: job.script.headline || job.script.title || '',
    brand: opts.brand || '',
    cta: job.script.cta || null,
    scenes: job.script.scenes.map((s, i) => ({
      index: i,
      role: s.role || '',
      onScreenText: s.onScreenText || '',
      start: sceneTimes[i].start,
      duration: sceneTimes[i].duration,
      overlap: OVERLAP,
      media: media[i],
      voice: absoluteUrl(voices[i].file),
    })),
    words: voices.flatMap((v, i) => v.words.map((w) => ({ text: w.text, start: w.start + sceneTimes[i].start, end: w.end + sceneTimes[i].start, scene: i }))),
    music: musicUrl(job, opts),
    sfx: style.sfx ? { whoosh: assetUrl('sfx/whoosh.mp3'), pop: assetUrl('sfx/pop.mp3'), ding: assetUrl('sfx/ding.mp3') } : {},
  };
  fs.writeFileSync(path.join(jobDir(id), 'render', 'plan.json'), JSON.stringify(plan, null, 2));

  const output = path.join(jobDir(id), `video-${Date.now()}.mp4`);
  await renderVideo(plan, output, (p) => log(`Đang dựng video… ${Math.round(p * 100)}%`, 0.7 + 0.3 * p));
  updateJob(id, (j) => {
    if (j.output?.file && fs.existsSync(j.output.file)) fs.rmSync(j.output.file, { force: true });
    j.output = { file: output, url: fileUrl(output), duration: total, tempo, credits, createdAt: Date.now() };
  });
}
