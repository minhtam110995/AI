// Cài đặt (API key, model) lưu trong data/settings.json trên máy người dùng.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const JOBS_DIR = path.join(DATA_DIR, 'jobs');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const BIN_DIR = path.join(ROOT, 'bin');
export const ASSETS_DIR = path.join(ROOT, 'assets');
export const PORT = Number(process.env.PORT || 3210);

const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

export const DEFAULT_SETTINGS = {
  geminiApiKey: '',
  elevenLabsApiKey: '',
  pexelsApiKey: '',
  // Model đổi được trong phần Cài đặt khi Google/ElevenLabs ra bản mới.
  geminiModel: 'gemini-2.5-flash',
  geminiTtsModel: 'gemini-2.5-flash-preview-tts',
  elevenLabsModel: 'eleven_flash_v2_5',
  // Cookie Facebook/TikTok cho video riêng tư: none | chrome | edge | firefox | brave
  cookiesFromBrowser: 'none',
};

for (const dir of [DATA_DIR, JOBS_DIR, CACHE_DIR]) fs.mkdirSync(dir, { recursive: true });

export function getSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(patch) {
  const next = { ...getSettings() };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof patch[key] === 'string') next[key] = patch[key].trim();
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2));
  return next;
}

// Trả về cho giao diện: không lộ key đầy đủ.
export function publicSettings() {
  const s = getSettings();
  const mask = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');
  return {
    ...s,
    geminiApiKey: mask(s.geminiApiKey),
    elevenLabsApiKey: mask(s.elevenLabsApiKey),
    pexelsApiKey: mask(s.pexelsApiKey),
    hasGemini: !!s.geminiApiKey,
    hasElevenLabs: !!s.elevenLabsApiKey,
    hasPexels: !!s.pexelsApiKey,
  };
}
