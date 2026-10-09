/*
 * Cấu hình ChấmCông Go.
 *
 * Để trống `firebase` (null) thì app chạy CHẾ ĐỘ DÙNG THỬ: dữ liệu mẫu lưu trong trình duyệt,
 * mỗi máy một bản riêng. Dùng thật cho cả công ty: tạo dự án Firebase rồi dán cấu hình
 * (Project settings › Your apps › Web app › Config) vào đây. Xem README.md.
 */
window.CCG_CONFIG = {
  firebase: null
  // firebase: {
  //   apiKey: "...",
  //   authDomain: "ten-du-an.firebaseapp.com",
  //   projectId: "ten-du-an",
  //   appId: "..."
  // }
};
