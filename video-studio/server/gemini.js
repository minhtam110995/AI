// Gemini API (Google AI Studio): xem video mẫu, viết kịch bản, đọc giọng (TTS).
import fs from 'node:fs';
import { getSettings } from './config.js';

const BASE = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';

function key() {
  const k = getSettings().geminiApiKey;
  if (!k) throw new Error('Chưa nhập Gemini API key (mục ⚙ Cài đặt). Lấy miễn phí tại https://aistudio.google.com/apikey');
  return k;
}

async function call(url, init = {}) {
  const res = await fetch(url, {
    ...init,
    headers: { 'x-goog-api-key': key(), ...(init.headers || {}) },
  });
  const text = await res.text();
  if (!res.ok) {
    let msg = text;
    try {
      msg = JSON.parse(text).error?.message || text;
    } catch {}
    throw new Error(`Gemini báo lỗi (${res.status}): ${msg.slice(0, 500)}`);
  }
  return { res, body: text ? JSON.parse(text) : {} };
}

// Upload video lên Files API rồi chờ Gemini xử lý xong.
export async function uploadFile(file, mimeType, log = () => {}) {
  const size = fs.statSync(file).size;
  log('Đang gửi video cho Gemini…');
  const { res } = await call(`${BASE}/upload/v1beta/files`, {
    method: 'POST',
    headers: {
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'video-mau' } }),
  });
  const uploadUrl = res.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Gemini không trả về địa chỉ upload.');
  const { body } = await call(uploadUrl, {
    method: 'POST',
    headers: { 'X-Goog-Upload-Command': 'upload, finalize', 'X-Goog-Upload-Offset': '0', 'Content-Length': String(size) },
    body: fs.readFileSync(file),
  });
  let f = body.file;
  for (let i = 0; i < 120 && f.state === 'PROCESSING'; i++) {
    log('Gemini đang xem video…');
    await new Promise((r) => setTimeout(r, 2500));
    f = (await call(`${BASE}/v1beta/${f.name}`)).body;
  }
  if (f.state !== 'ACTIVE') throw new Error(`Gemini không xử lý được video (trạng thái ${f.state}).`);
  return f; // { name, uri, mimeType }
}

function extractJson(text) {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('Gemini trả về dữ liệu không đúng định dạng JSON, hãy thử lại.');
  }
}

// Gọi model văn bản/đa phương tiện, yêu cầu trả JSON.
export async function generateJson({ prompt, file, temperature = 0.7 }) {
  const { geminiModel } = getSettings();
  const parts = [];
  if (file) parts.push({ file_data: { mime_type: file.mimeType, file_uri: file.uri } });
  parts.push({ text: prompt });
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { body } = await call(`${BASE}/v1beta/models/${geminiModel}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature, responseMimeType: 'application/json' },
        }),
      });
      const text = (body.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
      if (!text) throw new Error(`Gemini không trả lời (${body.candidates?.[0]?.finishReason || body.promptFeedback?.blockReason || 'không rõ lý do'}).`);
      return extractJson(text);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// 30 giọng có sẵn của Gemini TTS (đọc được tiếng Việt). API không có lệnh liệt kê nên ghi sẵn ở đây.
export const GEMINI_VOICES = [
  ['Zephyr', 'Nữ', 'Tươi sáng'], ['Puck', 'Nam', 'Sôi nổi'], ['Charon', 'Nam', 'Rõ ràng, thông tin'],
  ['Kore', 'Nữ', 'Chắc chắn'], ['Fenrir', 'Nam', 'Hào hứng'], ['Leda', 'Nữ', 'Trẻ trung'],
  ['Orus', 'Nam', 'Chắc chắn'], ['Aoede', 'Nữ', 'Nhẹ nhàng, thoáng'], ['Callirrhoe', 'Nữ', 'Thoải mái'],
  ['Autonoe', 'Nữ', 'Tươi sáng'], ['Enceladus', 'Nam', 'Thì thầm, hơi thở'], ['Iapetus', 'Nam', 'Trong trẻo'],
  ['Umbriel', 'Nam', 'Thoải mái'], ['Algieba', 'Nam', 'Mượt mà'], ['Despina', 'Nữ', 'Mượt mà'],
  ['Erinome', 'Nữ', 'Trong trẻo'], ['Algenib', 'Nam', 'Trầm khàn'], ['Rasalgethi', 'Nam', 'Rõ ràng, thông tin'],
  ['Laomedeia', 'Nữ', 'Sôi nổi'], ['Achernar', 'Nữ', 'Mềm mại'], ['Alnilam', 'Nam', 'Chắc chắn'],
  ['Schedar', 'Nam', 'Đều đặn'], ['Gacrux', 'Nữ', 'Trưởng thành'], ['Pulcherrima', 'Nữ', 'Thẳng thắn'],
  ['Achird', 'Nam', 'Thân thiện'], ['Zubenelgenubi', 'Nam', 'Đời thường'], ['Vindemiatrix', 'Nữ', 'Dịu dàng'],
  ['Sadachbia', 'Nam', 'Sống động'], ['Sadaltager', 'Nam', 'Hiểu biết'], ['Sulafat', 'Nữ', 'Ấm áp'],
].map(([id, gender, style]) => ({ id, name: id, gender, description: style, provider: 'gemini' }));

// Trả về PCM 16-bit mono 24kHz.
export async function tts(text, voice, styleHint = '') {
  const { geminiTtsModel } = getSettings();
  const prompt = styleHint ? `${styleHint}:\n${text}` : text;
  const { body } = await call(`${BASE}/v1beta/models/${geminiTtsModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    }),
  });
  const data = body.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!data) throw new Error('Gemini TTS không trả về âm thanh.');
  return Buffer.from(data, 'base64');
}
