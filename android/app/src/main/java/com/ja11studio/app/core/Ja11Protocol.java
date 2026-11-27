package com.ja11studio.app.core;

import com.ja11studio.app.core.PeqModels.FilterType;
import com.ja11studio.app.core.PeqModels.PeqBand;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Exact binary USB HID protocol encoder & parser for FiiO / JadeAudio JA11 (KT02H20 DSP).
 * Verified byte-for-byte against official fiiocontrol.fiio.com bundle & live hardware captures.
 */
public final class Ja11Protocol {
    public static final int JA11_VID = 0x2972;
    public static final int PID_UAC1 = 0x0101;
    public static final int PID_UAC2 = 0x0102;
    public static final int REPORT_ID = 0x02;
    public static final int BAND_COUNT = 5;

    public static final int CMD_DEVICE_VOLUME = 0x02;
    public static final int CMD_SAMPLE_RATE = 0x09;
    public static final int CMD_FIRMWARE_VERSION = 0x0B;
    public static final int CMD_INLINE_CONTROL = 0x12;
    public static final int CMD_EQ_BAND = 0x15;
    public static final int CMD_EQ_PRESET = 0x16;
    public static final int CMD_MASTER_GAIN = 0x17;
    public static final int CMD_SAVE_FLASH = 0x19;
    public static final int CMD_EQ_RESET = 0x1B;
    public static final int CMD_UAC_MODE = 0x20;

    public static final String[] SAMPLE_RATE_NAMES = {
            "32 kHz", "44.1 kHz", "48 kHz", "88.2 kHz", "96 kHz",
            "176.4 kHz", "192 kHz", "352.8 kHz", "384 kHz",
            "705.6 kHz", "768 kHz", "DSD64", "DSD128", "DSD256", "DSD512"
    };

    public static final String[] EQ_PRESET_NAMES = {
            "Vocal", "Classic", "Bass Boost", "User 1", "Tắt EQ"
    };

    private Ja11Protocol() {}

    private static int toUint16(int signedVal) {
        return signedVal < 0 ? (0x10000 + signedVal) & 0xFFFF : signedVal & 0xFFFF;
    }

    public static byte[] requestValuePacket(int command) {
        return new byte[]{
                (byte) 0xBB, 0x0B, 0x00, 0x00,
                (byte) (command & 0xFF), 0x00, 0x00, (byte) 0xEE
        };
    }

    public static byte[] setByteValuePacket(int command, int value) {
        return new byte[]{
                (byte) 0xAA, 0x0A, 0x00, 0x00,
                (byte) (command & 0xFF), 0x01, (byte) (value & 0xFF), 0x00, (byte) 0xEE
        };
    }

    public static byte[] requestDeviceVolumePacket() {
        return requestValuePacket(CMD_DEVICE_VOLUME);
    }

    public static byte[] requestSampleRatePacket() {
        return requestValuePacket(CMD_SAMPLE_RATE);
    }

    public static byte[] requestFirmwareVersionPacket() {
        return requestValuePacket(CMD_FIRMWARE_VERSION);
    }

    public static byte[] requestInlineControlPacket() {
        return requestValuePacket(CMD_INLINE_CONTROL);
    }

    public static byte[] requestEqPresetPacket() {
        return requestValuePacket(CMD_EQ_PRESET);
    }

    public static byte[] requestMasterGainPacket() {
        return requestValuePacket(CMD_MASTER_GAIN);
    }

    public static byte[] requestUacModePacket() {
        return requestValuePacket(CMD_UAC_MODE);
    }

    public static byte[] requestBandPacket(int index) {
        int idx = Math.max(0, Math.min(4, index));
        return new byte[]{
                (byte) 0xBB, 0x0B, 0x00, 0x00,
                (byte) CMD_EQ_BAND, 0x01, (byte) idx, (byte) 0xEE
        };
    }

    public static byte[] setDeviceVolumePacket(int volume) {
        int v = Math.max(0, Math.min(60, volume));
        return setByteValuePacket(CMD_DEVICE_VOLUME, v);
    }

    public static byte[] setInlineControlPacket(boolean enabled) {
        return setByteValuePacket(CMD_INLINE_CONTROL, enabled ? 1 : 0);
    }

    public static byte[] setEqPresetPacket(int presetCode) {
        int p = Math.max(0, Math.min(4, presetCode));
        return setByteValuePacket(CMD_EQ_PRESET, p);
    }

    public static byte[] setUacModePacket(int modeCode) {
        return setByteValuePacket(CMD_UAC_MODE, modeCode != 0 ? 1 : 0);
    }

    /**
     * Master Gain in live DSP RAM: signed 16-bit little-endian fixed point (scale 2560 per dB).
     */
    public static byte[] encodeMasterGainLivePacket(float gainDb) {
        float clamped = PeqModels.round1(Math.max(-12f, Math.min(12f, gainDb)));
        int raw = toUint16(Math.round(clamped * 2560f));
        return new byte[]{
                (byte) 0xAA, 0x0A, 0x00, 0x00,
                (byte) CMD_MASTER_GAIN, 0x02,
                (byte) (raw & 0xFF), (byte) ((raw >> 8) & 0xFF),
                0x00, (byte) 0xEE
        };
    }

    /**
     * Updates a single PEQ band in JA11 live DSP RAM ONLY (never writes Flash).
     */
    public static byte[] encodeBandLivePacket(int index, PeqBand band) {
        int idx = Math.max(0, Math.min(4, index));
        int gainRaw = toUint16(Math.round(band.gain * 10f));
        int freqRaw = Math.max(20, Math.min(20000, band.freq));
        int qRaw = Math.round(band.q * 100f);
        int typeCode = band.type.code;

        return new byte[]{
                (byte) 0xAA, 0x0A, 0x00, 0x00,
                (byte) CMD_EQ_BAND, 0x08, (byte) idx,
                (byte) ((gainRaw >> 8) & 0xFF), (byte) (gainRaw & 0xFF),
                (byte) ((freqRaw >> 8) & 0xFF), (byte) (freqRaw & 0xFF),
                (byte) ((qRaw >> 8) & 0xFF), (byte) (qRaw & 0xFF),
                (byte) (typeCode & 0xFF), 0x00, (byte) 0xEE
        };
    }

    /**
     * Exact 9-byte Save Flash packet matching FiiO RX(presetCode) = zt(170, 10, 25, [presetCode]).
     */
    public static byte[] encodeCommitFlashPacket(int presetCode) {
        return new byte[]{
                (byte) 0xAA, 0x0A, 0x00, 0x00,
                (byte) CMD_SAVE_FLASH, 0x01, (byte) (presetCode & 0xFF), 0x00, (byte) 0xEE
        };
    }

    public static byte[] encodeFactoryResetPeqPacket() {
        return new byte[]{
                (byte) 0xAA, 0x0A, 0x00, 0x00,
                (byte) CMD_EQ_RESET, 0x00, 0x00, (byte) 0xEE
        };
    }

    public static final class ParsedReport {
        public final int command;
        public int intVal;
        public float floatVal;
        public boolean boolVal;
        public String strVal;
        public PeqBand bandVal;

        public ParsedReport(int command) {
            this.command = command;
        }
    }

    public static ParsedReport parseInputReport(byte[] raw, int length) {
        if (raw == null || length < 7) return null;
        int offset = 0;
        int first = raw[0] & 0xFF;
        int second = raw[1] & 0xFF;
        // Strip leading Report ID 0x02 if present on Android raw USB pipe
        if (first == REPORT_ID && (second == 0xBB || second == 0xAA)) {
            offset = 1;
        }
        int avail = length - offset;
        if (avail < 7) return null;
        int hdr = raw[offset] & 0xFF;
        if (hdr != 0xBB && hdr != 0xAA) return null;

        int cmd = raw[offset + 4] & 0xFF;
        ParsedReport out = new ParsedReport(cmd);

        switch (cmd) {
            case CMD_DEVICE_VOLUME:
                out.intVal = raw[offset + 6] & 0xFF;
                return out;

            case CMD_SAMPLE_RATE: {
                int code = raw[offset + 6] & 0xFF;
                out.intVal = code;
                out.strVal = (code >= 0 && code < SAMPLE_RATE_NAMES.length)
                        ? SAMPLE_RATE_NAMES[code]
                        : (code + " Hz");
                return out;
            }

            case CMD_FIRMWARE_VERSION:
                if (avail >= 8) {
                    int major = raw[offset + 6] & 0xFF;
                    int minor = raw[offset + 7] & 0xFF;
                    out.strVal = "v" + major + "." + minor;
                    return out;
                }
                return null;

            case CMD_INLINE_CONTROL:
                out.boolVal = (raw[offset + 6] & 0xFF) == 1;
                return out;

            case CMD_EQ_PRESET: {
                int code = raw[offset + 6] & 0xFF;
                out.intVal = code;
                out.strVal = (code >= 0 && code < EQ_PRESET_NAMES.length)
                        ? EQ_PRESET_NAMES[code]
                        : ("Mode " + code);
                return out;
            }

            case CMD_UAC_MODE: {
                int code = raw[offset + 6] & 0xFF;
                out.intVal = code;
                out.strVal = code == 0 ? "UAC 1.0" : "UAC 2.0";
                return out;
            }

            case CMD_MASTER_GAIN:
                if (avail >= 8) {
                    int b6 = raw[offset + 6] & 0xFF;
                    int b7 = raw[offset + 7] & 0xFF;
                    float db;
                    if (b6 == 0xFF) {
                        int rawBe = (b6 << 8) | b7;
                        db = (rawBe - 0x10000) / 10f;
                    } else {
                        int rawLe = (b7 << 8) | b6;
                        int signedLe = rawLe > 0x7FFF ? rawLe - 0x10000 : rawLe;
                        db = signedLe / 2560f;
                    }
                    out.floatVal = PeqModels.round1(Math.max(-12f, Math.min(12f, db)));
                    return out;
                }
                return null;

            case CMD_EQ_BAND:
                if (avail >= 14) {
                    int bandIdx = raw[offset + 6] & 0xFF;
                    int rawGain = ((raw[offset + 7] & 0xFF) << 8) | (raw[offset + 8] & 0xFF);
                    int signedGain = rawGain > 0x7FFF ? rawGain - 0x10000 : rawGain;
                    int freq = ((raw[offset + 9] & 0xFF) << 8) | (raw[offset + 10] & 0xFF);
                    float q = (((raw[offset + 11] & 0xFF) << 8) | (raw[offset + 12] & 0xFF)) / 100f;
                    FilterType ft = FilterType.fromCode(raw[offset + 13] & 0xFF);
                    out.intVal = bandIdx;
                    out.bandVal = new PeqBand(ft, freq, signedGain / 10f, q);
                    return out;
                }
                return null;

            default:
                return out;
        }
    }

    public static final class AdaptedBands {
        public final PeqBand[] bands;
        public final int compressedFrom;

        public AdaptedBands(PeqBand[] bands, int compressedFrom) {
            this.bands = bands;
            this.compressedFrom = compressedFrom;
        }
    }

    public static AdaptedBands adaptBandsToJa11(List<PeqBand> rawBands) {
        int[] defFreqs = {60, 200, 1000, 4000, 8000};
        if (rawBands == null || rawBands.isEmpty()) {
            return new AdaptedBands(PeqModels.PeqSnapshot.flatNeutral().bands, 0);
        }
        if (rawBands.size() <= BAND_COUNT) {
            PeqBand[] padded = new PeqBand[BAND_COUNT];
            for (int i = 0; i < BAND_COUNT; i++) {
                if (i < rawBands.size() && rawBands.get(i) != null) {
                    padded[i] = rawBands.get(i);
                } else {
                    FilterType ft = i == 0 ? FilterType.LSQ : (i == 4 ? FilterType.HSQ : FilterType.PK);
                    padded[i] = new PeqBand(ft, defFreqs[i], 0f, (i == 0 || i == 4) ? 0.71f : 1.0f);
                }
            }
            return new AdaptedBands(padded, 0);
        }

        List<PeqBand> copy = new ArrayList<>(rawBands);
        Collections.sort(copy, new Comparator<PeqBand>() {
            @Override
            public int compare(PeqBand a, PeqBand b) {
                return Float.compare(Math.abs(b.gain), Math.abs(a.gain));
            }
        });
        List<PeqBand> top5 = new ArrayList<>(copy.subList(0, BAND_COUNT));
        Collections.sort(top5, new Comparator<PeqBand>() {
            @Override
            public int compare(PeqBand a, PeqBand b) {
                return Integer.compare(a.freq, b.freq);
            }
        });
        return new AdaptedBands(top5.toArray(new PeqBand[BAND_COUNT]), rawBands.size());
    }

    public static String toHex(byte[] bytes, int len) {
        if (bytes == null || len <= 0) return "";
        int n = Math.min(bytes.length, len);
        StringBuilder sb = new StringBuilder(n * 3);
        for (int i = 0; i < n; i++) {
            if (i > 0) sb.append(' ');
            sb.append(String.format("%02X", bytes[i] & 0xFF));
        }
        return sb.toString();
    }
}
