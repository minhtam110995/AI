# TikTok Analyzer – Tiện ích Chrome phân tích TikTok

Tiện ích Chrome (Manifest V3) tự ghi lại số liệu video và kênh khi bạn duyệt **tiktok.com**, rồi phân tích trên một Dashboard riêng. Không cần tài khoản hay API key, và dữ liệu chỉ lưu trên máy bạn (`chrome.storage.local`).

## Cài đặt (2 phút)
1. Tải thư mục `tiktok-analyzer` về máy (GitHub → **Code → Download ZIP**, rồi giải nén).
2. Mở Chrome, vào `chrome://extensions`.
3. Bật **Developer mode** (góc trên bên phải).
4. Bấm **Load unpacked**, rồi chọn thư mục `tiktok-analyzer`.
5. Ghim biểu tượng 📊 lên thanh công cụ.

## Cách dùng
1. Mở một trang kênh, ví dụ `https://www.tiktok.com/@tenkenh`. Nếu tab đã mở sẵn trước khi cài tiện ích thì bấm F5.
2. Bấm biểu tượng tiện ích, chọn **⬇ Tự cuộn để thu thập**. Trang sẽ tự cuộn để TikTok tải thêm video, và tiện ích ghi lại số liệu trong lúc cuộn.
3. Bấm **Mở Dashboard phân tích**, hoặc bấm nút nổi `📊 +N video mới` ở góc dưới trang.
4. Muốn phân tích đối thủ thì làm tương tự với kênh của họ. Bảng **So sánh kênh** sẽ tự hiện khi có từ 2 kênh trở lên.

Tiện ích cũng ghi dữ liệu khi bạn xem trang hashtag, trang tìm kiếm, trang một video hoặc lướt For You.

## Dashboard có gì
- **KPI:** tổng view, view trung vị, tỉ lệ tương tác (ER), like, bình luận, share, lưu, tần suất đăng, số video bứt phá (≥ 3× trung vị), tỉ lệ view/follower.
- **Gợi ý tự động:** khung giờ và ngày đăng tốt nhất, độ dài video tối ưu, hashtag và âm thanh kéo view, video nổi bật nhất.
- **Biểu đồ:** lượt xem từng video theo thời gian, bản đồ nhiệt giờ đăng, view theo độ dài video, top hashtag, tăng trưởng follower. Rê chuột lên biểu đồ để xem chi tiết, bấm vào cột để mở video.
- **Bảng video:** sắp xếp theo từng cột, có ảnh bìa và đánh dấu 🔥 bứt phá.
- **Bộ lọc:** theo kênh, khoảng thời gian, từ khoá hoặc hashtag.
- **Xuất CSV** (mở được bằng Excel hoặc Google Sheets) và **sao lưu/nhập JSON** để chuyển dữ liệu sang máy khác.

## 📝 Lấy nội dung gốc video (lời thoại, caption)
- **Đang xem một video** trên TikTok: bấm biểu tượng tiện ích, chọn **📝 Lấy nội dung gốc video**.
- **Trong Dashboard:** bấm 📝 ở cột *Nội dung* của từng video. Video đã lấy lời thoại sẽ có dấu ✓.
- **Lấy hàng loạt:** dán tối đa 50 link (mỗi dòng 1 link) vào trang *Lấy nội dung gốc video*, rồi bấm **Xuất CSV kết quả**.

Kết quả gồm caption, hashtag, âm thanh và **lời thoại** lấy từ phụ đề tự động hoặc phụ đề của tác giả do TikTok tạo. Bạn có thể bật mốc thời gian, chọn ngôn ngữ (bản gốc hoặc bản dịch máy), copy hoặc tải file .txt. Lời thoại cũng được lưu lại và có trong cột `transcript` khi xuất CSV.

Video không có lời nói (chỉ có nhạc), hoặc video TikTok chưa tạo phụ đề, sẽ không có lời thoại.

## Cách hoạt động
- `src/inject.js` chạy trong trang TikTok và **đọc** các phản hồi API mà chính trang đã tải (danh sách video, thông tin kênh, tìm kiếm). Nó không gửi thêm request nào.
- `src/content.js` đọc thêm dữ liệu nhúng sẵn trong trang, chuẩn hoá rồi lưu vào `chrome.storage.local`. Thông tin follower được lưu tối đa 1 mốc mỗi giờ để vẽ đường tăng trưởng.
- `src/transcript.js` (chạy trong `src/background.js`) tải trang video, đọc danh sách phụ đề rồi tải bản phụ đề gốc.
- `dashboard.html/js` và `popup.html/js` đọc dữ liệu đã lưu và vẽ biểu đồ bằng SVG thuần, không dùng thư viện ngoài.

## Lưu ý
- Số liệu là con số tại thời điểm bạn xem. Mở lại kênh sau vài ngày để cập nhật.
- Giờ đăng hiển thị theo múi giờ máy của bạn.
- Nếu TikTok đổi cấu trúc trang thì có thể cần cập nhật `src/common.js` (hàm `extract`).
- Chỉ dùng để phân tích dữ liệu công khai mà bạn xem được. Hãy tuân thủ điều khoản của TikTok.
