# ChấmCông Go – Chấm công GPS cho doanh nghiệp

Gồm 2 phần, dùng chung một dữ liệu:

| Phần | File | Dành cho |
|---|---|---|
| **App chấm công** (điện thoại, cài như app) | `index.html` | Nhân viên và quản trị |
| **Trang quản trị** (máy tính, 1440px) | `admin.html` | Bộ phận nhân sự (quyền Quản trị) |

## Phân quyền

| | Nhân viên | Quản trị |
|---|:-:|:-:|
| Chấm công GPS / Wifi, làm thêm giờ, trực ca | ✓ | ✓ |
| Xem bảng công, đơn, thông báo **của mình** | ✓ | ✓ |
| Gửi đơn (nghỉ phép, đi muộn, làm thêm, công tác, giải trình, đổi ca) | ✓ | ✓ |
| Xem dữ liệu của người khác | ✗ | ✓ |
| Duyệt / từ chối đơn, duyệt lượt chấm Wifi | ✗ | ✓ |
| Thêm, sửa, khoá nhân viên; cấp quyền quản trị | ✗ | ✓ |
| Cài địa điểm chấm công, ca làm việc, cài đặt công ty | ✗ | ✓ |
| Bảng công, báo cáo, xuất Excel cả công ty | ✗ | ✓ |

Khi dùng Firebase, quyền được **máy chủ** kiểm tra (file `firestore.rules`), nên nhân viên không thể "lách" bằng cách sửa app. Ví dụ: nhân viên không đọc được dữ liệu người khác, không tự duyệt đơn, không tự nâng quyền, không sửa giờ chấm công (giờ chấm luôn lấy theo đồng hồ máy chủ).

## Tính năng

**App chấm công (điện thoại)**
- **Đăng nhập bằng Google**: nhân viên bấm một nút, chọn Gmail mà công ty đã thêm là vào; không cần mật khẩu, không cần mã công ty. Email lạ bị chặn.
- Vẫn có đăng nhập bằng mã công ty + tài khoản + mật khẩu (thu gọn bên dưới), quên mật khẩu, **Face ID / vân tay** trên máy đã bật.
- Trang chủ, chấm công GPS (bản đồ, vùng chấm công, tự chọn địa điểm gần nhất) hoặc Wifi, chấm làm thêm giờ, trực ca kíp.
- **Tạo đơn nghỉ phép**: chọn loại nghỉ (phép năm, nghỉ ốm, việc riêng), từ ngày – đến ngày, nửa ngày sáng/chiều, hiện số ngày phép còn lại, lý do, đính kèm ảnh, chọn người duyệt.
- **Đơn của tôi**: lọc theo trạng thái *Chờ duyệt* (vàng), *Đã duyệt* (xanh), *Từ chối* (đỏ); xem chi tiết, ảnh đính kèm, ý kiến người duyệt; huỷ đơn đang chờ.
- Lịch sử chấm công theo tháng, thông báo, cá nhân, đổi mật khẩu.

**Trang quản trị (máy tính)**
- **Tổng quan**: Có mặt hôm nay, Đi muộn, Vắng mặt, Đơn chờ duyệt; biểu đồ chuyên cần 14 ngày; danh sách chấm công hôm nay và người chưa chấm.
- **Nhân viên**: thêm bằng **Gmail** (nhân viên đăng nhập bằng Google) hoặc bằng tài khoản + mật khẩu; người đã thêm Gmail nhưng chưa đăng nhập hiện trạng thái *Chờ đăng nhập*; sửa, khoá/mở, gán ca, gán địa điểm, cấp quyền.
- **Địa điểm chấm công**: bấm lên bản đồ hoặc kéo ghim để đặt văn phòng, kéo thanh trượt bán kính 50–500m, tên Wifi; nhiều địa điểm.
- **Ca làm việc**: giờ vào/ra, ngày làm việc trong tuần, số phút cho phép đến muộn.
- **Duyệt đơn**: duyệt / từ chối kèm ý kiến, xem ảnh đính kèm; duyệt giải trình thì tự thêm lượt chấm bù; duyệt lượt chấm Wifi chưa xác minh.
- **Bảng công**: bảng tháng (nhân viên × ngày) với ký hiệu ✓ / M / T / V / P / CT; bấm ô để xem chi tiết hoặc thêm lượt chấm thủ công; xuất Excel (CSV).
- **Báo cáo**: công thực tế, phép, đi muộn (lần, phút), về sớm, vắng, thiếu chấm, giờ làm thêm theo từng người; tỉ lệ chuyên cần theo phòng ban; xuất Excel.
- **Cài đặt**: tên công ty, số ngày phép mặc định, bật/tắt chấm Wifi, đổi mật khẩu, link mời nhân viên.

## Chạy thử ngay (chế độ dùng thử)

Khi `config.js` chưa có cấu hình Firebase, app tự chạy **chế độ dùng thử** với dữ liệu mẫu (lưu trong trình duyệt, chỉ máy đó thấy):

- Mã công ty `DEMO`, mật khẩu `123456`
- Tài khoản `admin` (quản trị) hoặc `nv01` … `nv05` (nhân viên)
- Hoặc bấm **Đăng nhập bằng Google** và chọn một tài khoản mẫu (bản dùng thử mô phỏng bước chọn Gmail)

```bash
cd chamcong-go
npx http-server -p 8080        # mở http://localhost:8080 và http://localhost:8080/admin.html
```

## Dùng thật cho cả công ty (Firebase, miễn phí)

Gói miễn phí (Spark) của Firebase đủ cho công ty khoảng vài chục người. Ảnh đính kèm được nén và lưu trong Firestore, nên **không cần** gói trả phí.

1. Vào <https://console.firebase.google.com> › **Add project** (tạo dự án), tắt Google Analytics cũng được.
2. **Build › Authentication › Get started › Sign-in method**:
   - bật **Google** (chọn email hỗ trợ là Gmail của bạn) › **Save**;
   - bật thêm **Email/Password** nếu muốn dùng cả tài khoản + mật khẩu.
3. **Build › Firestore Database › Create database** › chọn vùng `asia-southeast1` (Singapore) › **Start in production mode**.
4. Trong Firestore › tab **Rules**: xoá hết, dán toàn bộ nội dung file [`firestore.rules`](firestore.rules) › **Publish**.
5. **Project settings** (bánh răng) › **Your apps** › biểu tượng **Web `</>`** › đặt tên › **Register app**. Chép đoạn `firebaseConfig` hiện ra.
6. Mở `config.js`, thay `firebase: null` bằng cấu hình vừa chép, ví dụ:
   ```js
   window.CCG_CONFIG = {
     firebase: {
       apiKey: "AIza...",
       authDomain: "ten-du-an.firebaseapp.com",
       projectId: "ten-du-an",
       appId: "1:123:web:abc"
     }
   };
   ```
7. Đưa thư mục `chamcong-go` lên hosting có HTTPS (GPS bắt buộc HTTPS):
   - **GitHub Pages**: Settings › Pages › chọn nhánh. Link: `https://<tên>.github.io/<repo>/chamcong-go/`
   - hoặc **Firebase Hosting**: `npx firebase-tools deploy --project ten-du-an` trong thư mục `chamcong-go` (đã có sẵn `firebase.json`).
8. Firebase › Authentication › **Settings › Authorized domains** › thêm tên miền hosting (VD `ten.github.io`).
9. Mở app › **Tạo công ty mới**: nhập tên công ty, **mã công ty** (VD `ABC`), họ tên › **Tạo công ty bằng tài khoản Google**. Người tạo là **chủ công ty** (quyền quản trị, không bị khoá hay hạ quyền).
10. Vào trang quản trị (`admin.html`): thêm địa điểm chấm công, ca làm việc, rồi **Nhân viên › Thêm nhân viên › Gmail**. Gửi cho nhân viên link app; họ bấm **Đăng nhập bằng Google** là vào đúng công ty.

### Đăng nhập bằng Google hoạt động thế nào
- Quản trị thêm Gmail của nhân viên ⇒ hệ thống tạo **lời mời**. Lần đầu nhân viên đăng nhập bằng Gmail đó, lời mời biến thành tài khoản với đúng quyền, ca, địa điểm, số ngày phép quản trị đã đặt. Máy chủ (`firestore.rules`) kiểm tra để nhân viên không tự sửa quyền hay số ngày phép lúc nhận lời mời.
- Mỗi Gmail chỉ thuộc **một công ty**. Email chưa được thêm sẽ bị từ chối ngay.
- Nghỉ việc: **khoá** tài khoản trong mục Nhân viên; chưa đăng nhập lần nào thì bấm **Huỷ lời mời**.
- Cửa sổ đăng nhập Google mở dạng popup. Nếu trình duyệt chặn popup, app tự chuyển sang trang Google rồi quay lại. Trên iPhone, chuyển trang có thể không quay lại được khi app chạy trên GitHub Pages; khi đó nên đưa app lên **Firebase Hosting** (cùng tên miền với Firebase nên đăng nhập Google ổn định nhất).

### Lưu ý về tài khoản và mật khẩu (nếu dùng cách đăng nhập này)
- Tài khoản có thể là tên đăng nhập (VD `an.nguyen`) hoặc email thật. Với **email thật**, nhân viên tự đặt lại được mật khẩu qua nút *Quên mật khẩu*.
- Trình duyệt không được phép đổi mật khẩu của người khác (giới hạn của Firebase). Nhân viên dùng tên đăng nhập mà quên mật khẩu thì quản trị vào Firebase Console › Authentication, xoá tài khoản đó, rồi tạo lại trong trang quản trị với cùng tài khoản. Lịch sử chấm công cũ gắn với tài khoản đã xoá vẫn còn trong dữ liệu.
- Nhân viên tự đổi mật khẩu trong app: Cá nhân › Đổi mật khẩu.

### Lưu ý khác
- **Face ID / vân tay** dùng chuẩn WebAuthn của trình duyệt để mở khoá app trên máy đã đăng nhập (phiên đăng nhập vẫn do Firebase giữ). Cần iOS 16+ / Android 9+ và mở app qua HTTPS.
- **Wifi**: trình duyệt không đọc được tên Wifi. Trên Android app biết máy đang dùng Wifi hay 4G; trên iPhone lượt chấm Wifi vào mục *Chấm công chờ duyệt* để quản trị duyệt.
- **GPS** có thể bị làm giả bằng app giả lập vị trí trên máy đã root/jailbreak. App lưu toạ độ, độ chính xác và khoảng cách mỗi lượt chấm để quản trị kiểm tra khi nghi ngờ.

## Cấu trúc
```
chamcong-go/
├── index.html / styles.css / app.js     # app chấm công (điện thoại)
├── admin.html / admin.css / admin.js    # trang quản trị (máy tính)
├── core.js           # tính công, đi muộn, nghỉ phép... (dùng chung)
├── data.js           # lớp dữ liệu: chế độ dùng thử hoặc Firebase
├── config.js         # dán cấu hình Firebase vào đây
├── firestore.rules   # luật phân quyền trên máy chủ
├── firebase.json     # cấu hình triển khai Firebase (tuỳ chọn)
├── sw.js, manifest.webmanifest, icons/   # cài như app, mở được khi mạng yếu
```
