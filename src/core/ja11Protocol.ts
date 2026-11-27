export type FilterType = 'PK' | 'LSQ' | 'HSQ';

export interface PeqBand {
  type: FilterType;
  freq: number; // 20 .. 20000 Hz (integer)
  gain: number; // -12.0 .. +12.0 dB (step 0.1)
  q: number;    // 0.10 .. 10.00 (step 0.01)
}

export interface PeqSnapshot {
  masterGain: number; // -12.0 .. +12.0 dB (step 0.1)
  bands: [PeqBand, PeqBand, PeqBand, PeqBand, PeqBand];
}

export interface PeqProfile extends PeqSnapshot {
  id: string;
  name: string;
  description: string;
  category?: 'personal' | 'curated' | 'handpicked' | 'shared';
  deviceModel?: string;
  author?: string;
  updatedAt: number;
  compressedFromBands?: number;
}

export interface Ja11HardwareState {
  connected: boolean;
  transportName: 'webhid' | 'android-usb' | 'none';
  productName: string;
  firmwareVersion: string;
  sampleRate: string;
  deviceVolume: number; // 0 .. 60
  inlineControl: boolean;
  eqPreset: number; // 0=Vocal, 1=Classic, 2=Bass, 3=User 1, 4=Off
  uacMode: number;  // 0=UAC 1.0, 1=UAC 2.0
}

export const JA11_VID = 0x2972;
export const JA11_PIDS = [0x0101, 0x0102] as const;
export const REPORT_ID = 2;
export const BAND_COUNT = 5;

export const JA11_HID_FILTERS = [
  { vendorId: JA11_VID, productId: 0x0101 }, // UAC 1.0
  { vendorId: JA11_VID, productId: 0x0102 }, // UAC 2.0
] as const;

export const FILTER_TYPE_TO_CODE: Record<FilterType, number> = {
  PK: 0,
  LSQ: 1,
  HSQ: 2,
};

export const CODE_TO_FILTER_TYPE: Record<number, FilterType> = {
  0: 'PK',
  1: 'LSQ',
  2: 'HSQ',
};

export const COMMANDS = {
  DEVICE_VOLUME: 0x02,
  SAMPLE_RATE: 0x09,
  FIRMWARE_VERSION: 0x0b,
  INLINE_CONTROL: 0x12,
  EQ_BAND: 0x15,
  EQ_PRESET: 0x16,
  MASTER_GAIN: 0x17,
  SAVE_FLASH: 0x19,
  EQ_RESET: 0x1b,
  UAC_MODE: 0x20,
} as const;

export const SAMPLE_RATE_NAMES = [
  '32 kHz', '44.1 kHz', '48 kHz', '88.2 kHz', '96 kHz',
  '176.4 kHz', '192 kHz', '352.8 kHz', '384 kHz',
  '705.6 kHz', '768 kHz', 'DSD64', 'DSD128', 'DSD256', 'DSD512',
] as const;

export const EQ_PRESET_NAMES = ['Vocal', 'Classic', 'Bass', 'User 1', 'Off'] as const;
export const UAC_MODE_NAMES = ['UAC 1.0', 'UAC 2.0'] as const;

export const PEQ_LIMITS = {
  masterGain: { min: -12, max: 12, step: 0.1, decimals: 1 },
  freq: { min: 20, max: 20000, step: 1, decimals: 0 },
  gain: { min: -12, max: 12, step: 0.1, decimals: 1 },
  q: { min: 0.1, max: 10, step: 0.01, decimals: 2 },
} as const;

export const DEFAULT_NEUTRAL_BANDS: [PeqBand, PeqBand, PeqBand, PeqBand, PeqBand] = [
  { type: 'LSQ', freq: 60, gain: 0, q: 0.71 },
  { type: 'PK', freq: 200, gain: 0, q: 1.0 },
  { type: 'PK', freq: 1000, gain: 0, q: 1.0 },
  { type: 'PK', freq: 4000, gain: 0, q: 2.0 },
  { type: 'HSQ', freq: 8000, gain: 0, q: 0.71 },
];

function clampAndRound(val: number, min: number, max: number, decimals: number): number {
  if (!Number.isFinite(val)) return min <= 0 && max >= 0 ? 0 : min;
  const clamped = Math.max(min, Math.min(max, val));
  const factor = 10 ** decimals;
  const rounded = Math.round(clamped * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function normalizeFilterType(raw: unknown): FilterType {
  if (raw === 1 || raw === '1' || raw === 'LSQ' || raw === 'LSC' || raw === 'LOW_SHELF' || raw === 'LS') {
    return 'LSQ';
  }
  if (raw === 2 || raw === '2' || raw === 'HSQ' || raw === 'HSC' || raw === 'HIGH_SHELF' || raw === 'HS') {
    return 'HSQ';
  }
  return 'PK';
}

export function normalizeBand(band: Partial<PeqBand>, fallbackFreq = 1000): PeqBand {
  return {
    type: normalizeFilterType(band.type),
    freq: clampAndRound(Number(band.freq ?? fallbackFreq), PEQ_LIMITS.freq.min, PEQ_LIMITS.freq.max, 0),
    gain: clampAndRound(Number(band.gain ?? 0), PEQ_LIMITS.gain.min, PEQ_LIMITS.gain.max, 1),
    q: clampAndRound(Number(band.q ?? 1.0), PEQ_LIMITS.q.min, PEQ_LIMITS.q.max, 2),
  };
}

export function normalizeMasterGain(gain: number): number {
  return clampAndRound(Number(gain ?? 0), PEQ_LIMITS.masterGain.min, PEQ_LIMITS.masterGain.max, 1);
}

/**
 * Smartly adapts any N-band preset (e.g. 10-band KA15/KA17 preset from FiiO Hand-Picked)
 * into a valid 5-band JA11 snapshot by retaining the 5 bands with greatest |gain| impact.
 */
export function adaptBandsToJa11(rawBands: Partial<PeqBand>[]): {
  bands: [PeqBand, PeqBand, PeqBand, PeqBand, PeqBand];
  compressedFrom?: number;
} {
  const defaultFreqs = [60, 200, 1000, 4000, 8000];
  const cleaned = rawBands.map((b, i) => normalizeBand(b, defaultFreqs[i % 5]));

  if (cleaned.length <= BAND_COUNT) {
    const padded = [...cleaned];
    while (padded.length < BAND_COUNT) {
      const idx = padded.length;
      padded.push({ ...DEFAULT_NEUTRAL_BANDS[idx], gain: 0 });
    }
    return {
      bands: padded.slice(0, 5) as [PeqBand, PeqBand, PeqBand, PeqBand, PeqBand],
    };
  }

  // Pick top 5 most impactful active bands (sorted by |gain| desc), then restore frequency order
  const indexed = cleaned.map((band, idx) => ({ band, idx, impact: Math.abs(band.gain) }));
  indexed.sort((a, b) => b.impact - a.impact || a.idx - b.idx);
  const top5 = indexed.slice(0, BAND_COUNT).sort((a, b) => a.band.freq - b.band.freq);

  return {
    bands: top5.map((item) => item.band) as [PeqBand, PeqBand, PeqBand, PeqBand, PeqBand],
    compressedFrom: cleaned.length,
  };
}

export function snapshotsEqual(a: PeqSnapshot, b: PeqSnapshot): boolean {
  if (normalizeMasterGain(a.masterGain) !== normalizeMasterGain(b.masterGain)) return false;
  for (let i = 0; i < BAND_COUNT; i++) {
    const ba = normalizeBand(a.bands[i]);
    const bb = normalizeBand(b.bands[i]);
    if (ba.type !== bb.type || ba.freq !== bb.freq || ba.gain !== bb.gain || ba.q !== bb.q) {
      return false;
    }
  }
  return true;
}

export function cloneSnapshot(s: PeqSnapshot): PeqSnapshot {
  return {
    masterGain: normalizeMasterGain(s.masterGain),
    bands: s.bands.map((b) => ({ ...normalizeBand(b) })) as [PeqBand, PeqBand, PeqBand, PeqBand, PeqBand],
  };
}

function toUint16(signedValue: number): number {
  return signedValue < 0 ? 0x10000 + signedValue : signedValue;
}

// --- HID Packet Encoders (Report ID 2 payload; report ID omitted for WebHID) ---

export function requestValuePacket(command: number): Uint8Array {
  return Uint8Array.from([0xbb, 0x0b, 0x00, 0x00, command & 0xff, 0x00, 0x00, 0xee]);
}

export function setByteValuePacket(command: number, value: number): Uint8Array {
  return Uint8Array.from([0xaa, 0x0a, 0x00, 0x00, command & 0xff, 0x01, value & 0xff, 0x00, 0xee]);
}

export const requestDeviceVolumePacket = () => requestValuePacket(COMMANDS.DEVICE_VOLUME);
export const requestSampleRatePacket = () => requestValuePacket(COMMANDS.SAMPLE_RATE);
export const requestFirmwareVersionPacket = () => requestValuePacket(COMMANDS.FIRMWARE_VERSION);
export const requestInlineControlPacket = () => requestValuePacket(COMMANDS.INLINE_CONTROL);
export const requestEqPresetPacket = () => requestValuePacket(COMMANDS.EQ_PRESET);
export const requestMasterGainPacket = () => requestValuePacket(COMMANDS.MASTER_GAIN);
export const requestUacModePacket = () => requestValuePacket(COMMANDS.UAC_MODE);

export function requestBandPacket(index: number): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= BAND_COUNT) {
    throw new RangeError(`Band index out of range: ${index}`);
  }
  return Uint8Array.from([0xbb, 0x0b, 0x00, 0x00, COMMANDS.EQ_BAND, 0x01, index, 0xee]);
}

export function setDeviceVolumePacket(volume: number): Uint8Array {
  const v = Math.max(0, Math.min(60, Math.round(volume)));
  return setByteValuePacket(COMMANDS.DEVICE_VOLUME, v);
}

export function setInlineControlPacket(enabled: boolean): Uint8Array {
  return setByteValuePacket(COMMANDS.INLINE_CONTROL, enabled ? 1 : 0);
}

export function setEqPresetPacket(presetCode: number): Uint8Array {
  const p = Math.max(0, Math.min(4, Math.round(presetCode)));
  return setByteValuePacket(COMMANDS.EQ_PRESET, p);
}

export function setUacModePacket(modeCode: number): Uint8Array {
  const m = modeCode ? 1 : 0;
  return setByteValuePacket(COMMANDS.UAC_MODE, m);
}

/**
 * Updates Master Gain in JA11 live DSP RAM ONLY (does NOT commit to NVRAM flash).
 * Verified on live JA11 USB captures: signed 16-bit little-endian fixed point (scale 2560 per dB).
 */
export function encodeMasterGainLivePacket(gainDb: number): Uint8Array {
  const normalized = normalizeMasterGain(gainDb);
  const raw = toUint16(Math.round(normalized * 2560));
  return Uint8Array.from([
    0xaa, 0x0a, 0x00, 0x00, COMMANDS.MASTER_GAIN, 0x02,
    raw & 0xff, (raw >> 8) & 0xff,
    0x00, 0xee,
  ]);
}

/**
 * Updates a single PEQ band in JA11 live DSP RAM ONLY (does NOT commit to NVRAM flash).
 */
export function encodeBandLivePacket(index: number, band: PeqBand): Uint8Array {
  if (!Number.isInteger(index) || index < 0 || index >= BAND_COUNT) {
    throw new RangeError(`Band index must be 0..4, got ${index}`);
  }
  const b = normalizeBand(band);
  const gainRaw = toUint16(Math.round(b.gain * 10));
  const freqRaw = Math.round(b.freq);
  const qRaw = Math.round(b.q * 100);
  const typeCode = FILTER_TYPE_TO_CODE[b.type];

  return Uint8Array.from([
    0xaa, 0x0a, 0x00, 0x00, COMMANDS.EQ_BAND, 0x08, index,
    (gainRaw >> 8) & 0xff, gainRaw & 0xff,
    (freqRaw >> 8) & 0xff, freqRaw & 0xff,
    (qRaw >> 8) & 0xff, qRaw & 0xff,
    typeCode, 0x00, 0xee,
  ]);
}

/**
 * Commits the active User 1 (presetCode = 3) RAM parameters permanently into JA11 Flash.
 * Matches official fiiocontrol.fiio.com RX(3) = zt(170, 10, 25, [3]): EXACTLY 9 BYTES!
 * (Previous 10-byte packet had an extra 0x00 before 0xee, causing JA11 USB reset!)
 */
export function encodeCommitFlashPacket(presetCode = 3): Uint8Array {
  return Uint8Array.from([
    0xaa, 0x0a, 0x00, 0x00, COMMANDS.SAVE_FLASH, 0x01, presetCode & 0xff, 0x00, 0xee,
  ]);
}

/**
 * Resets JA11 User 1 PEQ back to factory default (`OX()` = zt(170, 10, 27)).
 */
export function encodeFactoryResetPeqPacket(): Uint8Array {
  return Uint8Array.from([0xaa, 0x0a, 0x00, 0x00, COMMANDS.EQ_RESET, 0x00, 0x00, 0xee]);
}

export type ParsedJa11Response =
  | { type: 'deviceVolume'; value: number }
  | { type: 'sampleRate'; code: number; value: string }
  | { type: 'firmwareVersion'; value: string }
  | { type: 'inlineControl'; value: boolean }
  | { type: 'eqPreset'; code: number; value: string }
  | { type: 'uacMode'; code: number; value: string }
  | { type: 'masterGain'; value: number }
  | { type: 'band'; index: number; value: PeqBand };

export function parseInputReport(input: Uint8Array | ArrayBuffer): ParsedJa11Response | null {
  const raw = input instanceof Uint8Array ? input : new Uint8Array(input);
  // Strip leading Report ID 0x02 if present (Android raw USB includes it; WebHID removes it)
  const data = raw[0] === REPORT_ID && (raw[1] === 0xbb || raw[1] === 0xaa)
    ? raw.subarray(1)
    : raw;

  if (data.length < 7) return null;
  const command = data[4];

  if (command === COMMANDS.DEVICE_VOLUME) {
    return { type: 'deviceVolume', value: data[6] };
  }
  if (command === COMMANDS.SAMPLE_RATE) {
    const code = data[6];
    return { type: 'sampleRate', code, value: SAMPLE_RATE_NAMES[code] ?? `${code}` };
  }
  if (command === COMMANDS.FIRMWARE_VERSION && data.length >= 8) {
    return { type: 'firmwareVersion', value: `${data[6]}.${data[7]}` };
  }
  if (command === COMMANDS.INLINE_CONTROL) {
    return { type: 'inlineControl', value: data[6] === 1 };
  }
  if (command === COMMANDS.EQ_PRESET) {
    const code = data[6];
    return { type: 'eqPreset', code, value: EQ_PRESET_NAMES[code] ?? `Mode ${code}` };
  }
  if (command === COMMANDS.UAC_MODE) {
    const code = data[6];
    return { type: 'uacMode', code, value: UAC_MODE_NAMES[code] ?? `UAC ${code}` };
  }
  if (command === COMMANDS.MASTER_GAIN && data.length >= 8) {
    const b6 = data[6];
    const b7 = data[7];
    let db: number;
    if (b6 === 0xff) {
      const rawBe = (b6 << 8) | b7;
      db = (rawBe - 0x10000) / 10;
    } else {
      const rawLe = (b7 << 8) | b6;
      const signedLe = rawLe > 0x7fff ? rawLe - 0x10000 : rawLe;
      db = signedLe / 2560;
    }
    return { type: 'masterGain', value: normalizeMasterGain(db) };
  }
  if (command === COMMANDS.EQ_BAND && data.length >= 14) {
    const rawGain = (data[7] << 8) | data[8];
    const signedGain = rawGain > 0x7fff ? rawGain - 0x10000 : rawGain;
    const freq = (data[9] << 8) | data[10];
    const q = ((data[11] << 8) | data[12]) / 100;
    const filterType = CODE_TO_FILTER_TYPE[data[13]] ?? 'PK';
    return {
      type: 'band',
      index: data[6],
      value: normalizeBand({ type: filterType, freq, gain: signedGain / 10, q }),
    };
  }
  return null;
}
