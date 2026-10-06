// Chạy thử phần dựng video không cần API key:
//   npm run test:render              → ảnh xem trước 7 template + 1 video mẫu
//   npm run test:render -- --all     → dựng video đủ 7 template
// Kết quả nằm trong thư mục out/.
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, renderStill, selectComposition, ensureBrowser } from '@remotion/renderer';
import { ROOT } from '../server/config.js';
import * as ff from '../server/ffmpeg.js';
import { makeSamplePlan } from '../remotion/sample-plan.js';
import { TEMPLATES } from '../remotion/templates/catalog.js';

const OUT = path.join(ROOT, 'out');
const FIX = path.join(OUT, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });
const all = process.argv.includes('--all');
const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

// 1. Tạo media giả: clip màu chuyển động, ảnh, giọng (tiếng bíp).
const W = 1080, H = 1920;
const make = async (name, args) => {
  const f = path.join(FIX, name);
  if (!fs.existsSync(f)) await ff.run(['-y', ...args, f]);
  return f;
};
const clips = [];
for (const [i, src] of ['testsrc2', 'mandelbrot', 'life=s=320x240:mold=10:r=30:ratio=0.5', 'testsrc2', 'cellauto=s=320x240'].entries()) {
  const raw = await make(`raw-${i}.mp4`, ['-f', 'lavfi', '-i', `${src.includes('=') ? src : `${src}=s=640x480`}`, '-t', '4', '-pix_fmt', 'yuv420p']);
  clips.push(await ff.normalizeClip(raw, path.join(FIX, `clip-${i}.mp4`), { width: W, height: H, duration: 4.5 }));
}
const image = await make('product.jpg', ['-f', 'lavfi', '-i', 'gradients=s=1080x1080:c0=0xff6b9d:c1=0x5b2bff:n=2', '-frames:v', '1']);
const voices = [];
for (let i = 0; i < 5; i++) voices.push(await make(`voice-${i}.wav`, ['-f', 'lavfi', '-i', `sine=frequency=${300 + i * 80}:duration=3`, '-af', 'volume=0.2']));

const app = express();
app.use('/fx', express.static(FIX));
const server = app.listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}/fx/`;

const media = [
  { type: 'video', src: base + 'clip-0.mp4' },
  { type: 'image', src: base + 'product.jpg' },
  { type: 'video', src: base + 'clip-2.mp4' },
  { type: 'none' },
  { type: 'video', src: base + 'clip-4.mp4' },
];

// 2. Đóng gói và dựng.
if (!browserExecutable) await ensureBrowser();
console.log('Đang đóng gói Remotion…');
const serveUrl = await bundle({ entryPoint: path.join(ROOT, 'remotion', 'index.jsx') });

for (const t of TEMPLATES) {
  const aspects = t.id === 'hook-headline' ? [[1080, 1920], [1920, 1080]] : [[1080, 1920]];
  for (const [width, height] of aspects) {
    const plan = makeSamplePlan({ template: t.id, width, height, media, voices: voices.map((v) => base + path.basename(v)) });
    const composition = await selectComposition({ serveUrl, id: 'Main', inputProps: plan, browserExecutable });
    const tag = `${t.id}-${width}x${height}`;
    for (const sec of [1.2, 6.5, plan.durationInFrames / plan.fps - 0.5]) {
      await renderStill({
        serveUrl, composition, inputProps: plan, browserExecutable, frame: Math.min(plan.durationInFrames - 1, Math.round(sec * plan.fps)),
        output: path.join(OUT, `${tag}-${sec.toFixed(1)}s.png`), scale: 0.4,
      });
    }
    console.log('✓ ảnh', tag);
    if (all || t.id === 'viral-captions') {
      const output = path.join(OUT, `${tag}.mp4`);
      await renderMedia({ serveUrl, composition, inputProps: plan, codec: 'h264', pixelFormat: 'yuv420p', colorSpace: 'bt709', outputLocation: output, browserExecutable, concurrency: 4, scale: 0.5 });
      const info = await ff.probe(output);
      console.log(`✓ video ${tag}: ${info.duration.toFixed(1)}s ${info.width}x${info.height} audio=${info.hasAudio}`);
    }
  }
}
server.close();
console.log('Xong → thư mục out/');
