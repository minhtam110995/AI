# Máy chủ tài khoản & thu phí cho TikTok Analyzer

Tiện ích vẫn thu thập và phân tích **trên máy người dùng**. Máy chủ chỉ lo: **đăng ký / đăng nhập, gói cước, giới hạn số máy, thanh toán**.

```
Tiện ích (popup, Dashboard, trang Tài khoản)
   │  đăng nhập / đăng ký / quên mật khẩu ───────────► Supabase Auth
   │  "tôi gói gì?" (check_access, 6 giờ/lần) ────────► Supabase Database (hàm SQL)
   │  "mua gói Pro 3 tháng" ──────────────────────────► Edge Function create-payment ──► PayOS (link VietQR)
   ▼
Khách thanh toán trên trang PayOS ──► PayOS gọi Edge Function payos-webhook ──► cộng thời hạn gói
```

| Thư mục / file | Việc |
|---|---|
| `supabase/migrations/001_init.sql` | Bảng `profiles` (gói, hạn), `devices`, `payments`; hàm `check_access`, `apply_payment`; quyền RLS |
| `supabase/functions/create-payment` | Tạo đơn + link thanh toán PayOS cho người đang đăng nhập |
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

### 3. Tạo tài khoản PayOS
1. Đăng ký ở https://payos.vn, xác minh doanh nghiệp / hộ kinh doanh, liên kết tài khoản ngân hàng nhận tiền.
2. Tạo **kênh thanh toán** → lấy **Client ID, API Key, Checksum Key**.

### 4. Đưa 2 trang web lên mạng
Đưa `web/thanks.html` và `web/privacy.html` lên một host tĩnh bất kỳ (Cloudflare Pages, Netlify, GitHub Pages hoặc web sẵn có), vd:
`https://topmax.vn/thanks.html`, `https://topmax.vn/privacy.html`. Điền thông tin của bạn vào `privacy.html` trước.

### 5. Deploy 2 Edge Function
Cài Supabase CLI (https://supabase.com/docs/guides/cli), rồi trong thư mục `backend/`:
```bash
supabase login
supabase link --project-ref <mã dự án, phần xxxx trong xxxx.supabase.co>
supabase secrets set PAYOS_CLIENT_ID=... PAYOS_API_KEY=... PAYOS_CHECKSUM_KEY=... \
  PAYMENT_RETURN_URL=https://topmax.vn/thanks.html PAYMENT_CANCEL_URL=https://topmax.vn/thanks.html
supabase functions deploy create-payment
supabase functions deploy payos-webhook --no-verify-jwt
```
(`SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` Supabase tự cấp cho function, không cần đặt.)

### 6. Khai báo Webhook trong PayOS
Kênh thanh toán → **Webhook URL**: `https://xxxx.supabase.co/functions/v1/payos-webhook` → Lưu (PayOS gọi thử, function trả OK).

### 7. Thử toàn bộ
1. Nạp lại tiện ích → mở popup → **Đăng nhập / Đăng ký** → tạo tài khoản.
2. Trang Tài khoản → bấm mua **Pro 1 tháng** → trang PayOS mở ra → chuyển khoản thử.
3. Quay lại trang Tài khoản → gói chuyển thành **Pro** (tự cập nhật, hoặc bấm “Kiểm tra lại gói”).
4. Supabase → **Table Editor → payments / profiles** để xem đơn và hạn.

> Mẹo thử không tốn tiền: trong SQL Editor chạy
> `update profiles set plan='pro', plan_expires_at=now()+interval '30 days' where email='ban@email.com';`

## Vận hành
- **Tặng / gia hạn tay cho khách**: sửa `plan`, `plan_expires_at` trong bảng `profiles`.
- **Khách đổi máy**: khách tự xoá máy cũ ở trang Tài khoản; hoặc bạn xoá dòng trong bảng `devices`.
- **Đơn kẹt "chờ thanh toán"** (khách đã chuyển nhưng webhook lỗi): kiểm tra **Edge Functions → payos-webhook → Logs**; có thể chạy tay `select apply_payment(<mã đơn>, <số tiền>);` trong SQL Editor.
- **Hết hạn**: tự về gói Miễn phí, dữ liệu trên máy khách vẫn giữ.

## Lưu ý
- PayOS thu qua chuyển khoản / VietQR nên **không tự trừ tiền hằng tháng**: khách bấm gia hạn khi hết hạn (gói 3 / 12 tháng có giảm giá để khách mua dài).
- Định dạng API / chữ ký PayOS lấy theo tài liệu công khai của PayOS (`/v2/payment-requests`, HMAC-SHA256). Khi cắm khoá thật, thử 1 đơn nhỏ trước; nếu PayOS báo lỗi chữ ký, đối chiếu lại tài liệu mới nhất ở https://payos.vn/docs.
- Khoá tính năng nằm trong tiện ích (Chrome Web Store không cho tải code từ máy chủ), nên người rành kỹ thuật vẫn có thể bẻ khoá; giá trị chính nằm ở cập nhật thường xuyên và hỗ trợ.
- Bán thương mại công cụ đọc dữ liệu TikTok có rủi ro về điều khoản của TikTok; nên đặt tên sản phẩm không chứa chữ "TikTok" khi đưa lên Chrome Web Store.
