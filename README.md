# 🎧 FiiO JA11 Studio — Live PEQ, Ear Sweep & Native Android / WebHID Controller

Bộ công cụ điều khiển chuyên sâu **FiiO / JadeAudio JA11** (KT02H20 DSP) với ngôn ngữ thiết kế **Acoustic Precision Dark**, hoạt động trên cả **Trình duyệt PC (WebHID PWA)** và **Điện thoại Android (100% Pure Native `.APK` 120Hz)**.

- 🌐 **Dùng trực tiếp trên Web (Chrome / Edge PC):** [https://hoanfnho7.github.io/ja11-studio/](https://hoanfnho7.github.io/ja11-studio/)
- 📱 **Tải App Android Native (`JA11-Studio-v3.0.apk`):** [Tải bản mới nhất tại mục Releases](https://github.com/hoanfnho7/ja11-studio/releases/latest)

---

## ✨ Tính năng nổi bật

1. **Chỉnh EQ kéo thả thời gian thực trên RAM (An toàn 100% cho bộ nhớ Flash):**
   - Kéo trực tiếp 5 điểm băng tần (`B1..B5`) để nghe chất âm đổi tức thì dưới ngón tay thông qua gói lệnh RAM (`0x15`, `0x17`) mà **không ghi đè cấu hình gốc**.
   - Hỗ trợ **Hoàn tác 1 chạm (Revert)** về cấu hình trước khi chỉnh, và chỉ ghi vĩnh viễn vào SPI Flash (`0x19` chuẩn 9-byte) khi bạn chủ động bấm **Lưu Chip**.
2. **Kiểm soát phần cứng toàn diện:**
   - Chỉnh **Âm lượng phần cứng DAC (`0 – 60`)** kèm mức êm `32 (PC)` trị dứt điểm bệnh âm lượng quá lớn trên Windows.
   - **Master Preamp (`-12.0 .. +12.0 dB`)** tự động tính toán Headroom chống vỡ tiếng (Digital Clipping).
   - Chuyển đổi và đọc ngược đáp tuyến 5 chế độ phần cứng (`User 1`, `Vocal`, `Bass Boost`, `Classic`, `Tắt EQ`), bật/tắt **Inline Mic (3.5mm CTIA)**, chuyển chuẩn **UAC 2.0 (384kHz)** / **UAC 1.0 (PS5 / Switch)** và **Factory Reset**.
3. **Dò đỉnh chói ống tai (Ear Peak Sweep):**
   - Phát sóng Sin `20 Hz – 20 kHz`, tự quét dải nhạy `2k → 10k`, kiểm tra lệch tai `Trái (L) / Phải (R)` và nút **Gán vào B4** đưa thẳng tần số chói vừa bắt được sang Band 4 để gọt đỉnh.
4. **Kho Profile Offline, FiiO `.XML` & Cộng đồng Online:**
   - Đọc/xuất chuẩn 100% file `<FiiO_DSP model="JadeAudio JA11">` của FiiO Control, hỗ trợ cả `.txt` AutoEQ / Squig.link.
   - Tra cứu trực tiếp hơn **5.000+ mẫu tai nghe từ AutoEQ** và kho **FiiO Hand-Picked (`814+` cấu hình JA11)**, tự động nén thông minh các cấu hình 10-Band về 5-Band.
5. **App Android v3.0 viết thuần Native 100% (`96.5 KB`):**
   - Loại bỏ hoàn toàn WebView: vẽ đồ thị bằng **Skia Hardware Canvas 120fps** (kéo 1 ngón đổi Freq/Gain, chụm 2 ngón Pinch đổi Q), phát sóng Sin bằng `AudioTrack` PCM Float 48kHz, luồng USB-C OTG HID độc lập tự dò `Report ID = 2` kèm hộp thoại **Nhật ký Gói tin USB (Hex)**.

---

## 🚀 Chạy & Đóng gói trên máy cá nhân

### 1. Bản Web PWA ( kèm cầu nối FiiO Hand-Picked nội bộ )
```bash
npm install
npm test
npm run build
node server.mjs
# Mở http://localhost:5178 trên Chrome hoặc Edge
```

### 2. Đóng gói App Android Native (`.apk`)
Yêu cầu có sẵn Android SDK (`platforms/android-37.0`, `build-tools/36.0.0`) và JDK 17+:
```powershell
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
# File APK đã ký số sẽ xuất ra tại release\JA11-Studio-v3.0.apk
```
