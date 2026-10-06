// Mỗi "dự án" (job) là một thư mục data/jobs/<id>/ chứa job.json và mọi file liên quan.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { JOBS_DIR, PORT } from './config.js';

export const jobDir = (id) => path.join(JOBS_DIR, id);

export function fileUrl(absPath) {
  const rel = path.relative(path.join(JOBS_DIR, '..'), absPath).split(path.sep).join('/');
  return `/files/${rel}`;
}
// Remotion (Chrome headless) tải media qua địa chỉ đầy đủ.
export const absoluteUrl = (absPath) => `http://127.0.0.1:${PORT}${fileUrl(absPath)}`;

export function createJob(fields = {}) {
  const id = `${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${crypto.randomBytes(3).toString('hex')}`;
  fs.mkdirSync(jobDir(id), { recursive: true });
  const job = { id, createdAt: Date.now(), status: { state: 'idle' }, media: [], ...fields };
  saveJob(job);
  return job;
}

export function loadJob(id) {
  if (!/^[\w-]+$/.test(id)) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(jobDir(id), 'job.json'), 'utf8'));
  } catch {
    return null;
  }
}

export function saveJob(job) {
  const file = path.join(jobDir(job.id), 'job.json');
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(job, null, 2));
  fs.renameSync(`${file}.tmp`, file);
  return job;
}

export function updateJob(id, mutate) {
  const job = loadJob(id);
  if (!job) throw new Error('Không tìm thấy dự án');
  mutate(job);
  return saveJob(job);
}

export function listJobs() {
  return fs
    .readdirSync(JOBS_DIR)
    .map(loadJob)
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((j) => ({
      id: j.id,
      createdAt: j.createdAt,
      title: j.script?.title || j.source?.title || j.sourceUrl || j.id,
      thumb: j.source?.thumb,
      hasOutput: !!j.output,
    }));
}

export function deleteJob(id) {
  if (!loadJob(id)) return;
  fs.rmSync(jobDir(id), { recursive: true, force: true });
}

const running = new Set();

// Chạy một bước nặng ở nền; giao diện hỏi trạng thái qua GET /api/jobs/:id.
export function runTask(id, stage, fn) {
  if (running.has(id)) throw new Error('Dự án đang chạy một bước khác, vui lòng đợi.');
  running.add(id);
  const setStatus = (patch) => updateJob(id, (j) => (j.status = { ...j.status, ...patch, updatedAt: Date.now() }));
  setStatus({ state: 'running', stage, message: 'Đang bắt đầu…', progress: 0, error: null });
  const log = (message, progress) => setStatus(progress === undefined ? { message } : { message, progress });
  Promise.resolve()
    .then(() => fn(log))
    .then(() => setStatus({ state: 'done', message: 'Xong', progress: 1 }))
    .catch((e) => {
      console.error(`[${id}] ${stage}:`, e);
      setStatus({ state: 'error', error: e.message || String(e) });
    })
    .finally(() => running.delete(id));
}
