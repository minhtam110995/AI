// Các thao tác ffmpeg: đo thời lượng, phát hiện điểm cắt, chuẩn hoá clip, xử lý audio.
// Dùng bản ffmpeg đóng gói sẵn (ffmpeg-static) nên người dùng không phải cài thêm.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import ffmpegPath from 'ffmpeg-static';

export function run(args, { onStderr } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(ffmpegPath, ['-hide_banner', ...args]);
    let stderr = '';
    p.stderr.on('data', (d) => {
      stderr += d;
      if (stderr.length > 2_000_000) stderr = stderr.slice(-1_000_000);
      onStderr?.(String(d));
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(`ffmpeg lỗi (mã ${code}): ${stderr.slice(-800)}`));
    });
  });
}

// Đọc thông tin file bằng "ffmpeg -i" (ffmpeg-static không kèm ffprobe).
export async function probe(file) {
  let out = '';
  try {
    out = await run(['-i', file, '-f', 'null', '-t', '0', '-']);
  } catch (e) {
    out = e.message;
  }
  const dur = out.match(/Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/);
  const duration = dur ? +dur[1] * 3600 + +dur[2] * 60 + +dur[3] : 0;
  const v = out.match(/Video: [^\n]*?(\d{2,5})x(\d{2,5})/);
  const rot = out.match(/rotation of (-?\d+(?:\.\d+)?) degrees|rotate\s*:\s*(-?\d+)/);
  let width = v ? +v[1] : 0;
  let height = v ? +v[2] : 0;
  const r = rot ? Math.abs(Number(rot[1] ?? rot[2])) : 0;
  if (r === 90 || r === 270) [width, height] = [height, width];
  return { duration, width, height, hasVideo: !!v, hasAudio: /Audio: /.test(out) };
}

// Thời điểm các lần chuyển cảnh (giây) – dùng để đo nhịp cắt thật của video mẫu.
export async function detectCuts(file, threshold = 0.3) {
  const out = await run([
    '-i', file, '-an', '-vf', `scale=320:-2,select='gt(scene,${threshold})',showinfo`, '-f', 'null', '-',
  ]);
  const cuts = [...out.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map((m) => +(+m[1]).toFixed(2));
  return cuts.filter((t, i) => i === 0 || t - cuts[i - 1] > 0.25);
}

// Ảnh chụp tại một thời điểm (làm thumbnail).
export async function snapshot(file, atSec, outFile) {
  await run(['-y', '-ss', String(Math.max(0, atSec)), '-i', file, '-frames:v', '1', '-vf', 'scale=480:-2', outFile]);
  return outFile;
}

// Clip -> đúng kích thước khung, đúng thời lượng cảnh, lặp nếu clip ngắn, bỏ tiếng.
export async function normalizeClip(input, output, { width, height, duration, fps = 30, startAt = 0 }) {
  await run([
    '-y', '-stream_loop', '-1', '-ss', String(startAt), '-i', input, '-t', duration.toFixed(3),
    '-vf', `scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height},setsar=1,fps=${fps}`,
    '-an', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', output,
  ]);
  return output;
}

// Ảnh -> giới hạn kích thước để Remotion tải nhanh.
export async function normalizeImage(input, output, maxSide = 2160) {
  await run([
    '-y', '-i', input, '-vf', `scale='min(${maxSide},iw)':'min(${maxSide},ih)':force_original_aspect_ratio=decrease`,
    '-q:v', '3', output,
  ]);
  return output;
}

// PCM 16-bit mono (Gemini TTS trả về) -> WAV.
export function pcmToWav(pcm, wavFile, sampleRate = 24000) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(wavFile, Buffer.concat([header, pcm]));
  return wavFile;
}

// Đổi tốc độ đọc mà giữ nguyên cao độ giọng; đồng thời chuẩn hoá về WAV 44.1kHz.
export async function retimeAudio(input, output, tempo = 1) {
  const filters = [];
  let t = tempo;
  while (t > 2) { filters.push('atempo=2'); t /= 2; }
  while (t < 0.5) { filters.push('atempo=0.5'); t /= 0.5; }
  if (Math.abs(t - 1) > 0.001) filters.push(`atempo=${t.toFixed(4)}`);
  const args = ['-y', '-i', input];
  if (filters.length) args.push('-af', filters.join(','));
  args.push('-ar', '44100', '-ac', '1', output);
  await run(args);
  return output;
}
