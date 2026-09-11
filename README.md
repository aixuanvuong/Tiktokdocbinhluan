# 🎵 TikTok Live Reader - Đọc Bình Luận & Lượt Follow Bằng Giọng Nói (TTS)

Ứng dụng web hỗ trợ kết nối trực tiếp đến các phòng **TikTok Live** đang phát sóng thời gian thực, tự động bắt sự kiện bình luận (Chat) và lượt theo dõi (Follow), sau đó đọc phát âm thanh bằng giọng đọc Tiếng Việt chuẩn.

---

## ⚡ CÀI ĐẶT 1 DÒNG LỆNH TRÊN UBUNTU SERVER (VPS)

Sau khi bạn đã **Export dự án sang GitHub** (xem hướng dẫn bên dưới), bạn chỉ cần đăng nhập vào **Ubuntu Server** qua SSH và chạy **1 dòng lệnh duy nhất**:

```bash
git clone https://github.com/aixuanvuong/Tiktokdocbinhluan.git app && cd app && chmod +x setup.sh && ./setup.sh
```

> **Kịch bản `setup.sh` sẽ tự động xử lý toàn bộ từ A-Z:**
> 1. Hỏi nhập **Tên miền của bạn** (Ví dụ: `live.yourdomain.com`). Nếu có tên miền, kịch bản sẽ **tự động cài đặt Nginx + Đăng ký SSL HTTPS miễn phí (Let's Encrypt)**. Nếu chưa có tên miền, nhấn Enter để chạy trực tiếp qua IP cổng 3000.
> 2. Cập nhật hệ thống Ubuntu & cài đặt công cụ cần thiết.
> 3. Tự động cài đặt **Node.js 20 LTS** & **PM2** (Quản lý tiến trình khởi động cùng Ubuntu).
> 4. Cài đặt toàn bộ thư viện npm (`npm install`).
> 5. Đóng gói ứng dụng (`npm run build`).
> 6. Khởi chạy ứng dụng chạy ngầm trên cổng `3000` hoặc HTTPS tên miền của bạn và cấu hình tự động bật lại nếu server bị khởi động lại (Reboot).

### 💡 Ví Dụ Chạy Tự Động Kèm Tên Miền (Không Cần Nhập Tay):
```bash
DOMAIN=live.yourdomain.com EMAIL=admin@yourdomain.com ./setup.sh
```

---

## 🐳 CÀI ĐẶT QUA DOCKER (TÙY CHỌN)

Nếu bạn ưa thích sử dụng Docker trên Ubuntu Server:

```bash
docker compose up -d --build
```

---

## 📤 HƯỚNG DẪN XUẤT MÃ NGUỒN SANG GITHUB

1. Trên màn hình AI Studio, nhấp vào biểu tượng **Settings (Bánh răng)** ở góc trên bên phải.
2. Chọn **Export to GitHub** (hoặc Download ZIP).
3. Đăng nhập tài khoản GitHub của bạn và chọn Tạo mới Repository.
4. Sau khi đẩy mã nguồn lên GitHub thành công, bạn sao chép đường dẫn Repository GitHub của mình và thay vào câu lệnh 1 dòng ở trên.

---

## ✨ Tính Năng Nổi Bật

- **Kết nối TikTok Live Realtime:** Kết nối tới bất kỳ phòng TikTok Live công khai nào chỉ bằng Unique ID (`@username`).
- **Động Cơ Đọc Giọng Nói Kép (Dual TTS Engine):**
  - **⭐ Google Tiếng Việt (Online - Khuyên Dùng):** Giọng nữ đọc phát mượt mà, chuẩn phát âm Tiếng Việt, không cần cài đặt gói ngôn ngữ trên thiết bị.
  - **Giọng Cục Bộ Trình Duyệt (Web Speech API):** Hỗ trợ các giọng đọc offline trên máy tính hoặc điện thoại.
- **Trích Xuất Thông Tin Người Dùng Thông Minh:**
  - Tự động lọc qua nhiều cấp dữ liệu để lấy chính xác tên hiển thị (`nickname`) hoặc ID (`uniqueId`).
  - Hỗ trợ chuẩn hóa ký tự Unicode nghệ thuật (chữ kiểu, ký tự đặc biệt) giúp giọng đọc phát âm chuẩn xác.
- **Tùy Chọn Mẫu Đọc Bình Luận (Chat Templates):**
  - **Mẫu 1:** `[Tên] nói [Nội dung]` *(Ví dụ: "Minh Tuấn nói áo này giá bao nhiêu")*
  - **Mẫu 2:** `[Tên] bình luận [Nội dung]`
  - **Mẫu 3:** `[Tên], [Nội dung]`
  - **Mẫu 4:** `Chỉ đọc [Nội dung bình luận]` (Thích hợp cho livestream nhiều bình luận liên tục)
- **🚫 Bộ Lọc Danh Sách Đen (Blacklist & Filtering):**
  - Tùy chỉnh danh sách từ khóa cấm đọc (quảng cáo, rác, sđt, từ nhạy cảm) và danh sách tài khoản cấm đọc.
  - Tự động lưu cấu hình lọc vào `localStorage` của trình duyệt.
- **Cấu Hình Giọng Đọc Linh Hoạt:** Đã bổ sung các thanh trượt điều chỉnh Tốc độ (Rate), Cao độ (Pitch) và Âm lượng (Volume).
- **Bộ Chế Độ Giả Lập (Simulation Test):** Thử nghiệm phát âm thanh, bảng theo dõi sự kiện mà không cần đợi kênh thật phát livestream.

---

## 🛠️ Hướng Dẫn Cài Đặt Thủ Công (Nếụ Không Dùng Setup.sh)

### 1. Cài Đặt Dependencies
```bash
npm install
```

### 2. Chạy Chế Độ Development
```bash
npm run dev
```
Mở trình duyệt: `http://localhost:3000`

### 3. Build Production
```bash
npm run build
npm start
```

---

## 📁 Cấu Trúc Dự Án

```
├── setup.sh               # Kịch bản tự động cài đặt 1 dòng lệnh trên Ubuntu Server
├── Dockerfile             # File đóng gói Docker Image
├── docker-compose.yml     # File cấu hình chạy Docker Compose
├── server.ts              # Server Node.js (Express + Socket.IO + TikTok Live Connector)
├── index.html             # Giao diện chính ứng dụng (Tailwind CSS, SpeechQueueManager UI)
├── package.json           # Danh sách thư viện & lệnh chạy (scripts)
├── vite.config.ts         # Cấu hình Vite build client
└── README.md              # Tài liệu hướng dẫn cài đặt & sử dụng
```
