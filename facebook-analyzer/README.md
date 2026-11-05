# Facebook Analyzer 2.0 – Phân tích fanpage đối thủ & Reels

Tiện ích Chrome (Manifest V3) ghi lại số liệu bài viết và Reels **công khai** mà Facebook đã tải khi bạn lướt fanpage, rồi phân tích trên Dashboard. Tiện ích không cần API key và dữ liệu chỉ lưu trên máy bạn. Phân tích fanpage / tìm từ khoá mở Facebook trong cửa sổ nhỏ bằng chính tài khoản đang đăng nhập; lời thoại Reels tải tệp phụ đề Facebook đã tạo sẵn.

## Cài đặt
1. Tải [`facebook-analyzer.zip`](../downloads/facebook-analyzer.zip) rồi giải nén.
2. Vào `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked**, chọn thư mục `facebook-analyzer`.

**Cập nhật bản mới:** chép đè file vào thư mục cũ, rồi bấm ↻ ở tiện ích trong `chrome://extensions`.

## Mới ở bản 2.0 (miễn phí, không cần đăng nhập)
- **🧭 Phân tích fanpage bằng link:** Dashboard → tab **📊 Fanpage** → dán link fanpage → **Phân tích**. Tiện ích tự mở trang trong một cửa sổ nhỏ, cuộn tab Reels rồi bài viết, xong tự đóng và hiện báo cáo. Cần đang đăng nhập facebook.com.
  - **Fanpage đã có dữ liệu:** bấm tên để xem, **✕** để xoá một trang, **🗑 Xoá hết** để xoá tất cả (nên **Sao lưu JSON** trước).
  - **🔥 Nội dung hot nhất:** 10 bài / Reels bứt phá nhất, nút **📋** copy link + nội dung + lời thoại; **📋 Copy tất cả**.
- **🔎 Từ khoá:** gõ từ khoá (vd: *bất động sản*) → **Tìm & thu thập**. Tiện ích mở trang tìm kiếm video của Facebook, tự cuộn lấy kết quả. Lọc theo thời gian đăng, view tối thiểu; xếp theo **🧠 điểm xu hướng**, lượt xem, view/ngày, mới nhất. Mỗi thẻ video có **📋 Copy nội dung gốc**. Ngày đăng đọc từ chữ "3 ngày", "2 tuần" trên kết quả tìm kiếm nên là ngày gần đúng.
- **📝 Lời thoại Reels:** bấm 📋 ở một Reels lần 1 → tiện ích lấy phụ đề tự động của Facebook (mở Reels vài giây trong cửa sổ nhỏ nếu cần); bấm lần 2 để copy. Facebook chỉ tạo phụ đề cho một phần Reels — Reels không có phụ đề thì chỉ copy được caption.
- **✨ ChatGPT / Claude:** chọn mục tiêu (Vì sao viral, Viết lại cho trang tôi, 10 câu hook, Kịch bản bán hàng), gõ chủ đề / sản phẩm, bấm **Mở ChatGPT** hoặc **Mở Claude** — prompt gồm 5 nội dung hot nhất kèm số liệu, nội dung, lời thoại. Điền **👤 Hồ sơ fanpage của tôi** một lần để tự gắn vào mọi prompt.
- **Cột phân tích bên phải:** đang xem một fanpage, bấm nút **📊 Phân tích trang** ở góc phải dưới → số liệu nhanh, nội dung hot (copy nội dung + lời thoại), ✨ ChatGPT / Claude, **⬇ Cuộn lấy bài** — không cần mở Dashboard.

## Cách dùng
1. Mở fanpage đối thủ trên facebook.com.
2. Bấm biểu tượng tiện ích:
   - **⬇ Quét bài viết:** tự cuộn để Facebook tải thêm bài.
   - **🎬 Quét Reels:** mở tab Reels của trang và tự cuộn.
   - **⭐ Theo dõi fanpage này:** thêm vào danh sách đối thủ.
3. Mỗi bài và mỗi ô Reels có nhãn: `🔥 3.1× · ▶ lượt xem · 👍 cảm xúc · 💬 bình luận · ↗ chia sẻ`. Viền đỏ là **bài bứt phá** (≥ 3×).
4. Bấm **📊 Mở Dashboard**.

## Chỉ số bứt phá
**Bứt phá = chỉ số của bài ÷ trung vị của chính fanpage đó**
- Reels/video có lượt xem: so theo **lượt xem**.
- Bài ảnh, chữ, link: so theo **tương tác** (cảm xúc + bình luận + chia sẻ).
- Nhãn hiện 🔥 từ **2×**, viền đỏ từ **3×**. Thẻ "Bài bứt phá" trên Dashboard tính từ **3×**.

## Dashboard
| Tab | Nội dung |
|---|---|
| **📊 Fanpage** | Người theo dõi và mức tăng trong 7 ngày, tương tác trung vị/bài, tương tác/người theo dõi, tần suất đăng, số bài bứt phá; tương tác từng bài theo thời gian; **giờ và ngày đăng hiệu quả**; **định dạng ăn tương tác** (Reels, video, ảnh, album, link, chữ); kiểu câu mở đầu; độ dài nội dung và hashtag; so sánh các fanpage; bảng bài viết sắp xếp được |
| **🎬 Reels** | Lượt xem trung vị, ER, độ dài; **công thức viral** (top 20% so với phần còn lại); lượt xem theo thời gian; giờ đăng và **lịch đăng gợi ý**; **độ dài Reels tối ưu**; kiểu caption; **Reels "vượt tầm"** (lượt xem so với người theo dõi); top Reels kèm nút copy caption |
| **📡 Theo dõi đối thủ** | Danh sách fanpage theo dõi, tự cập nhật mỗi ngày, **thông báo bài/Reels bứt phá** (đăng ≤ 3 ngày, ≥ 3×), bài bứt phá gần đây, **bài đang tăng nhanh** |

Xuất CSV và sao lưu/khôi phục JSON nằm ở góc trên Dashboard.

## Lưu ý
- Tiện ích lấy dữ liệu theo 2 cách:
  1. Đọc **dữ liệu trang Facebook đã tải**: đầy đủ nhất, có giờ đăng.
  2. **Đọc trên giao diện** (số "Tất cả cảm xúc", "bình luận", "lượt chia sẻ", lượt xem trên ô Reels): dự phòng khi Facebook đổi cấu trúc. Bài chỉ đọc được theo cách này sẽ không có giờ đăng.
- Facebook thay đổi giao diện thường xuyên. Nếu nhãn không hiện hoặc số liệu trống, cần cập nhật `src/common.js` (phần `extract`) và `src/content.js` (phần `scan`).
- Facebook không công khai reach, impression hay chi tiêu quảng cáo của page khác, nên tiện ích không có các số liệu này.
- Tiện ích **không** thu thập UID, số điện thoại hay thông tin cá nhân người dùng, và **không** tự đăng bài hay bình luận.
