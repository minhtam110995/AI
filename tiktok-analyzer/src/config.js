// Cấu hình máy chủ tài khoản (Supabase). Lấy ở Supabase → Project Settings → API.
// Để trống SUPABASE_URL = chế độ nội bộ: không cần đăng nhập, mở toàn bộ tính năng.
const TTA_CONFIG = {
  SUPABASE_URL: '',        // vd: 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: '',   // khoá "anon public" (được phép để trong tiện ích)
  SUPPORT: 'Zalo/hotline hỗ trợ của bạn',
  // Bảng giá hiển thị — phải khớp PRICES trong backend/supabase/functions/_shared/payos.ts
  PRICES: {
    pro: { 1: 199000, 3: 537000, 12: 1910000 },
    team: { 1: 499000, 3: 1347000, 12: 4790000 },
  },
};
