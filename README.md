# Profile Lock Lite

Tiện ích Chrome Manifest V3 giúp khóa phiên duyệt web, bảo vệ website nhạy cảm và hỗ trợ chế độ tập trung. Toàn bộ mật khẩu, cấu hình và nhật ký được lưu cục bộ trên thiết bị.

> Phiên bản hiện tại: **2.0**

## Tính năng

### Bảo mật chung

- Khóa và mở khóa toàn bộ phiên Chrome.
- Mật khẩu được dẫn xuất bằng PBKDF2-SHA256, 210.000 vòng lặp và salt ngẫu nhiên riêng.
- Tự chuyển mật khẩu SHA-256 của phiên bản cũ sang PBKDF2 sau lần đăng nhập hợp lệ.
- Tự khóa khi khởi động Chrome, khi hệ thống sleep/locked hoặc sau thời gian không hoạt động tùy chỉnh.
- Thời gian chờ tăng dần khi nhập sai nhiều lần.
- Hiện/ẩn mật khẩu, cảnh báo Caps Lock và đo độ mạnh mật khẩu.
- Popup hiển thị trạng thái và thời gian còn lại trước khi tự khóa.

### Bảo vệ website

- Danh sách website luôn yêu cầu xác thực.
- Danh sách website luôn được phép truy cập.
- Mật khẩu website riêng, độc lập với mật khẩu khóa Chrome.
- Phiên website tự hết hiệu lực khi:
  - đóng tab cuối cùng của tên miền;
  - chuyển tab cuối cùng sang tên miền khác;
  - khóa màn hình hoặc máy sleep;
  - Chrome bị khóa hoặc khởi động lại;
  - hết giới hạn 30 phút.
- Hỗ trợ tên miền chính và tên miền phụ.

### Chế độ tập trung

- Chặn tạm thời danh sách website gây xao nhãng.
- Tùy chỉnh thời lượng từ 1 đến 1.440 phút.
- Đồng hồ đếm ngược trên trang bị chặn và trong phần cài đặt.

### Hồ sơ và khôi phục

- Nhiều hồ sơ với mật khẩu riêng.
- Mã PIN nhanh từ 4–8 chữ số.
- Recovery code cho quy trình đặt lại mật khẩu.
- Chuyển hoặc xóa hồ sơ có xác thực.

### Dữ liệu và giao diện

- Giao diện sáng, tối hoặc theo hệ thống.
- Xuất/nhập cấu hình JSON không chứa mật khẩu, PIN hoặc recovery code.
- Nhật ký bảo mật cục bộ, tối đa 200 sự kiện.
- Dashboard responsive với điều hướng riêng cho từng nhóm tính năng.

## Cài đặt thủ công

1. Tải repository hoặc giải nén gói phát hành.
2. Mở `chrome://extensions`.
3. Bật **Developer mode**.
4. Chọn **Load unpacked**.
5. Chọn thư mục chứa `manifest.json`.
6. Tạo mật khẩu chính và lưu recovery code ở nơi an toàn.

Sau khi thay đổi mã nguồn, bấm nút **Reload** trên thẻ extension. Refresh các tab đang mở để content script mới được nạp lại.

## Hướng dẫn nhanh

Trang cài đặt được chia thành bốn khu vực:

| Khu vực | Nội dung |
| --- | --- |
| Bảo mật chung | Mật khẩu chính, tự động khóa và khóa ngay |
| Website | Website bảo vệ, mật khẩu website và chế độ tập trung |
| Hồ sơ & khôi phục | Profile, PIN và recovery code |
| Dữ liệu | Xuất/nhập cấu hình và nhật ký bảo mật |

Để đặt mật khẩu riêng cho website:

1. Mở **Cài đặt → Website**.
2. Thêm tên miền vào danh sách website bảo vệ.
3. Nhập mật khẩu chính để xác nhận.
4. Tạo mật khẩu website mới với độ dài tùy ý (không được để trống).
5. Lưu quy tắc và mật khẩu website.

## Kiến trúc dự án

```text
chrome-profile-lock-lite-v2/
├── manifest.json           # Manifest V3 và quyền extension
├── background.js           # Service worker, state và chính sách khóa
├── crypto.js               # PBKDF2, SHA-256 migration và recovery code
├── content.js              # Màn che website và theo dõi hoạt động
├── popup.html/css/js       # Popup trên thanh công cụ
├── options.html/css/js     # Dashboard cài đặt
├── lock.html/css/js        # Màn hình xác thực
├── tests/
│   └── background-smoke.cjs
└── README.md
```

## Mô hình dữ liệu

Extension sử dụng `chrome.storage.local`. Credential chỉ lưu verifier, salt, thuật toán và số vòng lặp; không lưu mật khẩu dạng rõ.

- `profiles`: hồ sơ và credential đã dẫn xuất.
- `activeProfileId`: hồ sơ hiện hành.
- `protectedSites` / `allowedSites`: quy tắc tên miền.
- `siteUnlocks`: phiên mở tạm thời theo tên miền.
- `focusDomains` / `focusUntil`: trạng thái tập trung.
- `logs`: nhật ký bảo mật cục bộ.

File cấu hình xuất ra không bao gồm verifier, salt, PIN hoặc recovery credential.

## Phát triển và kiểm thử

Dự án dùng JavaScript, HTML và CSS thuần; không cần bước build hoặc cài dependency.

Kiểm tra cú pháp:

```powershell
node --check background.js
node --check content.js
node --check options.js
node --check lock.js
```

Chạy smoke test:

```powershell
node tests/background-smoke.cjs
```

Smoke test kiểm tra PBKDF2, recovery code, migration mật khẩu cũ, quy tắc website, allowlist, mật khẩu website riêng và việc thu hồi phiên khi đóng tab cuối.

## Quyền Chrome

| Quyền | Mục đích |
| --- | --- |
| `storage` | Lưu cấu hình và credential cục bộ |
| `tabs` | Cập nhật trạng thái khóa theo tab |
| `windows` | Đưa màn hình khóa lên trước |
| `idle` | Phát hiện idle/locked |
| `alarms` | Kiểm tra timeout và trạng thái sleep |
| `<all_urls>` | Áp dụng lớp bảo vệ cho website người dùng cấu hình |

## Giới hạn bảo mật

Profile Lock Lite là lớp bảo vệ ở mức extension, không thay thế khóa tài khoản hệ điều hành hoặc mã hóa ổ đĩa.

- Chrome không cho content script chạy trên một số trang nội bộ như `chrome://`.
- Người có quyền quản trị máy tính vẫn có thể vô hiệu hóa hoặc gỡ extension.
- Không nên xem extension là phương án bảo vệ trước đối tượng có toàn quyền truy cập thiết bị.

## Đưa lên GitHub

Trước khi public repository:

1. Thêm ảnh chụp popup, trang cài đặt và màn hình khóa vào `docs/screenshots/`.
2. Chọn và thêm file `LICENSE` phù hợp.
3. Không commit dữ liệu Chrome profile, file cấu hình cá nhân hoặc recovery code.
4. Tạo release từ file ZIP đã đóng gói.

## Đóng góp

Issue và pull request nên mô tả rõ phiên bản Chrome, bước tái hiện, kết quả mong đợi và ảnh lỗi nếu có. Mọi thay đổi liên quan đến credential cần bổ sung hoặc cập nhật smoke test.
