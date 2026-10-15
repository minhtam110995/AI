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
| Duyệt / từ chối đơn | ✗ | ✓ |
| Thêm, sửa, khoá nhân viên; cấp quyền quản trị | ✗ | ✓ |
| Cài địa điểm chấm công, ca làm việc, cài đặt công ty | ✗ | ✓ |
| Bảng công, báo cáo, xuất Excel cả công ty | ✗ | ✓ |

Khi dùng Firebase, quyền được **máy chủ** kiểm tra (file `firestore.rules`), nên nhân viên không thể "lách" bằng cách sửa app. Ví dụ: nhân viên không đọc được dữ liệu người khác, không tự duyệt đơn, không tự nâng quyền, không sửa giờ chấm công (giờ chấm luôn lấy theo đồng hồ máy chủ).

## Tính năng

**App chấm công (điện thoại)**
- Đăng nhập: mã công ty, tài khoản, mật khẩu, quên mật khẩu, **đăng nhập bằng Face ID / vân tay** trên máy đã bật.
- Trang chủ, chấm công GPS (bản đồ, vùng chấm công, tự chọn địa điểm gần nhất) hoặc Wifi, chấm làm thêm giờ, trực ca kíp.
- **Tạo đơn nghỉ phép**: chọn loại nghỉ (phép năm, nghỉ ốm, việc riêng), từ ngày – đến ngày, nửa ngày sáng/chiều, hiện số ngày phép còn lại, lý do, đính kèm ảnh, chọn người duyệt.
- **Đơn của tôi**: lọc theo trạng thái *Chờ duyệt* (vàng), *Đã duyệt* (xanh), *Từ chối* (đỏ); xem chi tiết, ảnh đính kèm, ý kiến người duyệt; huỷ đơn đang chờ.
- Lịch sử chấm công theo tháng, thông báo, cá nhân, đổi mật khẩu.

**Trang quản trị (máy tính)**
- **Tổng quan**: Có mặt hôm nay, Đi muộn, Vắng mặt, Đơn chờ duyệt; biểu đồ chuyên cần 14 ngày; danh sách chấm công hôm nay và người chưa chấm.
- **Nhân viên**: thêm từng người hoặc **nhập cả danh sách** (dán từ Excel / Google Sheets, hoặc file CSV). Tài khoản tự gợi ý theo họ tên (VD *Nguyễn Văn An* → `an.nguyen`), mật khẩu tạm tạo sẵn. Sau khi tạo có **phiếu đăng nhập**: chép tin nhắn gửi Zalo cho từng người hoặc tải danh sách Excel. Sửa, khoá/mở, gán ca, gán địa điểm, cấp quyền.
- Nhân viên đăng nhập lần đầu bằng mật khẩu tạm **phải đặt mật khẩu riêng** mới dùng được app; trước đó danh sách hiện trạng thái *Chưa kích hoạt*.
- **Địa điểm chấm công**: bấm lên bản đồ hoặc kéo ghim để đặt văn phòng, kéo thanh trượt bán kính 50–500m, tên Wifi và **IP Wifi văn phòng** (nút *Lấy IP mạng đang dùng*); nhiều địa điểm.
- **Ca làm việc**: giờ vào/ra, ngày làm việc trong tuần, số phút cho phép đến muộn.
- **Duyệt đơn**: duyệt / từ chối kèm ý kiến, xem ảnh đính kèm; duyệt giải trình thì tự thêm lượt chấm bù.
- **Phép năm**: mỗi người được 12 ngày/năm chia đều, **mỗi tháng tự cộng 1 ngày** (đổi số ngày/năm ở Cài đặt). Bảng phép từng người: tính từ tháng, phép đầu kỳ, cộng thêm, đã dùng, còn lại; nút **Cập nhật** để đặt số phép còn lại, cộng thêm hoặc trừ bớt; xuất Excel. Tuỳ chọn xoá phép tồn khi sang năm mới (mặc định cộng dồn).
- **Nhắc chấm công ra**: Tổng quan có thẻ *Chưa chấm công ra* sau giờ ra ca, nút nhắc từng người hoặc tất cả. Trên app, quá giờ ra ca chưa chấm ra thì trang chủ hiện lời nhắc (và thông báo trên máy nếu bật ở Cá nhân); quên chấm ra hôm trước thì nhắc gửi giải trình.
- **Bảng công**: bảng tháng (nhân viên × ngày) với ký hiệu ✓ / M / T / V / P / CT; bấm ô để xem chi tiết hoặc thêm lượt chấm thủ công; xuất Excel (CSV).
- **Báo cáo**: công thực tế, phép, đi muộn (lần, phút), về sớm, vắng, thiếu chấm, giờ làm thêm theo từng người; tỉ lệ chuyên cần theo phòng ban; xuất Excel.
- **Cài đặt**: tên công ty, số ngày phép mặc định, bật/tắt chấm Wifi, đổi mật khẩu, link mời nhân viên.

## Chạy thử ngay (chế độ dùng thử)

Khi `config.js` chưa có cấu hình Firebase, app tự chạy **chế độ dùng thử** với dữ liệu mẫu (lưu trong trình duyệt, chỉ máy đó thấy):

- Mã công ty `DEMO`, mật khẩu `123456`
- Tài khoản `admin` (quản trị) hoặc `nv01` … `nv05` (nhân viên)

```bash
cd chamcong-go
npx http-server -p 8080        # mở http://localhost:8080 và http://localhost:8080/admin.html
```

## Dùng thật cho cả công ty (Firebase, miễn phí)

Gói miễn phí (Spark) của Firebase đủ cho công ty khoảng 50 người (10 người dùng chưa tới 1/5 hạn mức đọc mỗi ngày); không cần thẻ thanh toán nên không bao giờ bị trừ tiền. Ảnh đính kèm được nén và lưu trong Firestore, nên **không cần** gói trả phí.

1. Vào <https://console.firebase.google.com> › **Add project** (tạo dự án), tắt Google Analytics cũng được.
2. **Build › Authentication › Get started › Sign-in method** › bật **Email/Password**.
3. **Build › Firestore Database › Create database** › chọn vùng `asia-southeast1` (Singapore) › **Start in production mode**.
4. Trong Firestore › tab **Rules**: xoá hết, dán toàn bộ nội dung file [`firestore.rules`](firestore.rules) › **Publish**.
4b. *(Nên làm, 1 phút)* Firestore › tab **Indexes** › **Create index**, tạo 2 chỉ mục (Collection ID / trường / thứ tự):
   - `logs`: `uid` Ascending, `day` Ascending
   - `notis`: `uid` Ascending, `ts` Ascending

   Chỉ mục giúp app chỉ tải dữ liệu 3 tháng gần nhất, nhanh và tiết kiệm lượt đọc. Chưa tạo thì app vẫn chạy (tải hết rồi lọc).
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
9. Mở app › **Tạo công ty mới**: nhập tên công ty, **mã công ty** (VD `ABC`), tài khoản và mật khẩu quản trị. Người tạo là **chủ công ty** (quyền quản trị, không bị khoá hay hạ quyền).
10. Vào trang quản trị (`admin.html`): thêm địa điểm chấm công, ca làm việc, rồi **Nhân viên › Nhập danh sách** (dán bảng Excel: Họ tên · Mã NV · Phòng ban · Chức danh). Bấm **Chép tin nhắn** gửi Zalo cho từng người, hoặc **Tải danh sách**. Lưu ý: Firebase giới hạn khoảng 100 tài khoản mới mỗi giờ.

### Lưu ý về tài khoản và mật khẩu
- Tài khoản có thể là tên đăng nhập (VD `an.nguyen`) hoặc email thật. Với **email thật**, nhân viên tự đặt lại được mật khẩu qua nút *Quên mật khẩu*.
- Trình duyệt không được phép đổi mật khẩu của người khác (giới hạn của Firebase). Nhân viên dùng tên đăng nhập mà quên mật khẩu thì quản trị vào Firebase Console › Authentication, xoá tài khoản đó, rồi tạo lại trong trang quản trị với cùng tài khoản. Lịch sử chấm công cũ gắn với tài khoản đã xoá vẫn còn trong dữ liệu.
- Nhân viên tự đổi mật khẩu trong app: Cá nhân › Đổi mật khẩu.

### Lưu ý khác
- **Face ID / vân tay** dùng chuẩn WebAuthn của trình duyệt để mở khoá app trên máy đã đăng nhập (phiên đăng nhập vẫn do Firebase giữ). Cần iOS 16+ / Android 9+ và mở app qua HTTPS.
- **Wifi**: trình duyệt không đọc được tên Wifi, nên app so **IP mạng** của điện thoại với IP Wifi văn phòng đã khai báo. Đúng IP mới chấm được, sai mạng (4G, Wifi khác) thì không chấm được. Cài đặt: ngồi ở văn phòng, kết nối Wifi công ty, mở trang quản trị › *Địa điểm chấm công* › bấm **Lấy IP mạng đang dùng** › **Lưu**. Nếu nhà mạng đổi IP (gói Internet không có IP tĩnh), nhân viên sẽ báo không chấm được: làm lại bước trên. Văn phòng có nhiều đường mạng thì thêm đủ các IP, cách nhau bởi dấu phẩy.
- **GPS** có thể bị làm giả bằng app giả lập vị trí trên máy đã root/jailbreak. App lưu toạ độ, độ chính xác và khoảng cách mỗi lượt chấm để quản trị kiểm tra khi nghi ngờ.

## Chống chấm công hộ
Bật trong trang quản trị › **Cài đặt › Chống chấm công hộ** (mặc định tắt). **Trước khi bật, dán lại `firestore.rules` mới vào Firebase › Firestore › Rules › Publish.**
- **Mỗi người một điện thoại**: lần chấm đầu tiên app đăng ký máy đang dùng. Sau đó tài khoản chỉ chấm được trên máy đó, và một máy không đăng ký được cho người thứ hai. Đổi máy: nhân viên bấm *Gửi yêu cầu đổi máy*, quản trị vào Nhân viên › sửa › **Gỡ máy chấm công**.
- **Chụp ảnh khuôn mặt**: mỗi lần chấm mở camera trước để chụp trực tiếp (không chọn được ảnh có sẵn), ảnh khoảng 15 KB lưu riêng. Quản trị xem ở Tổng quan (biểu tượng máy ảnh) hoặc Bảng công › bấm ô ngày.
- Máy chủ (rules) kiểm tra cả hai điều trên, nên sửa app cũng không lách được.
- Lưu ý: mã máy lưu trong trình duyệt. Xoá dữ liệu trình duyệt, hoặc chuyển từ Safari sang app ngoài màn hình chính, sẽ thành "máy mới" và cần quản trị gỡ máy cũ. Nên cài app ra màn hình chính trước khi chấm lần đầu.

## Tốc độ mở app
- Lần đầu mở: tải khoảng 1 MB thư viện (Firebase, phông chữ, biểu tượng). Từ lần thứ hai, mọi thứ lấy từ bộ nhớ máy (service worker), không chờ mạng.
- App lưu bản sao dữ liệu của chính nhân viên trên máy, nên mở lại là **hiện trang chủ ngay**, dữ liệu mới tải ở nền rồi tự cập nhật. Màn chấm công GPS/Wifi luôn chờ dữ liệu mới nhất trước khi chấm. Đăng xuất là xoá bản sao.
- Bản đồ chỉ tải khi mở màn chấm GPS. Bộ biểu tượng chỉ giữ các biểu tượng app dùng (`vendor/`). Khi thêm biểu tượng mới cần tạo lại bộ này.
- Nhớ tạo 2 chỉ mục Firestore ở bước 4b: thiếu chỉ mục thì app phải tải toàn bộ lịch sử chấm công, càng dùng lâu càng chậm.

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
├── vendor/           # bộ biểu tượng Lucide rút gọn
```

## Đưa lên Vercel
Đã có sẵn `vercel.json` (sw.js và trang HTML luôn kiểm tra bản mới; biểu tượng lưu lâu trên máy).
1. <https://vercel.com> › đăng nhập bằng GitHub › **Add New… › Project** › chọn repo › **Import**.
2. **Root Directory**: bấm *Edit* › chọn `chamcong-go`. **Framework Preset**: *Other*. Không cần Build Command. Bấm **Deploy**.
3. Vercel › Project › **Settings › Environments › Production › Branch Tracking**: chọn nhánh chứa app, rồi deploy lại.
4. Firebase Console › Authentication › **Settings › Authorized domains** › thêm tên miền Vercel (VD `ten-du-an.vercel.app`).
