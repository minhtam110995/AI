// ElevenLabs API: danh sách giọng, đọc giọng kèm mốc thời gian từng ký tự, tạo hiệu ứng âm thanh.
import { getSettings } from './config.js';

const BASE = process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io';

// Model đọc được tiếng Việt: eleven_v3, eleven_flash_v2_5, eleven_turbo_v2_5.
export const ELEVEN_MODELS = [
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5 – nhanh, rẻ, có tiếng Việt' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5 – cân bằng, có tiếng Việt' },
  { id: 'eleven_v3', name: 'v3 – biểu cảm nhất, có tiếng Việt' },
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2 – không có tiếng Việt' },
];

function key() {
  const k = getSettings().elevenLabsApiKey;
  if (!k) throw new Error('Chưa nhập ElevenLabs API key (mục ⚙ Cài đặt).');
  return k;
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'xi-api-key': key(), ...(init.headers || {}) },
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const d = JSON.parse(text).detail;
      msg = typeof d === 'string' ? d : d?.message || text;
    } catch {}
    throw new Error(`ElevenLabs báo lỗi (${res.status}): ${String(msg).slice(0, 400)}`);
  }
  return res;
}

export async function listVoices() {
  const res = await call('/v1/voices');
  const { voices = [] } = await res.json();
  const genders = { male: 'Nam', female: 'Nữ', neutral: 'Trung tính' };
  return voices.map((v) => ({
    id: v.voice_id,
    name: v.name,
    gender: genders[v.labels?.gender] || v.labels?.gender || '',
    description: [v.labels?.accent, v.labels?.age, v.labels?.description || v.labels?.descriptive, v.labels?.use_case]
      .filter(Boolean)
      .join(' · '),
    category: v.category,
    previewUrl: v.preview_url,
    provider: 'elevenlabs',
  }));
}

// Trả về { audio: Buffer(mp3), words: [{text,start,end}] }.
export async function tts(text, voiceId, { speed = 1, modelId } = {}) {
  const model = modelId || getSettings().elevenLabsModel;
  const body = {
    text,
    model_id: model,
    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.2, speed: Math.min(1.2, Math.max(0.7, speed)) },
  };
  if (/_v2_5$/.test(model)) body.language_code = 'vi';
  const res = await call(`/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  const audio = Buffer.from(data.audio_base64, 'base64');
  return { audio, words: alignmentToWords(data.alignment || data.normalized_alignment) };
}

// Ghép mốc thời gian từng ký tự thành từng từ.
function alignmentToWords(al) {
  if (!al?.characters) return null;
  const words = [];
  let cur = null;
  al.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) {
      if (cur) words.push(cur);
      cur = null;
      return;
    }
    if (!cur) cur = { text: '', start: al.character_start_times_seconds[i], end: 0 };
    cur.text += ch;
    cur.end = al.character_end_times_seconds[i];
  });
  if (cur) words.push(cur);
  return words;
}

// Hiệu ứng âm thanh (whoosh, pop…) cho bộ SFX.
export async function soundEffect(prompt, durationSeconds = 1) {
  const res = await call('/v1/sound-generation', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, duration_seconds: durationSeconds, prompt_influence: 0.6 }),
  });
  return Buffer.from(await res.arrayBuffer());
}
