# ChấmCông Go – App chấm công GPS

Web app (PWA) chấm công trên điện thoại, dựng theo bản thiết kế *ChấmCông Go App* (iPhone 15, 393×852). Mở trên trình duyệt điện thoại rồi **Thêm vào Màn hình chính** là dùng như app.

## Tính năng
| Màn hình | Chức năng |
|---|---|
| Trang chủ | Lời chào, ca làm việc hôm nay, nút **Chấm công** (tự biết là vào ca hay ra ca), khoảng cách tới văn phòng, chấm làm thêm giờ / trực ca kíp, chi tiết chấm công hôm nay |
| Popup chấm công | Chọn xác thực bằng **Wifi** hoặc **GPS** |
| Chấm công GPS | Bản đồ có vùng chấm công, vị trí văn phòng và vị trí của bạn. Hiện khoảng cách, độ chính xác GPS, bán kính. Trong vùng thì xác nhận chấm công; ngoài vùng hoặc lỗi định vị thì **Gửi giải trình** / **Định vị lại**. Tín hiệu yếu (sai số > 150m) thì không cho chấm |
| Chấm công Wifi | Kiểm tra kết nối mạng. Nếu trình duyệt không đọc được Wifi (iPhone), lượt chấm ở trạng thái **Chờ phê duyệt** |
| Chấm công thành công | Giờ chấm, loại chấm, địa điểm, phương thức, cảnh báo đi muộn |
| Đề xuất | Nghỉ phép, Đi muộn về sớm, Làm thêm giờ, Công tác, Giải trình chấm công, Đổi ca, kèm danh sách đề xuất của tôi (có thể huỷ khi đang chờ duyệt) |
| Thông báo | Danh sách thông báo, đánh dấu đã đọc / đọc tất cả |
| Lịch sử chấm công | Bảng công theo tháng (12 tháng gần nhất), chấm xanh/đỏ/cam từng ngày, số công, giờ vào/ra từng ngày, gửi giải trình cho ngày lỗi. Tab Giải trình |
| Cá nhân | Ngày phép còn lại, số công, số lần đi muộn. Sửa thông tin cá nhân, ca làm việc, **văn phòng chấm công** (toạ độ, bán kính, tên Wifi), xuất bảng công CSV, đăng xuất |

## Chạy thử
GPS chỉ hoạt động qua **HTTPS** (hoặc `localhost`).

```bash
cd chamcong-go
npx http-server -p 8080      # hoặc: python3 -m http.server 8080
# mở http://localhost:8080
```

Đưa lên mạng: tải cả thư mục `chamcong-go` lên bất kỳ hosting tĩnh nào có HTTPS (GitHub Pages, Netlify, Vercel, Cloudflare Pages…).

Lần đầu mở app, nhập tên để bắt đầu, hoặc bấm **Dùng thử với dữ liệu mẫu**. Sau đó vào **Cá nhân › Văn phòng chấm công** để đặt đúng toạ độ văn phòng: đứng tại văn phòng và bấm *Dùng vị trí hiện tại của tôi*.

## Lưu ý
- **Dữ liệu chỉ lưu trên máy** (localStorage); app chưa có máy chủ. Vì vậy đề xuất luôn ở trạng thái *Chờ duyệt* và không có người duyệt. Muốn quản lý duyệt đơn và xem bảng công cả công ty thì cần thêm backend (API + cơ sở dữ liệu + trang quản trị).
- Trình duyệt web không cho đọc tên Wifi (SSID). App chỉ biết thiết bị đang dùng Wifi hay 4G (trên Android Chrome); trên iPhone, lượt chấm Wifi luôn chờ duyệt.
- Bản đồ dùng ô bản đồ Esri World Street Map (giống thiết kế), thư viện Leaflet 1.9.4, icon Lucide 0.460, font Be Vietnam Pro.

## Cấu trúc
```
chamcong-go/
├── index.html            # khung trang, nạp font/icon/Leaflet
├── styles.css            # giao diện theo thiết kế
├── app.js                # toàn bộ màn hình, định tuyến (#/...), dữ liệu
├── sw.js                 # service worker (mở được khi mạng yếu)
├── manifest.webmanifest  # cài như app
└── icons/
```
