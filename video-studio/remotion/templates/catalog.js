// Danh mục template edit. Dùng chung cho server (prompt cho Gemini, giao diện) và Remotion (dựng video).
// Mỗi template = bố cục + bộ thông số phong cách mặc định; phân tích video mẫu sẽ ghi đè các thông số này.

export const FONTS = {
  anton: { family: 'Anton', weight: 400, label: 'Anton – chữ đậm cao (viral)' },
  montserrat: { family: 'Montserrat', weight: 800, label: 'Montserrat – đậm hiện đại' },
  'be-vietnam': { family: 'Be Vietnam Pro', weight: 800, label: 'Be Vietnam Pro – dễ đọc' },
  oswald: { family: 'Oswald', weight: 600, label: 'Oswald – hẹp, kiểu tin tức' },
  playfair: { family: 'Playfair Display', weight: 600, label: 'Playfair – có chân, điện ảnh' },
};

export const BASE_STYLE = {
  captionsOn: true,
  captionPosition: 'lower', // center | lower | bottom
  captionFont: 'montserrat',
  captionUppercase: false,
  captionColor: '#FFFFFF',
  highlightColor: '#FFD400',
  captionBoxed: false, // nền hộp sau phụ đề
  captionSize: 1, // hệ số cỡ chữ
  wordsPerChunk: 3,
  zoomPunch: false, // zoom giật theo nhịp phụ đề
  kenBurns: true, // ảnh/clip chuyển động chậm
  transition: 'cut', // cut | fade | slide | zoom | whip
  colorGrade: 'none', // none | warm | cool | vivid | bw | dark
  progressBar: false,
  accentColor: '#FF3B30',
  showOnScreenText: true,
  showCta: true,
  sfx: true,
  musicVolume: 0.12,
};

export const TEMPLATES = [
  {
    id: 'viral-captions',
    name: 'Phụ đề Viral',
    emoji: '🔥',
    description: 'Phụ đề chữ to giữa màn hình, tô vàng từng từ đang đọc, zoom giật theo nhịp, cắt cảnh nhanh.',
    bestFor: 'TikTok/Reels chia sẻ kiến thức, động lực, bán hàng nhịp nhanh',
    style: {
      captionPosition: 'center', captionFont: 'anton', captionUppercase: true, wordsPerChunk: 3,
      captionSize: 1.15, zoomPunch: true, transition: 'cut', colorGrade: 'vivid', progressBar: true,
    },
  },
  {
    id: 'hook-headline',
    name: 'Tiêu đề Hook cố định',
    emoji: '📌',
    description: 'Thanh tiêu đề lớn cố định phía trên suốt video (kiểu Reels Facebook), phụ đề nền hộp phía dưới.',
    bestFor: 'Reels Facebook, câu chuyện, mẹo hay, tin tức đời sống',
    style: {
      captionPosition: 'bottom', captionFont: 'be-vietnam', captionBoxed: true, wordsPerChunk: 5,
      highlightColor: '#FFE14D', transition: 'fade', kenBurns: true, captionSize: 0.9,
    },
  },
  {
    id: 'product-review',
    name: 'Review / Bán hàng',
    emoji: '🛍️',
    description: 'Ảnh sản phẩm chuyển động, nhãn lợi ích bật lên từng cảnh, nút "Mua ngay" nhấp nháy ở cuối.',
    bestFor: 'TikTok Shop, Shopee, giới thiệu sản phẩm, UGC review',
    style: {
      captionPosition: 'lower', captionFont: 'montserrat', wordsPerChunk: 4, highlightColor: '#FF4D8D',
      zoomPunch: false, transition: 'zoom', colorGrade: 'warm', accentColor: '#FF2D55',
    },
  },
  {
    id: 'listicle',
    name: 'Top / Danh sách',
    emoji: '🔢',
    description: 'Mỗi ý có số thứ tự lớn và tiêu đề riêng, chuyển cảnh trượt, phụ đề phía dưới.',
    bestFor: '"5 mẹo…", "3 sai lầm…", so sánh, kiến thức theo ý',
    style: {
      captionPosition: 'bottom', captionFont: 'montserrat', wordsPerChunk: 4, transition: 'slide',
      highlightColor: '#00E0A4', accentColor: '#00B37E', progressBar: true,
    },
  },
  {
    id: 'cinematic-story',
    name: 'Kể chuyện Điện ảnh',
    emoji: '🎬',
    description: 'Khung viền đen điện ảnh, chuyển động chậm, hoà cảnh mềm, phụ đề chữ có chân nhỏ gọn, màu ấm.',
    bestFor: 'Kể chuyện, truyền cảm hứng, thương hiệu, du lịch, bất động sản',
    style: {
      captionPosition: 'bottom', captionFont: 'playfair', wordsPerChunk: 7, captionSize: 0.95,
      highlightColor: '#F5D08A', transition: 'fade', colorGrade: 'warm', showCta: false, musicVolume: 0.18,
    },
  },
  {
    id: 'news-brief',
    name: 'Tin nhanh / Kiến thức',
    emoji: '📰',
    description: 'Băng tiêu đề kiểu bản tin phía dưới, nhãn "TIN NHANH", chữ chạy, chuyển cảnh trượt.',
    bestFor: 'Tin tức, cập nhật thị trường, giải thích sự kiện, kênh kiến thức',
    style: {
      captionPosition: 'center', captionFont: 'oswald', captionUppercase: true, captionBoxed: true,
      wordsPerChunk: 5, captionSize: 0.85, transition: 'slide', colorGrade: 'cool', accentColor: '#E10600',
    },
  },
  {
    id: 'kinetic-text',
    name: 'Chữ động (không cần hình)',
    emoji: '✍️',
    description: 'Chữ lớn hiện theo từng từ trên nền làm mờ hoặc nền màu. Hợp khi không có nhiều hình ảnh.',
    bestFor: 'Trích dẫn, tâm sự, động lực, nội dung chỉ có giọng đọc',
    style: {
      captionPosition: 'center', captionFont: 'be-vietnam', wordsPerChunk: 6, captionSize: 1.1,
      transition: 'fade', colorGrade: 'dark', highlightColor: '#7CF5FF', kenBurns: true,
    },
  },
];

export function resolveStyle(templateId, overrides = {}) {
  const t = TEMPLATES.find((x) => x.id === templateId) || TEMPLATES[0];
  const clean = Object.fromEntries(Object.entries(overrides || {}).filter(([k, v]) => k in BASE_STYLE && v !== null && v !== undefined && v !== ''));
  return { ...BASE_STYLE, ...t.style, ...clean };
}
