// Dựng video bằng Remotion (React → MP4). Lần đầu chạy, Remotion tự tải Chrome headless (~100MB).
import path from 'node:path';
import os from 'node:os';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition, ensureBrowser } from '@remotion/renderer';
import { ROOT } from './config.js';

let bundlePromise = null;

function getBundle() {
  bundlePromise ??= bundle({ entryPoint: path.join(ROOT, 'remotion', 'index.jsx') }).catch((e) => {
    bundlePromise = null;
    throw e;
  });
  return bundlePromise;
}

const browserExecutable = process.env.REMOTION_BROWSER_EXECUTABLE || null;

export async function renderVideo(plan, outputLocation, onProgress = () => {}) {
  if (!browserExecutable) await ensureBrowser();
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: 'Main', inputProps: plan, browserExecutable });
  await renderMedia({
    serveUrl,
    composition,
    inputProps: plan,
    codec: 'h264',
    crf: 20,
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709', // chuẩn màu video phổ biến, phát đúng màu trên điện thoại/nền tảng
    audioCodec: 'aac',
    outputLocation,
    browserExecutable,
    concurrency: Math.max(1, Math.min(8, Math.floor(os.cpus().length / 2))),
    timeoutInMilliseconds: 120000,
    onProgress: ({ progress }) => onProgress(progress),
  });
  return outputLocation;
}

// Làm nóng bundle khi server khởi động để lần dựng đầu nhanh hơn.
export function warmUp() {
  getBundle().catch((e) => console.warn('Không đóng gói được Remotion:', e.message));
}
