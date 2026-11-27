import { PeqProfile } from './ja11Protocol';

/**
 * Built-in Offline Curated Profiles tailored for FiiO JD1 + JA11
 * (including the user's personal 4380Hz ear-calibrated presets + Phonk + Harman + Gaming).
 */
export const BUILTIN_PROFILES: PeqProfile[] = [
  {
    id: 'builtin-custom-4380hz',
    name: 'JD1 + JA11 | Custom Ear 4380Hz (Chuẩn tai bạn)',
    description:
      'Đo thực tế trên tai bạn: cắt gọn đỉnh chói 4380Hz, gọt mid-bass 185Hz hết lấn, đẩy vocal 680Hz dày ấm, mượt s/x + hạ -12dB cứu âm lượng Windows.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'Personal Calibration',
    masterGain: -12,
    bands: [
      { type: 'LSQ', freq: 55, gain: 1.5, q: 0.71 },
      { type: 'PK', freq: 185, gain: -2.8, q: 1.1 },
      { type: 'PK', freq: 680, gain: 2.0, q: 1.0 },
      { type: 'PK', freq: 4380, gain: -3.8, q: 3.2 },
      { type: 'PK', freq: 7500, gain: -2.5, q: 1.4 },
    ],
    updatedAt: 1732550000000,
  },
  {
    id: 'builtin-phonk-4380hz-fix',
    name: 'JD1 + JA11 | Phonk 808 (4380Hz Fix)',
    description:
      'Độ lại từ bản Phonk & 808 gốc: giữ cú đập 808 căng nảy nhưng dời điểm cắt cowbell về đúng đỉnh 4380Hz của tai bạn và hạ -12dB.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'Personal Calibration',
    masterGain: -12,
    bands: [
      { type: 'LSQ', freq: 60, gain: 3.5, q: 0.71 },
      { type: 'PK', freq: 105, gain: 1.2, q: 1.3 },
      { type: 'PK', freq: 230, gain: -2.8, q: 1.3 },
      { type: 'PK', freq: 4380, gain: -4.2, q: 3.0 },
      { type: 'PK', freq: 7600, gain: -2.0, q: 1.4 },
    ],
    updatedAt: 1732549000000,
  },
  {
    id: 'builtin-phonk-original',
    name: 'JD1 + JA11 | Phonk & 808 Bass (File gốc của bạn)',
    description:
      'Tuned for FiiO JD1 + JA11 combo. Heavy 808 sub-bass slam, punchy kick, and tamed cowbell harshness for Phonk, Drift Phonk & Bass music.',
    category: 'personal',
    deviceModel: 'JadeAudio JA11',
    author: 'User XML Backup',
    masterGain: -4,
    bands: [
      { type: 'LSQ', freq: 65, gain: 3.5, q: 0.71 },
      { type: 'PK', freq: 110, gain: 1.5, q: 1.3 },
      { type: 'PK', freq: 260, gain: -2.5, q: 1.4 },
      { type: 'PK', freq: 2800, gain: -3.0, q: 2.0 },
      { type: 'PK', freq: 9000, gain: 2.0, q: 1.2 },
    ],
    updatedAt: 1732548000000,
  },
  {
    id: 'builtin-jd1-audiophile-neutral',
    name: 'JD1 | IEF Neutral / Studio Reference',
    description:
      'Biến chất âm V-shape gốc của JD1 về cân bằng chuẩn phòng thu: dải trầm phẳng sạch, trung âm trung thực, giảm gắt màng loa LCP.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio Curated',
    masterGain: -8,
    bands: [
      { type: 'LSQ', freq: 105, gain: -2.2, q: 0.71 },
      { type: 'PK', freq: 210, gain: -2.5, q: 1.2 },
      { type: 'PK', freq: 750, gain: 1.8, q: 0.9 },
      { type: 'PK', freq: 3300, gain: -2.2, q: 2.0 },
      { type: 'HSQ', freq: 7000, gain: -2.5, q: 0.71 },
    ],
    updatedAt: 1732547000000,
  },
  {
    id: 'builtin-jd1-vocal-ballad',
    name: 'JD1 | Lush Vocal & Acoustic Ballad',
    description:
      'Tối ưu cho nhạc Trữ tình, Acoustic, Pop Ballad, US-UK: giọng ca sĩ ngọt, dày, tiến sát người nghe, nghe hàng giờ không mỏi tai.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio Curated',
    masterGain: -10,
    bands: [
      { type: 'PK', freq: 175, gain: -3.0, q: 1.0 },
      { type: 'PK', freq: 620, gain: 2.6, q: 0.9 },
      { type: 'PK', freq: 1800, gain: 1.2, q: 1.5 },
      { type: 'PK', freq: 4380, gain: -4.0, q: 3.0 },
      { type: 'HSQ', freq: 6800, gain: -2.8, q: 0.71 },
    ],
    updatedAt: 1732546000000,
  },
  {
    id: 'builtin-jd1-fps-gaming',
    name: 'JD1 | Competitive FPS Footsteps (CS2 / Valorant)',
    description:
      'Hạ rền bom nổ sub-bass gây choáng, đẩy dải tiếng bước chân & thay đạn (1.2kHz–2.4kHz) rõ nét mà không chói tiếng súng.',
    category: 'curated',
    deviceModel: 'JadeAudio JA11',
    author: 'JA11 Studio Curated',
    masterGain: -10,
    bands: [
      { type: 'LSQ', freq: 110, gain: -4.5, q: 0.71 },
      { type: 'PK', freq: 240, gain: -2.5, q: 1.2 },
      { type: 'PK', freq: 1650, gain: 3.2, q: 1.3 },
      { type: 'PK', freq: 4380, gain: -4.2, q: 3.2 },
      { type: 'HSQ', freq: 7500, gain: -2.0, q: 0.71 },
    ],
    updatedAt: 1732545000000,
  },
];
