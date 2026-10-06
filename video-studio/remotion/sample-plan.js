// Plan mẫu (không cần API) để xem trước template trong Remotion Studio và để chạy thử dựng video.
const SCENES = [
  ['hook', 'Đừng mua kem chống nắng nếu bạn chưa biết điều này!', 'SAI LẦM 90% NGƯỜI MẮC'],
  ['van-de', 'Rất nhiều bạn bôi mỗi sáng mà da vẫn sạm, vẫn nổi mụn.', 'Da vẫn sạm? 😩'],
  ['giai-phap', 'Bí quyết là chọn đúng chỉ số và bôi lại sau mỗi bốn tiếng.', 'Bôi lại sau 4 tiếng'],
  ['loi-ich', 'Làn da đều màu, mịn màng chỉ sau hai tuần sử dụng.', 'Đều màu sau 2 tuần ✨'],
  ['cta', 'Bấm vào giỏ hàng để nhận ưu đãi hôm nay nhé!', 'Ưu đãi hôm nay'],
];

export function makeSamplePlan({ template = 'viral-captions', width = 1080, height = 1920, media = [], voices = [], music = null, sfx = {}, style = {} } = {}) {
  const fps = 30;
  let t = 0;
  const words = [];
  const scenes = SCENES.map(([role, voiceover, onScreenText], i) => {
    const tokens = voiceover.split(' ');
    const speak = tokens.length / 3.1;
    tokens.forEach((w, k) => {
      const s = t + 0.05 + (k / tokens.length) * speak;
      words.push({ text: w, start: s, end: s + speak / tokens.length, scene: i });
    });
    const duration = speak + (i === SCENES.length - 1 ? 0.7 : 0.25);
    const scene = { index: i, role, onScreenText, start: t, duration, overlap: 0.5, media: media[i] || { type: 'none' }, voice: voices[i] || null };
    t += duration;
    return scene;
  });
  return {
    fps,
    width,
    height,
    durationInFrames: Math.ceil(t * fps),
    template,
    style,
    headline: 'Sự thật về kem chống nắng',
    brand: 'Topmax Beauty',
    cta: { text: 'Mua ngay', sub: 'Link ở giỏ hàng 🛒' },
    scenes,
    words,
    music,
    sfx,
  };
}

export const samplePlan = makeSamplePlan();
