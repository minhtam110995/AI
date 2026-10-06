// Web app chạy trên máy: mở http://localhost:3210
import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { ROOT, DATA_DIR, JOBS_DIR, CACHE_DIR, ASSETS_DIR, PORT, getSettings, saveSettings, publicSettings } from './config.js';
import { createJob, loadJob, updateJob, listJobs, deleteJob, runTask, jobDir, fileUrl } from './jobs.js';
import * as pipeline from './pipeline.js';
import * as gemini from './gemini.js';
import * as eleven from './elevenlabs.js';
import { updateYtDlp } from './downloader.js';
import { probe } from './ffmpeg.js';
import { TEMPLATES, FONTS, BASE_STYLE } from '../remotion/templates/catalog.js';
import { warmUp } from './renderer.js';

const app = express();
app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(ROOT, 'public')));
// Chỉ phục vụ thư mục dự án và cache; data/settings.json (chứa API key) không bao giờ được trả ra.
app.use('/files/jobs', express.static(JOBS_DIR));
app.use('/files/cache', express.static(CACHE_DIR));
app.use('/assets', express.static(ASSETS_DIR));

const upload = multer({ dest: path.join(DATA_DIR, 'uploads'), limits: { fileSize: 2 * 1024 ** 3 } });

const wrap = (fn) => (req, res) =>
  Promise.resolve(fn(req, res)).catch((e) => res.status(400).json({ error: e.message || String(e) }));

function mustJob(req) {
  const job = loadJob(req.params.id);
  if (!job) throw new Error('Không tìm thấy dự án');
  return job;
}

// Ghi đúng UTF-8 cho tên file tiếng Việt (multer đọc tên theo latin1).
const fixName = (name) => Buffer.from(name || '', 'latin1').toString('utf8');

// ---------- Cài đặt & danh mục ----------
app.get('/api/settings', (req, res) => res.json(publicSettings()));
app.post('/api/settings', wrap((req, res) => {
  saveSettings(req.body || {});
  res.json(publicSettings());
}));

app.get('/api/catalog', (req, res) => {
  const lib = (dir, exts) => {
    try {
      return fs.readdirSync(path.join(ASSETS_DIR, dir)).filter((f) => exts.test(f));
    } catch {
      return [];
    }
  };
  res.json({
    templates: TEMPLATES,
    fonts: FONTS,
    baseStyle: BASE_STYLE,
    aspects: pipeline.ASPECTS,
    elevenModels: eleven.ELEVEN_MODELS,
    music: lib('music', /\.(mp3|m4a|wav|ogg)$/i),
    sfx: lib('sfx', /\.(mp3|wav)$/i),
  });
});

app.get('/api/voices', wrap(async (req, res) => {
  if (req.query.provider === 'elevenlabs') return res.json(await eleven.listVoices());
  res.json(gemini.GEMINI_VOICES);
}));

app.post('/api/voices/preview', wrap(async (req, res) => {
  res.json({ url: await pipeline.voicePreview(req.body || {}) });
}));

app.post('/api/tools/update-ytdlp', wrap(async (req, res) => {
  res.json({ message: (await updateYtDlp()).trim().split('\n').pop() });
}));

// Tạo bộ hiệu ứng âm thanh bằng ElevenLabs (chỉ cần làm 1 lần).
app.post('/api/tools/generate-sfx', wrap(async (req, res) => {
  const items = [
    ['whoosh.mp3', 'fast cinematic whoosh swoosh transition sound, short, clean', 0.8],
    ['pop.mp3', 'short soft bubble pop sound for text appearing, ui sound', 0.5],
    ['ding.mp3', 'bright notification ding, positive, short', 0.8],
  ];
  fs.mkdirSync(path.join(ASSETS_DIR, 'sfx'), { recursive: true });
  for (const [name, prompt, dur] of items) {
    fs.writeFileSync(path.join(ASSETS_DIR, 'sfx', name), await eleven.soundEffect(prompt, dur));
  }
  res.json({ ok: true, files: items.map((i) => i[0]) });
}));

// ---------- Dự án ----------
app.get('/api/jobs', (req, res) => res.json(listJobs()));
app.get('/api/jobs/:id', wrap((req, res) => res.json(mustJob(req))));
app.delete('/api/jobs/:id', wrap((req, res) => {
  deleteJob(req.params.id);
  res.json({ ok: true });
}));

// Tạo dự án từ link (JSON {url}) hoặc file tải lên (multipart "file"); có thể bỏ qua video mẫu.
app.post('/api/jobs', upload.single('file'), wrap((req, res) => {
  const url = (req.body?.url || '').trim();
  if (!url && !req.file && !req.body?.blank) throw new Error('Hãy dán link video hoặc chọn file.');
  const job = createJob({ sourceUrl: url || null });
  if (url) runTask(job.id, 'ingest', (log) => pipeline.ingestUrl(job.id, url, log));
  else if (req.file) runTask(job.id, 'ingest', (log) => pipeline.ingestFile(job.id, req.file.path, fixName(req.file.originalname), log));
  res.json(loadJob(job.id));
}));

app.post('/api/jobs/:id/analyze', wrap((req, res) => {
  const job = mustJob(req);
  runTask(job.id, 'analyze', (log) => pipeline.analyze(job.id, log));
  res.json({ ok: true });
}));

app.post('/api/jobs/:id/script', wrap((req, res) => {
  const job = mustJob(req);
  runTask(job.id, 'script', (log) => pipeline.writeScript(job.id, req.body || {}, log));
  res.json({ ok: true });
}));

// Lưu kịch bản sau khi người dùng sửa tay.
app.put('/api/jobs/:id/script', wrap((req, res) => {
  const job = mustJob(req);
  const incoming = req.body?.script;
  if (!incoming?.scenes) throw new Error('Kịch bản không hợp lệ');
  incoming.scenes = incoming.scenes.map((s) => ({ ...s, id: s.id || `s-${crypto.randomBytes(3).toString('hex')}` }));
  updateJob(job.id, (j) => {
    j.script = { ...(j.script || {}), ...incoming };
    if (req.body.brief) j.brief = { ...(j.brief || {}), ...req.body.brief };
  });
  res.json(loadJob(job.id));
}));

app.post('/api/jobs/:id/media', upload.array('files', 50), wrap(async (req, res) => {
  const job = mustJob(req);
  const dir = path.join(jobDir(job.id), 'media');
  fs.mkdirSync(dir, { recursive: true });
  const added = [];
  for (const f of req.files || []) {
    const name = fixName(f.originalname);
    const ext = path.extname(name).toLowerCase();
    const isVideo = /^video\//.test(f.mimetype) || ['.mp4', '.mov', '.webm', '.mkv', '.m4v'].includes(ext);
    const isImage = /^image\//.test(f.mimetype) || ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
    if (!isVideo && !isImage) {
      fs.rmSync(f.path, { force: true });
      continue;
    }
    const id = crypto.randomBytes(4).toString('hex');
    const file = path.join(dir, `${id}${ext || (isVideo ? '.mp4' : '.jpg')}`);
    fs.renameSync(f.path, file);
    const info = isVideo ? await probe(file) : {};
    added.push({ id, name, type: isVideo ? 'video' : 'image', file, url: fileUrl(file), duration: info.duration || null });
  }
  updateJob(job.id, (j) => j.media.push(...added));
  res.json(loadJob(job.id));
}));

app.delete('/api/jobs/:id/media/:mid', wrap((req, res) => {
  const job = mustJob(req);
  const m = job.media.find((x) => x.id === req.params.mid);
  if (m) fs.rmSync(m.file, { force: true });
  updateJob(job.id, (j) => {
    j.media = j.media.filter((x) => x.id !== req.params.mid);
    for (const s of j.script?.scenes || []) if (s.mediaId === req.params.mid) delete s.mediaId;
  });
  res.json(loadJob(job.id));
}));

app.post('/api/jobs/:id/music', upload.single('file'), wrap((req, res) => {
  const job = mustJob(req);
  if (!req.file) throw new Error('Chưa chọn file nhạc');
  const name = fixName(req.file.originalname);
  const file = path.join(jobDir(job.id), `music${path.extname(name) || '.mp3'}`);
  if (job.music?.file) fs.rmSync(job.music.file, { force: true });
  fs.renameSync(req.file.path, file);
  updateJob(job.id, (j) => (j.music = { name, file, url: fileUrl(file) }));
  res.json(loadJob(job.id));
}));

app.post('/api/jobs/:id/render', wrap((req, res) => {
  const job = mustJob(req);
  runTask(job.id, 'render', (log) => pipeline.produce(job.id, req.body || {}, log));
  res.json({ ok: true });
}));

app.listen(PORT, '127.0.0.1', () => {
  const s = getSettings();
  console.log(`\n🎬 Video Studio đang chạy: http://localhost:${PORT}\n`);
  if (!s.geminiApiKey) console.log('   → Mở trang trên, vào ⚙ Cài đặt để nhập Gemini API key.\n');
  warmUp();
});
