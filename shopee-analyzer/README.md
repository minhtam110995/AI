# Shopee Analyzer – Tiện ích Chrome nghiên cứu thị trường Shopee

Tiện ích Chrome (Manifest V3) tự ghi lại số liệu sản phẩm, shop và đánh giá khi bạn duyệt **shopee.vn**, rồi phân tích trên Dashboard. Dữ liệu chỉ lưu trên máy bạn.

## Cài đặt
1. Tải repo (GitHub → **Code → Download ZIP**) rồi giải nén.
2. Mở Chrome, vào `chrome://extensions`, bật **Developer mode**.
3. Bấm **Load unpacked**, chọn thư mục `shopee-analyzer`.
4. Ghim biểu tượng 🛍 lên thanh công cụ.

**Cập nhật bản mới:** chép đè file mới vào đúng thư mục cũ, rồi bấm ↻ ở tiện ích trong `chrome://extensions`. Dữ liệu được giữ nguyên.

## Cách dùng nhanh
1. Tìm một từ khoá trên shopee.vn, ví dụ "kem chống nắng".
2. Mỗi sản phẩm hiện nhãn: 💰 doanh thu/tháng · 🛒 đã bán/tháng · ⭐ sao (số đánh giá) · 📅 tuổi sản phẩm. Viền cam là **sản phẩm mới (≤ 90 ngày) đang bán chạy**.
3. Trong khung **Shopee Analyzer** ở góc phải (hoặc trong popup), bấm **⬇ Quét 3/10 trang**. Tiện ích tự cuộn và lật trang như người dùng thật.
4. Bấm **📊 Mở Dashboard** để phân tích.

## Tính năng
| Nhóm | Tính năng |
|---|---|
| **Thị trường** | Quy mô doanh thu theo từ khoá, **điểm cơ hội 0–100**, phân khúc giá bán chạy, top shop và thị phần, doanh thu theo nơi bán, sản phẩm mới bán chạy, sản phẩm bán chạy nhưng bị chê, **cụm từ khoá tiêu đề** của sản phẩm bán chạy |
| **Sản phẩm** | Bảng lọc và sắp xếp (giá, bán/tháng, doanh thu, sao, tuổi…), **so sánh 2–5 sản phẩm**, chi tiết sản phẩm (phân loại, phân bố sao, thứ hạng từ khoá, lịch sử giá, lịch sử đã bán) |
| **Shop** | Người theo dõi, sao shop, tỉ lệ phản hồi, doanh thu ước tính, sản phẩm bán chạy nhất |
| **Theo dõi** | ☆ theo dõi sản phẩm, **tốc độ bán thực tế** (đơn/ngày, tính từ chênh lệch giữa các lần ghi nhận), thay đổi giá, tự cập nhật mỗi ngày, **thông báo khi đổi giá hoặc hết hàng** |
| **Đánh giá** | Lấy tới 500 đánh giá/sản phẩm, **nỗi đau khách hàng** (1–3 sao), **điều khách thích** (5 sao), số đánh giá theo tháng, phân loại mua nhiều, nút copy kèm câu lệnh để dán vào AI phân tích |
| **Tính lãi** | Phí cố định, phí thanh toán, Freeship/Voucher Xtra, thuế, quảng cáo, đóng gói, cho ra lãi/đơn, biên lãi, ROI, **giá hoà vốn**, giá để lãi 20% và 30% |
| **Khác** | 📥 tải toàn bộ ảnh sản phẩm, xuất CSV, **gửi Google Sheets**, sao lưu/khôi phục JSON |

## Kết nối Google Sheets
Vào Dashboard, tab **⚙️ Cài đặt**, rồi làm theo 4 bước hướng dẫn: dán đoạn Apps Script có sẵn vào Sheet, triển khai dạng Web App, rồi dán link vào tiện ích. Sau đó bấm **Gửi Google Sheets** ở tab Sản phẩm hoặc Shop.

## Lưu ý
- **Doanh thu là ước tính:** giá × số "đã bán" do Shopee hiển thị (đã được làm tròn). Muốn số liệu sát thực tế hơn, hãy **theo dõi** sản phẩm vài ngày để có tốc độ bán thực tế.
- Tiện ích chỉ đọc dữ liệu mà trang Shopee đã tải, và cuộn hoặc lật trang với tốc độ như người dùng thật. Đừng quét quá nhiều trang liên tục, vì Shopee có thể yêu cầu xác minh.
- **Lấy đánh giá:** tiện ích gọi trực tiếp API đánh giá. Nếu Shopee chặn, nó tự chuyển sang bấm "trang sau" trong mục đánh giá. Khi đó hãy cuộn tới mục "ĐÁNH GIÁ SẢN PHẨM" trước rồi bấm lại.
- Mức phí trong tab Tính lãi chỉ là mặc định để tham khảo. Hãy chỉnh theo biểu phí hiện hành trong Kênh Người Bán.
- Nếu Shopee đổi cấu trúc dữ liệu, có thể cần cập nhật hàm `extract` trong `src/common.js`.

## Cấu trúc mã
- `src/inject.js`: đọc phản hồi API `/api/v2|v4/` mà trang Shopee đã tải.
- `src/content.js`: lưu dữ liệu, gắn nhãn lên thẻ sản phẩm, khung nổi, quét nhiều trang, lấy đánh giá.
- `src/background.js`: tải ảnh, cập nhật danh sách theo dõi, thông báo, gửi Google Sheets.
- `dashboard.*`, `tabs-*.js`, `charts.js`: Dashboard và biểu đồ SVG thuần, không dùng thư viện ngoài.
