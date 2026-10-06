// Tải video từ link (Facebook, TikTok, YouTube, Instagram…) bằng yt-dlp.
// Nếu máy chưa có yt-dlp, tự tải bản chính thức từ GitHub về thư mục bin/.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import ffmpegPath from 'ffmpeg-static';
import { BIN_DIR, getSettings } from './config.js';

function releaseAsset() {
  if (process.platform === 'win32') return 'yt-dlp.exe';
  if (process.platform === 'darwin') return 'yt-dlp_macos';
  return process.arch === 'arm64' ? 'yt-dlp_linux_aarch64' : 'yt-dlp_linux';
}

const localBinary = () => path.join(BIN_DIR, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp');

function onPath() {
  const r = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['yt-dlp'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null;
}

export async function ensureYtDlp(log = () => {}) {
  const local = localBinary();
  if (fs.existsSync(local)) return local;
  const sys = onPath();
  if (sys) return sys;
  log('Đang tải công cụ yt-dlp lần đầu…');
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const url = `https://github.com/yt-dlp/yt-dlp/releases/latest/download/${releaseAsset()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Không tải được yt-dlp (${res.status}). Hãy tải thủ công tại ${url} và đặt vào thư mục bin/.`);
  fs.writeFileSync(local, Buffer.from(await res.arrayBuffer()));
  fs.chmodSync(local, 0o755);
  return local;
}

function exec(bin, args, log) {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => {
      out += d;
      const m = String(d).match(/\[download\]\s+(\d+(?:\.\d+)?)%/);
      if (m) log(`Đang tải video… ${Math.round(+m[1])}%`);
    });
    p.stderr.on('data', (d) => (err += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(err.trim().split('\n').slice(-3).join('\n') || `yt-dlp lỗi ${code}`))));
  });
}

export async function updateYtDlp() {
  const bin = await ensureYtDlp();
  return exec(bin, ['-U'], () => {});
}

// Tải về <dir>/source.mp4, trả về { file, title, description, uploader }.
export async function downloadVideo(url, dir, log = () => {}) {
  const bin = await ensureYtDlp(log);
  const { cookiesFromBrowser } = getSettings();
  const args = [
    url,
    '--no-playlist',
    '--no-warnings',
    '--newline',
    '-f', 'bv*[height<=1920][ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b',
    '--merge-output-format', 'mp4',
    '--ffmpeg-location', ffmpegPath,
    '--write-info-json',
    '-o', path.join(dir, 'source.%(ext)s'),
  ];
  if (cookiesFromBrowser && cookiesFromBrowser !== 'none') args.push('--cookies-from-browser', cookiesFromBrowser);
  const cookieFile = path.join(BIN_DIR, 'cookies.txt');
  if (fs.existsSync(cookieFile) && (!cookiesFromBrowser || cookiesFromBrowser === 'none')) args.push('--cookies', cookieFile);

  log('Đang tải video mẫu…');
  try {
    await exec(bin, args, log);
  } catch (e) {
    throw new Error(
      `Không tải được video: ${e.message}\n` +
        '→ Thử: (1) kiểm tra link mở được không, (2) chọn trình duyệt lấy cookie trong Cài đặt nếu video cần đăng nhập, ' +
        '(3) bấm "Cập nhật yt-dlp", hoặc (4) tải video về máy rồi chọn "Tải file lên".',
    );
  }
  const file = fs.readdirSync(dir).find((f) => /^source\.(mp4|mkv|webm|mov)$/.test(f));
  if (!file) throw new Error('Tải xong nhưng không thấy file video.');
  let info = {};
  try {
    info = JSON.parse(fs.readFileSync(path.join(dir, 'source.info.json'), 'utf8'));
  } catch {}
  return {
    file: path.join(dir, file),
    title: info.title || '',
    description: info.description || '',
    uploader: info.uploader || info.channel || '',
  };
}
