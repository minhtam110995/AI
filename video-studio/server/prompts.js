// Prompt gửi Gemini: (1) phân tích video mẫu, (2) viết kịch bản mới theo đúng công thức.
import { TEMPLATES, FONTS } from '../remotion/templates/catalog.js';

const templateList = TEMPLATES.map((t) => `- "${t.id}": ${t.name} – ${t.description} (hợp: ${t.bestFor})`).join('\n');

export function analysisPrompt({ title, description, measured }) {
  return `Bạn là chuyên gia phân tích video ngắn viral (TikTok, Facebook Reels, YouTube Shorts) tại Việt Nam.
Hãy xem KỸ video đính kèm (cả hình, chữ trên màn hình, giọng nói, nhạc, hiệu ứng) và mổ xẻ "công thức" của nó.

Thông tin thêm:
- Tiêu đề/mô tả bài đăng: ${JSON.stringify((title + '\n' + description).slice(0, 1500))}
- Số liệu đo bằng máy: thời lượng ${measured.duration.toFixed(1)}s, khung ${measured.width}x${measured.height}, ${measured.cuts} lần cắt cảnh, trung bình ${measured.avgShotSec.toFixed(2)}s/cảnh.

Các template edit hệ thống đang có:
${templateList}

Font hệ thống: ${Object.keys(FONTS).join(', ')}.

Trả về DUY NHẤT một JSON (tiếng Việt cho mọi chữ mô tả) đúng cấu trúc:
{
  "summary": "Video nói về gì, cho ai, mục tiêu (1-2 câu)",
  "videoType": "Loại video (vd: Bán hàng TikTok Shop, Chia sẻ kiến thức, Kể chuyện, Review, Top danh sách, Tin tức, Talking head…)",
  "language": "vi",
  "hook": { "text": "Câu/khung hook 3 giây đầu", "technique": "Kỹ thuật hook (gây tò mò, nỗi đau, con số, phản biện…)", "visual": "Hình ảnh mở đầu" },
  "transcript": "Toàn bộ lời thoại/lời đọc, chép nguyên văn",
  "structure": [
    { "start": 0, "end": 3, "role": "hook | van-de | giai-phap | bang-chung | loi-ich | huong-dan | cau-chuyen | cta", "voiceover": "lời đọc đoạn này", "onScreenText": "chữ hiện trên màn hình", "visual": "mô tả hình ảnh/góc máy", "shotType": "cận cảnh / trung cảnh / màn hình / b-roll…" }
  ],
  "editStyle": {
    "pacing": "rất nhanh | nhanh | vừa | chậm",
    "summary": "Mô tả phong cách edit trong 1-2 câu",
    "captionsOn": true,
    "captionPosition": "center | lower | bottom",
    "captionFont": "một trong: ${Object.keys(FONTS).join(' | ')} (chọn cái gần nhất)",
    "captionUppercase": false,
    "captionColor": "#FFFFFF",
    "highlightColor": "#FFD400 (màu tô từ đang đọc, nếu có)",
    "captionBoxed": false,
    "wordsPerChunk": 3,
    "zoomPunch": false,
    "kenBurns": true,
    "transition": "cut | fade | slide | zoom | whip",
    "colorGrade": "none | warm | cool | vivid | bw | dark",
    "progressBar": false,
    "accentColor": "#FF3B30 (màu nhấn chủ đạo)",
    "headlineBar": false,
    "music": { "present": true, "mood": "", "tempo": "" },
    "sfx": ["whoosh khi chuyển cảnh", "pop khi chữ hiện"…],
    "voice": { "type": "người thật nói | lồng tiếng AI | không lời", "gender": "nam | nữ", "tone": "vd: hào hứng, thân mật", "pace": "nhanh | vừa | chậm" },
    "notes": ["các điểm edit đặc biệt khác"]
  },
  "whyItWorks": ["3-6 lý do video này hiệu quả"],
  "recommendedTemplate": "id template gần nhất trong danh sách trên",
  "templateReason": "Vì sao chọn template đó"
}`;
}

const WORDS_PER_SEC = 3.1; // tốc độ đọc tiếng Việt tự nhiên (số tiếng/giây)

export function scenePlan(duration, pacing = 'vừa') {
  const per = /rất nhanh/.test(pacing) ? 2.5 : /nhanh/.test(pacing) ? 3.5 : /chậm/.test(pacing) ? 6 : 4.5;
  return {
    words: Math.round(duration * WORDS_PER_SEC * 0.92),
    scenes: Math.max(3, Math.min(30, Math.round(duration / per))),
  };
}

export function scriptPrompt({ analysis, brief, duration, aspect, templateId, hasUserMedia }) {
  const plan = scenePlan(duration, analysis?.editStyle?.pacing);
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const sample = analysis
    ? JSON.stringify({
        summary: analysis.summary,
        videoType: analysis.videoType,
        hook: analysis.hook,
        structure: (analysis.structure || []).map(({ role, voiceover, onScreenText }) => ({ role, voiceover, onScreenText })),
        voice: analysis.editStyle?.voice,
        whyItWorks: analysis.whyItWorks,
      })
    : 'Không có video mẫu – tự đề xuất cấu trúc tốt nhất.';

  return `Bạn là biên kịch video ngắn viral tại Việt Nam. Nhiệm vụ: viết kịch bản MỚI cho chủ đề/sản phẩm của khách,
dùng ĐÚNG CÔNG THỨC của video mẫu (kiểu hook, trình tự các phần, nhịp, giọng điệu, cách kêu gọi) nhưng KHÔNG sao chép câu chữ.

PHÂN TÍCH VIDEO MẪU:
${sample}

THÔNG TIN KHÁCH:
- Chủ đề / sản phẩm: ${brief.topic || '(chưa nhập)'}
- Điểm nổi bật / thông tin cần có: ${brief.details || '(không có)'}
- Khách hàng mục tiêu: ${brief.audience || '(tự suy luận)'}
- Lời kêu gọi mong muốn: ${brief.cta || '(tự đề xuất)'}
- Giọng điệu: ${brief.tone || 'giống video mẫu'}
- Ghi chú thêm: ${brief.notes || '(không có)'}
- Ngôn ngữ: ${brief.language || 'Tiếng Việt'}

YÊU CẦU KỸ THUẬT:
- Thời lượng: ${duration} giây, khung ${aspect}. Template edit: ${t.name} (${t.description}).
- Tổng lời đọc khoảng ${plan.words} tiếng (±10%) — đây là ràng buộc quan trọng để khớp thời lượng.
- Chia khoảng ${plan.scenes} cảnh. Mỗi cảnh = 1 câu/ý đọc liền mạch.
- Cảnh 1 là hook mạnh trong 3 giây đầu, dùng cùng kỹ thuật hook với video mẫu.
- Cảnh cuối là CTA (trừ khi video mẫu không có).
- Lời đọc viết để NGHE: câu ngắn, tự nhiên, không ký hiệu, không emoji, số viết bằng chữ khi cần đọc rõ, không viết tắt.
- "onScreenText": chữ nổi trên màn hình, tối đa 6 từ, có thể kèm 1 emoji.
- "source": "product" nếu cảnh cần hình sản phẩm/ảnh của khách${hasUserMedia ? ' (khách ĐÃ có ảnh/clip sản phẩm)' : ' (khách CHƯA có ảnh – ưu tiên stock)'}, "stock" nếu dùng video kho minh hoạ.
- "stockKeywords": 2-4 từ TIẾNG ANH để tìm video kho Pexels (cụ thể, dễ quay, vd "woman drinking coffee morning").

Trả về DUY NHẤT JSON:
{
  "title": "Tên ý tưởng video",
  "headline": "Tiêu đề hook ngắn ≤ 10 từ để in cố định trên video",
  "scenes": [
    { "role": "hook", "voiceover": "…", "onScreenText": "…", "visualDescription": "mô tả hình nên dùng (tiếng Việt)", "stockKeywords": "…", "source": "product | stock" }
  ],
  "cta": { "text": "Nút kêu gọi ngắn (vd: Mua ngay)", "sub": "dòng phụ (vd: Link ở bình luận)" },
  "postCaption": "Caption đăng bài kèm 3-6 hashtag",
  "whyThisWorks": "Giải thích ngắn công thức đã áp dụng"
}`;
}

export function voiceStyleHint(analysis, tone) {
  const v = analysis?.editStyle?.voice || {};
  const t = tone || v.tone || 'tự nhiên, thân thiện';
  const pace = v.pace || 'vừa';
  // Câu chỉ dẫn viết tiếng Anh để Gemini TTS hiểu là chỉ dẫn, không đọc thành lời.
  return `Read the following Vietnamese text aloud like a social media video creator, tone: "${t}", pace: "${pace}"`;
}
