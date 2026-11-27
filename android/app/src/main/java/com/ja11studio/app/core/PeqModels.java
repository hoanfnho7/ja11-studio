package com.ja11studio.app.core;

import java.util.Locale;

public final class PeqModels {
    private PeqModels() {}

    public enum FilterType {
        PK(0, "PK"),
        LSQ(1, "LSQ"),
        HSQ(2, "HSQ");

        public final int code;
        public final String label;

        FilterType(int code, String label) {
            this.code = code;
            this.label = label;
        }

        public static FilterType fromCode(int code) {
            if (code == 1) return LSQ;
            if (code == 2) return HSQ;
            return PK;
        }

        public static FilterType fromString(String raw) {
            if (raw == null) return PK;
            String s = raw.trim().toUpperCase(Locale.ROOT);
            if ("1".equals(s) || "LSQ".equals(s) || "LSC".equals(s) || "LS".equals(s) || "LOW_SHELF".equals(s)) {
                return LSQ;
            }
            if ("2".equals(s) || "HSQ".equals(s) || "HSC".equals(s) || "HS".equals(s) || "HIGH_SHELF".equals(s)) {
                return HSQ;
            }
            return PK;
        }
    }

    public static final class PeqBand {
        public final FilterType type;
        public final int freq;      // 20 .. 20000 Hz
        public final float gain;    // -12.0 .. +12.0 dB
        public final float q;       // 0.10 .. 10.00

        public PeqBand(FilterType type, int freq, float gain, float q) {
            this.type = type != null ? type : FilterType.PK;
            this.freq = Math.max(20, Math.min(20000, freq));
            this.gain = round1(Math.max(-12f, Math.min(12f, gain)));
            this.q = round2(Math.max(0.1f, Math.min(10f, q)));
        }

        public PeqBand withType(FilterType nextType) {
            return new PeqBand(nextType, freq, gain, q);
        }

        public PeqBand withFreq(int nextFreq) {
            return new PeqBand(type, nextFreq, gain, q);
        }

        public PeqBand withGain(float nextGain) {
            return new PeqBand(type, freq, nextGain, q);
        }

        public PeqBand withQ(float nextQ) {
            return new PeqBand(type, freq, gain, nextQ);
        }

        public boolean sameValues(PeqBand other) {
            if (other == null) return false;
            return this.type == other.type
                    && this.freq == other.freq
                    && Math.abs(this.gain - other.gain) < 0.05f
                    && Math.abs(this.q - other.q) < 0.005f;
        }
    }

    public static final class PeqSnapshot {
        public final float masterGain; // -12.0 .. +12.0 dB
        public final PeqBand[] bands;  // length 5

        public PeqSnapshot(float masterGain, PeqBand[] bands) {
            this.masterGain = round1(Math.max(-12f, Math.min(12f, masterGain)));
            this.bands = new PeqBand[5];
            int[] defFreqs = {60, 200, 1000, 4000, 8000};
            for (int i = 0; i < 5; i++) {
                if (bands != null && i < bands.length && bands[i] != null) {
                    this.bands[i] = bands[i];
                } else {
                    FilterType ft = i == 0 ? FilterType.LSQ : (i == 4 ? FilterType.HSQ : FilterType.PK);
                    float defQ = (i == 0 || i == 4) ? 0.71f : 1.0f;
                    this.bands[i] = new PeqBand(ft, defFreqs[i], 0f, defQ);
                }
            }
        }

        public static PeqSnapshot flatNeutral() {
            return new PeqSnapshot(0f, new PeqBand[]{
                    new PeqBand(FilterType.LSQ, 60, 0f, 0.71f),
                    new PeqBand(FilterType.PK, 200, 0f, 1.0f),
                    new PeqBand(FilterType.PK, 1000, 0f, 1.0f),
                    new PeqBand(FilterType.PK, 4000, 0f, 2.0f),
                    new PeqBand(FilterType.HSQ, 8000, 0f, 0.71f)
            });
        }

        public static PeqSnapshot defaultUserCurve() {
            return new PeqSnapshot(-3.0f, new PeqBand[]{
                    new PeqBand(FilterType.LSQ, 75, 2.0f, 0.71f),
                    new PeqBand(FilterType.PK, 210, -1.8f, 1.10f),
                    new PeqBand(FilterType.PK, 900, 1.0f, 1.00f),
                    new PeqBand(FilterType.PK, 4000, -2.0f, 2.20f),
                    new PeqBand(FilterType.HSQ, 8500, -1.5f, 0.71f)
            });
        }

        public PeqSnapshot withMasterGain(float nextMaster) {
            return new PeqSnapshot(nextMaster, bands.clone());
        }

        public PeqSnapshot withBand(int idx, PeqBand band) {
            PeqBand[] copy = bands.clone();
            if (idx >= 0 && idx < 5) {
                copy[idx] = band;
            }
            return new PeqSnapshot(masterGain, copy);
        }

        public boolean sameValues(PeqSnapshot other) {
            if (other == null) return false;
            if (Math.abs(this.masterGain - other.masterGain) >= 0.05f) return false;
            for (int i = 0; i < 5; i++) {
                if (!this.bands[i].sameValues(other.bands[i])) return false;
            }
            return true;
        }
    }

    public static final class PeqProfile {
        public final String id;
        public final String name;
        public final String description;
        public final String category; // "personal", "curated", "handpicked"
        public final String deviceModel;
        public final String author;
        public final PeqSnapshot snapshot;
        public final int compressedFromBands;
        public final long updatedAt;

        public PeqProfile(
                String id,
                String name,
                String description,
                String category,
                String deviceModel,
                String author,
                PeqSnapshot snapshot,
                int compressedFromBands,
                long updatedAt
        ) {
            this.id = id != null && !id.isEmpty() ? id : "prof-" + System.currentTimeMillis();
            this.name = name != null && !name.trim().isEmpty() ? name.trim() : "JA11 Custom";
            this.description = description != null ? description.trim() : "";
            this.category = category != null ? category : "personal";
            this.deviceModel = deviceModel != null && !deviceModel.isEmpty() ? deviceModel : "JadeAudio JA11";
            this.author = author != null && !author.isEmpty() ? author : "User";
            this.snapshot = snapshot != null ? snapshot : PeqSnapshot.flatNeutral();
            this.compressedFromBands = compressedFromBands;
            this.updatedAt = updatedAt > 0 ? updatedAt : System.currentTimeMillis();
        }
    }

    public static final class HardwareState {
        public boolean connected = false;
        public boolean syncing = false;
        public String productName = I18n.tr("Chưa kết nối JA11", "JA11 Disconnected");
        public String firmwareVersion = "--";
        public String sampleRate = "--";
        public String activeHidInfo = "--";
        public int deviceVolume = 36; // 0 .. 60
        public boolean inlineMic = true;
        public int eqPreset = 3;      // 0=Vocal, 1=Classic, 2=Bass, 3=User 1, 4=Off
        public int uacMode = 1;       // 0=UAC 1.0, 1=UAC 2.0
        public String statusMessage = I18n.tr(
                "Sẵn sàng — Cắm JA11 vào cổng USB-C để kết nối.",
                "Ready — Plug your JA11 into USB-C to connect."
        );

        public HardwareState copy() {
            HardwareState c = new HardwareState();
            c.connected = this.connected;
            c.syncing = this.syncing;
            c.productName = this.productName;
            c.firmwareVersion = this.firmwareVersion;
            c.sampleRate = this.sampleRate;
            c.activeHidInfo = this.activeHidInfo;
            c.deviceVolume = this.deviceVolume;
            c.inlineMic = this.inlineMic;
            c.eqPreset = this.eqPreset;
            c.uacMode = this.uacMode;
            c.statusMessage = this.statusMessage;
            return c;
        }
    }

    public static float round1(float v) {
        if (Float.isNaN(v) || Float.isInfinite(v)) return 0f;
        float r = Math.round(v * 10f) / 10f;
        return r == -0f ? 0f : r;
    }

    public static float round2(float v) {
        if (Float.isNaN(v) || Float.isInfinite(v)) return 1f;
        float r = Math.round(v * 100f) / 100f;
        return r == -0f ? 0f : r;
    }
}
