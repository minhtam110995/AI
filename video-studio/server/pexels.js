// Kho video/ảnh miễn phí Pexels (key miễn phí tại https://www.pexels.com/api/).
import fs from 'node:fs';
import { getSettings } from './config.js';

const BASE = 'https://api.pexels.com';

async function call(path) {
  const k = getSettings().pexelsApiKey;
  if (!k) return null;
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: k } });
  if (!res.ok) throw new Error(`Pexels báo lỗi (${res.status})`);
  return res.json();
}

export const hasPexels = () => !!getSettings().pexelsApiKey;

// Tìm 1 clip hợp khung hình; tránh trùng clip đã dùng. Trả về { url, type, credit } hoặc null.
export async function findStock(query, { orientation, minDuration = 3, usedIds = new Set() }) {
  const q = encodeURIComponent(query);
  const vids = await call(`/videos/search?query=${q}&orientation=${orientation}&per_page=15&size=medium`);
  const candidates = (vids?.videos || []).filter((v) => !usedIds.has(`v${v.id}`) && v.duration >= Math.min(minDuration, 5));
  for (const v of candidates) {
    const files = (v.video_files || [])
      .filter((f) => f.file_type === 'video/mp4' && f.width && f.height)
      .sort((a, b) => Math.abs(Math.max(a.width, a.height) - 1920) - Math.abs(Math.max(b.width, b.height) - 1920));
    if (files[0]) {
      usedIds.add(`v${v.id}`);
      return { url: files[0].link, type: 'video', credit: `Pexels – ${v.user?.name || ''}` };
    }
  }
  const photos = await call(`/v1/search?query=${q}&orientation=${orientation}&per_page=10`);
  const p = (photos?.photos || []).find((ph) => !usedIds.has(`p${ph.id}`));
  if (p) {
    usedIds.add(`p${p.id}`);
    return { url: p.src.large2x || p.src.original, type: 'image', credit: `Pexels – ${p.photographer}` };
  }
  return null;
}

export async function download(url, file) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được file từ kho (${res.status})`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return file;
}
