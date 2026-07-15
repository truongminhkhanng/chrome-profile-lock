# Security Review — Profile Lock Lite 2.0.2

## Phạm vi

Profile Lock Lite là lớp bảo vệ cục bộ cho một profile Chrome. Extension không thay thế khóa tài khoản hệ điều hành, mã hóa ổ đĩa hay chính sách quản trị thiết bị. Người có quyền quản trị vẫn có thể vô hiệu hóa hoặc gỡ extension.

## Lưu và xác minh bí mật

- Mã PIN chính, mã PIN website và recovery code không được lưu dạng rõ.
- `src/crypto.js` dùng Web Crypto API với PBKDF2-SHA256, salt ngẫu nhiên 16 byte và 210.000 vòng lặp.
- Storage chỉ giữ thuật toán, số vòng lặp, salt và verifier ở dạng Base64 trong `chrome.storage.local`.
- Khi xác minh, bí mật người dùng nhập được dẫn xuất lại bằng cùng tham số rồi so sánh verifier.
- Recovery code được tạo bằng `crypto.getRandomValues`, chỉ trả về giao diện khi vừa tạo hoặc tạo lại; storage chỉ giữ credential đã dẫn xuất.
- Mã PIN chính chỉ nhận đúng 4 hoặc 6 chữ số. Đổi độ dài bắt buộc xác minh mã hiện tại hoặc recovery code rồi tạo credential mới.
- Credential mật khẩu chữ từ phiên bản cũ vẫn được giữ nguyên. Người dùng dùng recovery code để đặt mã PIN mới; extension không xóa credential âm thầm.

## Chống brute-force

- `failedAttempts` và `lockoutUntil` được lưu trong `chrome.storage.local`, nên reload màn hình khóa hoặc service worker không xóa bộ đếm.
- Sau lần sai thứ 5, extension chặn nhập trong 60 giây. Các lần sai tiếp theo tăng thời gian chờ theo tầng, tối đa 15 phút.
- Màn hình khóa hiển thị đếm ngược dựa trên timestamp trong storage.
- Lần sai thứ 5 tạo notification hệ thống và ghi sự kiện vào nhật ký bảo mật.
- Xác thực thành công đặt lại bộ đếm và thời gian khóa.

## Thực thi trạng thái khóa

Extension dùng nhiều lớp bổ trợ:

1. Content script chạy từ `document_start`, che nội dung trong lúc chờ trạng thái và bắt sự kiện tương tác khi bị khóa.
2. Overlay nằm trong closed Shadow DOM với z-index tối đa.
3. Watchdog mỗi 2 giây đọc lại trạng thái từ service worker, dựng lại overlay nếu host bị xóa và khôi phục style bảo vệ nếu bị sửa.
4. Service worker phát trạng thái tới mọi tab khi khóa/mở khóa, theo dõi `tabs.onActivated`, `tabs.onUpdated` và `webNavigation.onCommitted`.
5. Khi khóa toàn cục, service worker đưa tab mở khóa của extension ra trước. Tab này không nằm trong DOM của website đích.
6. `chrome.idle.onStateChanged` khóa ngay khi hệ điều hành báo `locked`; alarm/heartbeat phát hiện khoảng ngắt do sleep hoặc service worker bị tạm dừng.

`chrome.webNavigation` không phải API chặn đồng bộ trong Manifest V3. Vì vậy extension dùng sự kiện điều hướng như một lớp phát hiện độc lập để tái áp trạng thái khóa, không tuyên bố có thể ngăn tuyệt đối mọi navigation trước khi Chrome commit.

## Whitelist

Domain trong danh sách “Website luôn được phép” được miễn overlay khóa toàn cục và khóa theo website. Quy tắc áp dụng cho domain chính và subdomain. Chỉ nên whitelist website không chứa dữ liệu nhạy cảm; tab whitelist vẫn có thể hoạt động trong khi profile đang khóa.

## Dữ liệu và mạng

- Không có analytics, quảng cáo, API từ xa hoặc đồng bộ server.
- Export cấu hình không chứa verifier, salt, mật khẩu, PIN hay recovery credential.
- Extension cần `<all_urls>` để content script bảo vệ website, nhưng không gửi nội dung trang ra ngoài.
- Nhật ký bảo mật lưu tối đa 200 sự kiện cục bộ.

## Kiểm thử thủ công trước release

1. Thiết lập mã PIN 4 số rồi 6 số, kiểm tra storage không chứa mã PIN hoặc recovery code dạng rõ.
2. Nhập sai 5 lần, xác nhận khóa 60 giây, đếm ngược còn đúng sau khi reload và notification xuất hiện.
3. Mở DevTools trên website bị khóa, xóa host overlay hoặc sửa inline style; xác nhận overlay trở lại trong tối đa 2 giây.
4. Khi đang khóa, điều hướng tab hiện tại và mở tab mới; xác nhận lớp khóa/tab mở khóa được tái áp.
5. Nhấn `Ctrl+Shift+L` hoặc `Command+Shift+L`; xác nhận profile khóa ngay.
6. Thử từng mức idle 1/5/15/30 phút và tùy chọn tắt; xác nhận trạng thái sau sleep/OS lock.
7. Thêm domain whitelist, khóa profile và xác nhận chỉ domain đó cùng subdomain vẫn truy cập được.
8. Dùng recovery code đặt lại mật khẩu; xác nhận code cũ không còn hợp lệ sau khi tạo code mới.
9. Thay theme, màu chủ đạo và câu chào; xác nhận dashboard, popup và màn hình khóa hiển thị đúng.
10. Export/import cấu hình; xác nhận file có thiết lập giao diện/website nhưng không có credential.
11. Kiểm tra PIN component: nhập tuần tự, Backspace ở ô trống, mũi tên trái/phải, paste 4/6 số, ẩn/hiện và auto-submit.
