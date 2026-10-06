# 🎬 Video Studio – Dán link mẫu, ra video tương tự

Web app chạy trên máy bạn:
1. Dán link video mẫu (Facebook Reels, TikTok, YouTube Shorts, Instagram…).
2. AI **phân tích kịch bản và phong cách edit** của video đó.
3. AI **viết kịch bản mới** cho sản phẩm hoặc chủ đề của bạn theo đúng công thức.
4. Bạn chọn **thời lượng, khung dọc/ngang, giọng đọc** (ElevenLabs hoặc Gemini) và **template edit**.
5. Phần mềm xuất ra **video MP4 hoàn chỉnh**: giọng đọc, phụ đề chạy theo từng từ, chuyển cảnh, hiệu ứng âm thanh, nhạc nền.

API key chỉ lưu trên máy bạn (`data/settings.json`).

---

## Cài đặt (10 phút, chỉ làm 1 lần)

1. Cài **Node.js** bản LTS tại https://nodejs.org.
2. Tải thư mục `video-studio` về máy: GitHub → **Code → Download ZIP**, rồi giải nén.
3. Chạy ứng dụng:
   - **Windows:** bấm đúp `start-windows.bat`.
   - **Mac:** bấm đúp `start-mac.command`. Lần đầu nếu máy chặn, bấm chuột phải → Open.
   - Hoặc mở Terminal trong thư mục đó và chạy `npm install` rồi `npm start`.
4. Trình duyệt tự mở **http://localhost:3210**. Vào **⚙ Cài đặt** và nhập key:

| Key | Bắt buộc? | Dùng để | Lấy ở đâu |
|---|---|---|---|
| **Gemini API key** | ✅ Có | Xem và phân tích video mẫu, viết kịch bản, giọng Gemini | https://aistudio.google.com/apikey (có gói miễn phí) |
| ElevenLabs API key | Tuỳ chọn | Giọng ElevenLabs (tự nhiên hơn), tạo hiệu ứng âm thanh | https://elevenlabs.io/app/settings/api-keys |
| Pexels API key | Tuỳ chọn | Tự tìm video minh hoạ miễn phí cho các cảnh | https://www.pexels.com/api/ (miễn phí) |

> Lần đầu tải video, phần mềm tự tải công cụ **yt-dlp**. Lần đầu dựng video, Remotion tự tải **Chrome headless** (~100MB). Hai lần này chậm hơn bình thường.

---

## Cách dùng

### Bước 1 – Video mẫu
Dán link rồi bấm **Tải & phân tích**. Nếu link không tải được, tải video về máy rồi chọn **Tải file video lên**. Muốn bỏ qua video mẫu thì chọn **Bỏ qua, tự viết kịch bản từ đầu**.

### Bước 2 – Phân tích (tự chạy)
Phần mềm cho bạn xem:
- **Hook 3 giây đầu** và kỹ thuật hook được dùng.
- **Cấu trúc kịch bản** theo từng mốc thời gian: lời đọc, chữ trên màn hình, hình ảnh.
- **Phong cách edit:**
  - nhịp cắt (đo bằng máy: số lần cắt, số giây mỗi cảnh);
  - kiểu phụ đề, màu chữ và màu nhấn;
  - zoom giật, chuyển cảnh, chỉnh màu;
  - nhạc, hiệu ứng âm thanh, kiểu giọng đọc.
- **Vì sao video hiệu quả**, kèm **template gợi ý** (đánh dấu ⭐).

### Bước 3 – Kịch bản mới
Nhập chủ đề hoặc sản phẩm và các thông tin cần có. Chọn **thời lượng** (15s, 30s, 45s, 1 phút, 1:30 hoặc tuỳ chỉnh) và **khung hình** (Dọc 9:16, Ngang 16:9, Vuông 1:1, 4:5), chọn template, rồi bấm **Viết kịch bản**.

Sau đó bạn sửa trực tiếp từng cảnh: lời đọc, chữ trên màn hình, từ khoá kho video, nguồn hình (ảnh của bạn hay kho Pexels). Bạn cũng có thể chọn file cụ thể cho từng cảnh, đổi thứ tự, thêm hoặc xoá cảnh. Thanh 📏 cho biết lời đọc đã khớp thời lượng chưa.

### Bước 4 – Giọng, hình và xuất video
- **Giọng đọc:** chọn nền tảng **Gemini** hoặc **ElevenLabs**, danh sách giọng của nền tảng đó hiện ra. Bấm ▶ để nghe thử bằng tiếng Việt, rồi chỉnh tốc độ đọc nếu cần.
- **Ảnh/clip sản phẩm:** kéo thả vào để dùng cho các cảnh "Sản phẩm". Các cảnh "Stock" lấy video miễn phí từ Pexels.
- **Phong cách edit:** mặc định bắt chước video mẫu. Bạn chỉnh tay được font, vị trí phụ đề, màu chữ, màu tô từ, chuyển cảnh, zoom giật, chỉnh màu, thanh tiến trình, tên thương hiệu và nhạc nền.
- Bấm **🎬 Tạo video**. Video 30 giây thường mất 1–3 phút. Xong thì xem ngay, tải MP4 và sao chép caption đăng bài.

**Tự khớp thời lượng:** nếu lời đọc dài hoặc ngắn hơn thời lượng đã chọn, phần mềm tự chỉnh tốc độ đọc (tối đa ±20%, giữ nguyên cao độ giọng) và giãn khoảng nghỉ giữa các câu.

---

## 7 template edit

| Template | Đặc điểm | Hợp với |
|---|---|---|
| 🔥 **Phụ đề Viral** | Chữ to giữa màn hình, tô màu từ đang đọc, zoom giật, cắt nhanh, thanh tiến trình | Kiến thức, động lực, bán hàng nhịp nhanh |
| 📌 **Tiêu đề Hook cố định** | Thanh tiêu đề trắng cố định phía trên (kiểu Reels Facebook), phụ đề nền hộp | Reels Facebook, mẹo hay, câu chuyện |
| 🛍️ **Review / Bán hàng** | Nhãn lợi ích ✓ bật lên từng cảnh, nút "Mua ngay" nhấp nháy | TikTok Shop, Shopee, UGC review |
| 🔢 **Top / Danh sách** | Số thứ tự lớn kèm tiêu đề từng ý, chuyển cảnh trượt | "5 mẹo…", "3 sai lầm…" |
| 🎬 **Kể chuyện Điện ảnh** | Viền đen điện ảnh, chuyển động chậm, chữ có chân, màu ấm | Kể chuyện, thương hiệu, du lịch, bất động sản |
| 📰 **Tin nhanh / Kiến thức** | Băng tiêu đề kiểu bản tin, nhãn nhấp nháy, chữ chạy | Tin tức, thị trường, giải thích sự kiện |
| ✍️ **Chữ động** | Chữ hiện dần theo giọng trên nền làm mờ | Trích dẫn, tâm sự, khi không có hình |

Muốn xem trước hoặc chỉnh template bằng giao diện kéo thả, chạy `npm run preview` (mở Remotion Studio).

---

## Hiệu ứng âm thanh và nhạc
- **SFX:** vào ⚙ Cài đặt và bấm **Tạo bộ hiệu ứng âm thanh** (dùng ElevenLabs, chỉ làm 1 lần). Hoặc tự chép `whoosh.mp3`, `pop.mp3`, `ding.mp3` vào `assets/sfx/`.
- **Nhạc nền:** thả file mp3 vào `assets/music/` để dùng cho mọi dự án, hoặc bấm **Tải nhạc của bạn** trong từng dự án. Chỉ dùng nhạc bạn có quyền sử dụng.

---

## Xử lý sự cố
- **Không tải được video Facebook/TikTok:**
  - Bấm **↻ Cập nhật yt-dlp** trong Cài đặt (các nền tảng hay đổi cách hoạt động).
  - Video cần đăng nhập: chọn **Cookie đăng nhập → Lấy từ Chrome/Edge…**. Trên Windows cần **tắt hẳn Chrome** trước khi tải.
  - Cách chắc chắn nhất: tải video về máy rồi chọn **Tải file video lên**.
- **Gemini báo lỗi model:** Google đổi tên model theo thời gian. Vào Cài đặt và sửa *Model Gemini* hoặc *Model Gemini TTS* theo tên mới trên AI Studio.
- **ElevenLabs đọc tiếng Việt sai:** dùng model `Flash v2.5`, `Turbo v2.5` hoặc `v3`. `Multilingual v2` không hỗ trợ tiếng Việt.
- **Đổi cổng chạy:** đặt biến môi trường `PORT=4000` trước khi chạy `npm start`.
- **Kiểm tra phần dựng video không cần API key:** chạy `npm run test:render`, ảnh và video mẫu nằm trong `out/`.

## Lưu ý
- **Bản quyền:** phần mềm chỉ học **công thức và phong cách**. Hình, giọng và nhạc trong video mới là của bạn hoặc từ kho miễn phí. Không đăng lại nội dung gốc của người khác.
- **Chi phí API:** phân tích 1 video và viết kịch bản bằng Gemini rất rẻ (thường nằm trong gói miễn phí). ElevenLabs tính theo số ký tự lời đọc.
- **Giấy phép Remotion** (thư viện dựng video): miễn phí cho cá nhân và công ty ≤ 3 người. Công ty lớn hơn cần mua giấy phép tại https://remotion.pro.

## Cấu trúc thư mục
```
server/      Server Node.js: tải video, gọi Gemini/ElevenLabs/Pexels, ffmpeg, điều phối dựng video
remotion/    Template edit viết bằng React (Remotion) – nơi thêm/chỉnh template
public/      Giao diện web
assets/      sfx/ (hiệu ứng âm thanh), music/ (nhạc nền)
data/        Dự án, cache và cài đặt của bạn (tự tạo, không đưa lên Git)
```
