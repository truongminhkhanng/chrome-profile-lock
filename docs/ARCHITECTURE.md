# Kiến trúc Profile Lock Lite

## Thành phần

- `manifest.json`: khai báo Manifest V3, quyền và đường dẫn entry point.
- `src/background.js`: quản lý trạng thái khóa, hồ sơ, quy tắc website và phiên tập trung.
- `src/content.js`: hiển thị lớp bảo vệ trên website.
- `src/crypto.js`: dẫn xuất và xác minh credential cục bộ.
- `src/popup.*`: điều khiển nhanh trên thanh công cụ.
- `src/options.*`: dashboard cấu hình.
- `src/lock.*`: màn hình mở khóa.
- `tests/`: smoke test cho logic bảo mật chính.
- `scripts/build.cjs`: sao chép các file cần thiết vào `dist/`.

## Luồng dữ liệu

Giao diện gửi message đến service worker. Service worker đọc và ghi `chrome.storage.local`, xác minh credential rồi phát trạng thái mới đến các tab. Mật khẩu dạng rõ không được lưu trong cấu hình.

## Build

Chạy `npm run build`, sau đó chọn thư mục `dist/` khi dùng **Load unpacked**. Có thể load trực tiếp thư mục gốc trong lúc phát triển.
