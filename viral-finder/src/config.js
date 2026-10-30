// Cấu hình máy chủ tài khoản (Supabase). Lấy ở Supabase → Project Settings → API.
// Để trống SUPABASE_URL = chế độ nội bộ: không cần đăng nhập, mở toàn bộ tính năng.
const TTA_CONFIG = {
  SUPABASE_URL: 'https://khjiaiarlgsqtrjqrrgh.supabase.co',      // vd: 'https://abcdxyz.supabase.co'
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtoamlhaWFybGdzcXRyanFycmdoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMzMjIwMjMsImV4cCI6MjEwODg5ODAyM30.CPr2Lk2ogGiIbnvF1yfgqIH2Kt_IET2Col8q_So0NPg',   // khoá "anon public" (được phép để trong tiện ích)
  SUPPORT: 'Zalo hỗ trợ: (điền số Zalo / hotline của bạn)',
  // Bảng giá hiển thị — phải khớp PRICES trong backend/supabase/functions/_shared/payos.ts
  PRICES: {
    pro: { 1: 39000, 3: 79000, 12: 199000 },
  },
  TRIAL_DAYS: 3,
};
