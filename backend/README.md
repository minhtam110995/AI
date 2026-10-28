# Máy chủ tài khoản & thu phí cho TikTok Analyzer

Tiện ích vẫn thu thập và phân tích **trên máy người dùng**. Máy chủ chỉ lo: **đăng ký / đăng nhập, gói cước, giới hạn số máy, thanh toán**.

```
Tiện ích (popup, Dashboard, trang Tài khoản)
   │  đăng nhập / đăng ký / quên mật khẩu ───────────► Supabase Auth
   │  "tôi gói gì?" (check_access, 6 giờ/lần) ────────► Supabase Database (hàm SQL)
   │  "mua gói Pro 3 tháng" ──────────────────────────► Edge Function create-payment
   │                                                     → mã VietQR tài khoản ngân hàng (cá nhân) + nội dung TTA<mã đơn>
   ▼
Khách quét QR, chuyển khoản ──► SePay thấy tiền vào ──► gọi Edge Function sepay-webhook ──► cộng thời hạn gói
(tuỳ chọn: PayOS thay cho SePay — PAYMENT_PROVIDER=payos, function payos-webhook)
```

| Thư mục / file | Việc |
|---|---|
| `supabase/migrations/002_bank_transfer.sql` | Thêm cột nội dung chuyển khoản, mã giao dịch ngân hàng |
| `supabase/functions/sepay-webhook` | Nhận báo "tiền vào" từ SePay, tìm mã đơn trong nội dung, cộng hạn |
| `supabase/migrations/001_init.sql` | Bảng `profiles` (gói, hạn), `devices`, `payments`; hàm `check_access`, `apply_payment`; quyền RLS |
| `supabase/functions/create-payment` | Tạo đơn: mã VietQR chuyển khoản (mặc định) hoặc link PayOS |
| `supabase/functions/payos-webhook` | Nhận báo "đã thanh toán" từ PayOS, kiểm tra chữ ký, cộng hạn |
| `supabase/functions/_shared/payos.ts` | **Bảng giá** + hàm ký HMAC |
| `web/thanks.html` | Trang PayOS chuyển về sau khi thanh toán |
| `web/privacy.html` | Mẫu Chính sách quyền riêng tư (bắt buộc khi đưa lên Chrome Web Store) |

## Gói cước mặc định (sửa được)

| | Miễn phí | Pro | Team |
|---|---|---|---|
| Giá | 0đ | 199.000đ/tháng · 537.000đ/3 tháng · 1.910.000đ/12 tháng | 499.000đ/tháng · 1.347.000đ/3 tháng · 4.790.000đ/12 tháng |
| Tìm từ khoá | 3 lượt/ngày, quét nhanh | Không giới hạn | Không giới hạn |
| Báo cáo từ khoá | 20 video đầu | Đầy đủ | Đầy đủ |
| Theo dõi từ khoá hằng ngày | – | 10 | 50 |
| Lời thoại hàng loạt, xuất CSV | – | ✓ | ✓ |
| Số máy | 1 | 2 | 5 |

- Giá: sửa ở **2 chỗ cho khớp nhau**: `supabase/functions/_shared/payos.ts` (máy chủ tính tiền) và `tiktok-analyzer/src/config.js` (hiển thị).
- Quyền từng gói: `PLANS` trong `tiktok-analyzer/src/auth.js`. Số máy: hàm `device_limit` trong file SQL.

## Cài đặt từng bước

### 1. Tạo dự án Supabase (miễn phí)
1. Đăng ký ở https://supabase.com → **New project** (chọn vùng Singapore cho nhanh).
2. **SQL Editor → New query** → dán toàn bộ `supabase/migrations/001_init.sql` → **Run**.
3. **Authentication → Sign In / Providers → Email**: bật Email.
   - Muốn khách phải bấm link xác nhận email: bật *Confirm email* (nên bật khi chạy thật; tiện ích đã xử lý trường hợp này).
   - **Authentication → URL Configuration → Site URL**: đặt trang web của bạn (link trong email xác nhận / đặt lại mật khẩu sẽ về đây).
4. **Project Settings → API**: chép **Project URL** và khoá **anon public**.

### 2. Gắn vào tiện ích
Mở `tiktok-analyzer/src/config.js`, điền:
```js
SUPABASE_URL: 'https://xxxx.supabase.co',
SUPABASE_ANON_KEY: 'eyJ...',   // khoá anon public — được phép để trong tiện ích
```
Khoá **service_role** tuyệt đối **không** để trong tiện ích (chỉ dùng trong Edge Function).
Để trống `SUPABASE_URL` = chế độ nội bộ: không cần đăng nhập, mở toàn bộ tính năng (như trước).

### 3. Nhận tiền vào tài khoản ngân hàng cá nhân (SePay) — mặc định
Cách này giống các tiện ích đang bán ở Việt Nam: hiện mã VietQR tài khoản của bạn, khách chuyển khoản với nội dung là mã đơn (`TTA123456789`), SePay báo tiền vào là gói tự kích hoạt. **Không cần hộ kinh doanh / công ty.**
1. Đăng ký ở https://sepay.vn → **Thêm tài khoản ngân hàng** (tài khoản cá nhân của bạn). Kiểm tra ngân hàng của bạn có trong danh sách SePay hỗ trợ.
2. **Tích hợp Webhooks → Thêm webhook**:
   - Sự kiện: *Có tiền vào*; chọn tài khoản ngân hàng vừa thêm.
   - URL: `https://xxxx.supabase.co/functions/v1/sepay-webhook`
   - Kiểu chứng thực: **API Key** → tự đặt một chuỗi bí mật dài (vd 32 ký tự ngẫu nhiên). Dùng đúng chuỗi này cho `SEPAY_API_KEY` ở bước 5.
   - "Bỏ qua nếu nội dung không có mã thanh toán": để **không** (function tự lọc theo `TTA<mã>`).
3. Mã ngân hàng `BANK_ID` dùng tên viết tắt theo VietQR: `ACB`, `VCB` (Vietcombank), `TCB` (Techcombank), `MB`, `VPB` (VPBank), `TPB` (TPBank), `BIDV`, `ICB` (VietinBank), `VBA` (Agribank)…

### 4. Đưa 2 trang web lên mạng
Đưa `web/privacy.html` (và `web/thanks.html` nếu dùng PayOS) lên một host tĩnh bất kỳ (Cloudflare Pages, Netlify, GitHub Pages hoặc web sẵn có). Điền thông tin của bạn vào `privacy.html` trước.

### 5. Deploy Edge Function
Cài Supabase CLI (https://supabase.com/docs/guides/cli), rồi trong thư mục `backend/`:
```bash
supabase login
supabase link --project-ref <mã dự án, phần xxxx trong xxxx.supabase.co>
supabase secrets set PAYMENT_PROVIDER=bank BANK_ID=ACB BANK_NAME=ACB \
  BANK_ACCOUNT=<số tài khoản> BANK_ACCOUNT_NAME="NGUYEN VAN A" SEPAY_API_KEY=<chuỗi bí mật ở bước 3>
supabase functions deploy create-payment
supabase functions deploy sepay-webhook --no-verify-jwt
```
Nhớ chạy thêm `supabase/migrations/002_bank_transfer.sql` trong SQL Editor (sau file 001).
(`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` Supabase tự cấp cho function, không cần đặt.)

### 6. (Tuỳ chọn) Dùng PayOS thay cho SePay
Khi đã có hộ kinh doanh / công ty và tài khoản PayOS (Client ID, API Key, Checksum Key):
```bash
supabase secrets set PAYMENT_PROVIDER=payos PAYOS_CLIENT_ID=... PAYOS_API_KEY=... PAYOS_CHECKSUM_KEY=... \
  PAYMENT_RETURN_URL=https://topmax.vn/thanks.html PAYMENT_CANCEL_URL=https://topmax.vn/thanks.html
supabase functions deploy payos-webhook --no-verify-jwt
```
rồi khai báo Webhook URL `https://xxxx.supabase.co/functions/v1/payos-webhook` trong kênh thanh toán PayOS.

### 7. Thử toàn bộ
1. Nạp lại tiện ích → mở popup → **Đăng nhập / Đăng ký** → tạo tài khoản.
2. Trang Tài khoản → bấm mua **Pro 1 tháng** → khung mã VietQR hiện ra → quét bằng app ngân hàng (đổi tạm giá về 2.000đ để thử rẻ).
3. Quay lại trang Tài khoản → gói chuyển thành **Pro** (tự cập nhật, hoặc bấm “Kiểm tra lại gói”).
4. Supabase → **Table Editor → payments / profiles** để xem đơn và hạn.

> Mẹo thử không tốn tiền: trong SQL Editor chạy
> `update profiles set plan='pro', plan_expires_at=now()+interval '30 days' where email='ban@email.com';`

## Vận hành
- **Tặng / gia hạn tay cho khách**: sửa `plan`, `plan_expires_at` trong bảng `profiles`.
- **Khách đổi máy**: khách tự xoá máy cũ ở trang Tài khoản; hoặc bạn xoá dòng trong bảng `devices`.
- **Đơn kẹt "chờ thanh toán"** (khách chuyển sai nội dung, chuyển thiếu tiền, hoặc webhook lỗi): xem lịch sử giao dịch trong SePay và **Edge Functions → sepay-webhook → Logs**; kích hoạt tay bằng `select apply_payment(<mã đơn>, <số tiền của đơn>);` trong SQL Editor. Chuyển thiếu tiền thì hệ thống không kích hoạt (không cộng dồn 2 lần chuyển).
- **Hết hạn**: tự về gói Miễn phí, dữ liệu trên máy khách vẫn giữ.

## Lưu ý
- Chuyển khoản / VietQR **không tự trừ tiền hằng tháng**: khách bấm gia hạn khi hết hạn (gói 3 / 12 tháng có giảm giá để khách mua dài).
- Thu tiền bán phần mềm vào tài khoản cá nhân vẫn là thu nhập phải **kê khai thuế** (cá nhân kinh doanh); hỏi kế toán về ngưỡng doanh thu.
- Định dạng webhook SePay (`transferType`, `transferAmount`, `content`, header `Authorization: Apikey …`) và API PayOS lấy theo tài liệu công khai; khi cắm thật hãy thử 1 giao dịch nhỏ và xem Logs.
- Định dạng API / chữ ký PayOS lấy theo tài liệu công khai của PayOS (`/v2/payment-requests`, HMAC-SHA256). Khi cắm khoá thật, thử 1 đơn nhỏ trước; nếu PayOS báo lỗi chữ ký, đối chiếu lại tài liệu mới nhất ở https://payos.vn/docs.
- Khoá tính năng nằm trong tiện ích (Chrome Web Store không cho tải code từ máy chủ), nên người rành kỹ thuật vẫn có thể bẻ khoá; giá trị chính nằm ở cập nhật thường xuyên và hỗ trợ.
- Bán thương mại công cụ đọc dữ liệu TikTok có rủi ro về điều khoản của TikTok; nên đặt tên sản phẩm không chứa chữ "TikTok" khi đưa lên Chrome Web Store.
