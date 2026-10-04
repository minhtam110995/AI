# Facebook Analyzer – Phân tích fanpage đối thủ & Reels

Tiện ích Chrome (Manifest V3) ghi lại số liệu bài viết và Reels **công khai** mà Facebook đã tải khi bạn lướt fanpage, rồi phân tích trên Dashboard. Tiện ích không cần API key, không tự gửi request, và dữ liệu chỉ lưu trên máy bạn.

## Cài đặt
1. Tải [`facebook-analyzer.zip`](../downloads/facebook-analyzer.zip) rồi giải nén.
2. Vào `chrome://extensions`, bật **Developer mode**, bấm **Load unpacked**, chọn thư mục `facebook-analyzer`.

**Cập nhật bản mới:** chép đè file vào thư mục cũ, rồi bấm ↻ ở tiện ích trong `chrome://extensions`.

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
