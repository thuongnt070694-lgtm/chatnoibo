# Hệ Thống Chat & Gọi Thoại/Video Nội Bộ (LAN Chat System)

Hệ thống ứng dụng web trao đổi tin nhắn, gửi file, gọi thoại và gọi video thời gian thực trong mạng nội bộ (LAN) mà không cần kết nối internet ra ngoài. Không phụ thuộc thư viện bên ngoài (Zero-dependency - thuần Node.js core modules & Vanilla JavaScript).

---

## 🌟 Tính Năng Nổi Bật

1. **Xác thực người dùng:**
   - Đăng ký và đăng nhập bằng Tên tài khoản & Mật khẩu.
   - Quản lý hồ sơ cá nhân: Đổi tên hiển thị, thay avatar, đổi mật khẩu.

2. **Tin nhắn thời gian thực (Real-time SSE):**
   - Nhắn tin 1-1 và phòng chat chung nội bộ.
   - Gửi hình ảnh xem trước (Lightbox zoom), gửi file tài liệu đính kèm.
   - Lưu trữ danh sách ảnh, tệp tin và liên kết đã chia sẻ ở cột chi tiết bên phải.
   - Thông báo tin nhắn mới dạng popup (Toast).

3. **Cuộc gọi thoại & video (Real-time LAN Call):**
   - Đàm thoại thời gian thực qua WebRTC / Web Audio API.
   - Phát âm thanh chuông gọi đi (tút... tút...) và chuông gọi đến.
   - Bật/Tắt Micro, Camera trong lúc đàm thoại.

4. **Quản lý nhóm chuyên sâu (Leader / Deputy / Members):**
   - Cơ chế bảo mật nhóm: Thành viên mới chỉ vào nhóm khi được Trưởng/Phó nhóm thêm vào.
   - Bổ nhiệm hoặc hủy Phó nhóm, chuyển giao quyền Trưởng nhóm.
   - Tính năng cấm chat từng thành viên (Mute/Unmute).
   - Chế độ chỉ Trưởng nhóm & Phó nhóm được gửi tin nhắn trong phòng họp.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Ứng Dụng

### Yêu cầu:
- Đã cài đặt [Node.js](https://nodejs.org/) (phiên bản 14 trở lên).

### Các bước khởi chạy:
1. Mở cửa sổ dòng lệnh (**Command Prompt** hoặc **PowerShell**) tại thư mục dự án:
   ```cmd
   cd c:\Users\Admin\Desktop\ChatExcel\test
   ```

2. Khởi động máy chủ:
   ```cmd
   node server.js
   ```

3. Truy cập ứng dụng:
   - Trên chính máy chủ: Mở trình duyệt và truy cập `http://localhost:3000`
   - Trên các máy khác cùng mạng LAN/Wi-Fi: Mở trình duyệt và truy cập địa chỉ IP LAN hiển thị trên màn hình console (ví dụ: `http://192.168.x.x:3000` hoặc `http://10.10.x.x:3000`).

---

## 📁 Cấu Trúc Dự Án

```
├── server.js            # Máy chủ HTTP & SSE Server (Node.js)
├── index.html           # Giao diện người dùng web
├── style.css            # Toàn bộ định kiểu CSS (Light/Dark theme)
├── app.js               # Logic giao diện, WebRTC, SSE & Audio
├── accounts_db.json     # Cơ sở dữ liệu tài khoản người dùng
├── group_db.json        # Cơ sở dữ liệu phòng họp & phân quyền nhóm
└── .gitignore           # File cấu hình bỏ qua git
```
