# 🎧 FiiO JA11 Studio — Live 5-Band PEQ, Ear Sweep & Native Android / WebHID Controller

[![Live Web App](https://img.shields.io/badge/Web_Studio-GitHub_Pages-00eefc?style=for-the-badge&logo=googlechrome&logoColor=white)](https://hoanfnho7.github.io/ja11-studio/)
[![Latest Android APK](https://img.shields.io/github/v/release/hoanfnho7/ja11-studio?label=Android%20APK&style=for-the-badge&color=ff9f0a&logo=android&logoColor=white)](https://github.com/hoanfnho7/ja11-studio/releases/latest)
[![Bilingual EN/VI](https://img.shields.io/badge/Language-English%20%7C%20Ti%E1%BA%BFng%20Vi%E1%BB%87t-22c55e?style=for-the-badge)](#)

An open-source, high-precision hardware controller for the **FiiO / JadeAudio JA11** (`KT02H20` USB-C DAC/DSP), built with an **Acoustic Precision Dark** interface. Available both as a **1920×1080 Desktop WebHID Studio** (zero installation) and a **100% Pure Native 120Hz Android App (`.APK`, zero WebView)**.

- 🌐 **Launch Web Studio (Chrome / Edge / Opera):** [https://hoanfnho7.github.io/ja11-studio/](https://hoanfnho7.github.io/ja11-studio/)
- 📱 **Download Pure Native Android App (`JA11-Studio-v3.2.apk`):** [Latest Release on GitHub](https://github.com/hoanfnho7/ja11-studio/releases/latest)
- 🌍 **Full Bilingual (`EN | VI`)**: Auto-detects English / Vietnamese with an instant **EN / VI** toggle button in the top bar on both Web and Android (switches without dropping your USB connection).

---

## ✨ Key Features

1. **Real-Time RAM PEQ Dragging (100% Flash-Safe):**
   - Drag all 5 parametric bands (`B1–B5`) directly on the curve (or pinch with 2 fingers on Android / mouse wheel on PC to adjust `Q`) and hear the sound change immediately over RAM HID commands (`0x15`, `0x17`) **without overwriting your saved Flash memory**.
   - Supports **1-Click Revert** back to the original chip curve, and only writes permanently to SPI Flash (`0x19` 9-byte commit) when you explicitly click **Save to Chip**.
2. **Full Hardware & Output Stage Control:**
   - **Hardware DAC Volume (`0–60`, reg `0x02`)** with quick **`32 (Min)`** and **`48 (Clean)`** presets, plus a built-in warning for `< 32/60` (on `KT02H20`, setting hardware DAC volume below `32/60` can introduce continuous quantization/Class-G crackle on sensitive IEMs — keep DAC volume at `32–60/60` and attenuate via OS volume or Master Gain).
   - **Master Preamp (`-12.0 .. +12.0 dB`)** with automatic Headroom calculation to prevent digital clipping.
   - Switch and read back all 5 hardware NVRAM modes (**`User 1`**, **`Vocal`**, **`Bass Boost`**, **`Classic`**, **`EQ Off / Bypass`**), toggle **Inline Mic (3.5mm CTIA)**, switch **UAC 2.0 (384kHz/32-bit)** / **UAC 1.0 (PS5 / Switch)**, and **Factory Reset**.
3. **Ear Canal Resonance Sweep (`20 Hz – 20 kHz`):**
   - Pure sine wave generator with **Auto Sweep (`2k → 10k`)**, **Left / Both / Right** channel routing, and a 1-click **Assign to Band 4** button to notch out your exact ear-canal/pinna peak.
4. **Offline Vault, FiiO `.XML`, FiiO Hand-Picked Cloud & AutoEQ 5000+:**
   - Full import/export compatibility with official `<FiiO_DSP model="JadeAudio JA11">` `.xml` files as well as AutoEQ / Squig.link `.txt` files.
   - Direct browser & Android access to **FiiO Hand-Picked (`814+` JA11 presets + all FiiO DACs)** using zero-dependency RSA+AES-256-ECB encryption (works directly on GitHub Pages with no backend required), plus **5,000+ AutoEQ lab measurements** with intelligent 10-band → 5-band compression.
5. **100% Pure Native Android APK (`~100 KB`, Zero WebView):**
   - Hardware-accelerated **120Hz Skia Canvas** PEQ graph, **48kHz Float32 `AudioTrack`** sine engine, physical camera-cutout/Dynamic Island safe insets, and an independent **USB-C OTG HID worker** that automatically scans `Report ID = 2` (even when Inline Mic is enabled) with a built-in **USB Hex Packet Log**.

---

## 💡 Audio Tip: Why Keep JA11 Hardware Volume at `32–60 / 60`?

On the **KT02H20** chip inside the FiiO JA11, hardware register `0x02` (`0–60`) applies steep fixed-point digital attenuation and interacts with the internal Class-G power rail threshold. Below **`32 / 60`**, sensitive IEMs can exhibit continuous crackling/buzzing.
- **Recommended setup:** Keep JA11 Hardware Volume between **`32 / 60` and `60 / 60`** (e.g., **`32 (Min)`** or **`48 (Clean)`**), and fine-tune listening loudness using **Windows / Android system volume** or **Master Preamp (`-12 dB`)**.

---

## 🚀 Build & Run Locally

### 1. Web Studio (Vite + React + TypeScript + WebHID)
```bash
npm install
npm test
npm run build
node server.mjs
# Open http://localhost:5178 in Chrome or Edge
```

### 2. Pure Native Android APK (`.apk`)
Requires Android SDK (`platforms/android-37.0`, `build-tools/36.0.0`) and JDK 17+:
```powershell
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
# Signed APK output: release\JA11-Studio-v3.2.apk
```

---

## 🇻🇳 Giới thiệu nhanh (Tiếng Việt)

**FiiO JA11 Studio** là bộ điều khiển PEQ 5-Band thời gian thực, đo đỉnh chói ống tai (Ear Sweep) và quản lý phần cứng dành cho **FiiO / JadeAudio JA11** (`KT02H20`), hỗ trợ **song ngữ Anh / Việt (`EN | VI`)** trên cả:
- 💻 **Web Studio 1920×1080 (Chrome / Edge PC):** [https://hoanfnho7.github.io/ja11-studio/](https://hoanfnho7.github.io/ja11-studio/) — cắm USB là dùng ngay, hỗ trợ truy cập trực tiếp kho **FiiO Hand-Picked** và **AutoEQ 5000+** ngay trên GitHub Pages.
- 📱 **App Android Pure Native 120Hz (`JA11-Studio-v3.2.apk`):** [Tải bản mới nhất tại Releases](https://github.com/hoanfnho7/ja11-studio/releases/latest) — viết thuần Java không dùng WebView, tự dò kênh USB-C OTG HID `Report ID = 2`, giữ kết nối ổn định kể cả khi đổi ngôn ngữ `EN | VI`.
- 🔊 **Mẹo chống rè trên KT02H20:** Luôn giữ **Âm lượng DAC phần cứng từ `32–60/60`** (chọn nhanh **`32 (Min)`** hoặc **`48 (Sạch)`**) và giảm thêm bằng âm lượng Windows / điện thoại hoặc **Master Preamp**.
