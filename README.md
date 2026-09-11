# 🎵 TikTok Live Reader - Đọc Bình Luận & Lượt Follow Bằng Giọng Nói (TTS)

Ứng dụng web hỗ trợ kết nối trực tiếp đến các phòng **TikTok Live** đang phát sóng thời gian thực, tự động bắt sự kiện bình luận (Chat) và lượt theo dõi (Follow), sau đó đọc phát âm thanh bằng giọng đọc Tiếng Việt chuẩn.

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

## 🛠️ Yêu Cầu Hệ Thống

- **Node.js:** Phiên bản `18.0.0` trở lên.
- **npm:** Đi kèm với Node.js (phiên bản `9.x` trở lên) hoặc **yarn** / **pnpm**.

---

## 🚀 Hướng Dẫn Cài Đặt & Chạy Ứng Dụng

### 1. Tải Mã Nguồn & Cài Đặt Dependencies

Mở terminal/command prompt tại thư mục dự án và chạy lệnh:

```bash
npm install
```

### 2. Chạy Ở Chế Độ Phát Triển (Development)

Chạy lệnh dev server:

```bash
npm run dev
```

Server sẽ khởi chạy tại cổng **3000**. Mở trình duyệt và truy cập:
👉 **`http://localhost:3000`**

### 3. Đóng Gói & Chạy Ở Chế Độ Sản Xuất (Production)

Nếu muốn đóng gói ứng dụng để triển khai (Deploy) hoặc chạy thực tế:

**Bước 1: Build ứng dụng**
```bash
npm run build
```

**Bước 2: Khởi chạy sản phẩm**
```bash
npm start
```

Ứng dụng sẽ chạy tại địa chỉ **`http://localhost:3000`**.

---

## 📖 Hướng Dẫn Sử Dụng

1. **Bật Âm Thanh Trình Duyệt:**
   - Khi vừa mở trang web, nhấp vào nút **"Âm thanh chưa kích hoạt (Bấm để bật)"** ở góc trên bên phải để cấp quyền tự động phát âm thanh cho trình duyệt (Autoplay policy).

2. **Kết Nối Phòng TikTok Live:**
   - Tìm một tài khoản TikTok **đang phát trực tiếp thực tế**.
   - Nhập Unique ID vào ô kết nối (Ví dụ: `user123` hoặc `@user123`).
   - Nhấp nút **"Kết Nối Live"**.

3. **Thử Nghiệm Không Cần Mở Live:**
   - Bạn có thể nhấp nút **"Chạy Giả Lập Test"** (Màu tím) để chạy luồng dữ liệu bình luận & follow mẫu nhằm thử nghiệm hệ thống âm thanh.

4. **Tùy Chỉnh Giọng Đọc:**
   - Tại bảng **"Cấu Hình Giọng Đọc (TTS)"**, chọn Mẫu đọc bình luận mong muốn, điều chỉnh tốc độ hoặc chuyển đổi giữa giọng Google Online và giọng máy tính.

---

## 📁 Cấu Trúc Thư Mục

```
├── server.ts              # Server Node.js (Express + Socket.IO + TikTok Live Connector)
├── index.html             # Giao diện chính ứng dụng (Tailwind CSS, SpeechQueueManager UI)
├── package.json           # Danh sách thư viện & lệnh chạy (scripts)
├── vite.config.ts         # Cấu hình Vite build client
├── metadata.json          # Thông tin ứng dụng
└── README.md              # Tài liệu hướng dẫn cài đặt & sử dụng
```

---

## ❓ Xử Lý Lỗi Thường Gặp

- **Không kết nối được TikTok Live:**
  - Kiểm tra xem tài khoản TikTok nhập vào có thực sự **ĐANG LIVESTREAM** hay không. Nếu kênh đang Offline, TikTok sẽ từ chối kết nối.
- **Trình duyệt không phát tiếng:**
  - Đảm bảo đã nhấp vào nút kích hoạt âm thanh màu xanh ở góc trên bên phải.
  - Đảm bảo không bật chế độ Mute Tab trên trình duyệt.
