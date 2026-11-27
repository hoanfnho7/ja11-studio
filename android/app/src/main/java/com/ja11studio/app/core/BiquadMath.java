package com.ja11studio.app.core;

import com.ja11studio.app.core.PeqModels.FilterType;
import com.ja11studio.app.core.PeqModels.PeqBand;
import com.ja11studio.app.core.PeqModels.PeqSnapshot;

/**
 * Zero-GC RBJ Audio EQ Cookbook Biquad evaluator at FS = 48000 Hz for 120fps Skia Canvas rendering.
 */
public final class BiquadMath {
    public static final double DEFAULT_FS = 48000.0;

    private BiquadMath() {}

    /**
     * Writes normalized biquad coefficients [b0, b1, b2, a1, a2] into outCoeffs[offset .. offset+4].
     */
    public static void computeCoeffsInto(PeqBand band, double fs, double[] outCoeffs, int offset) {
        double freq = Math.max(20.0, Math.min(fs * 0.48, band.freq));
        double q = Math.max(0.1, Math.min(10.0, band.q));
        double gainDb = Math.max(-12.0, Math.min(12.0, band.gain));

        if (Math.abs(gainDb) < 1e-4) {
            outCoeffs[offset] = 1.0;
            outCoeffs[offset + 1] = 0.0;
            outCoeffs[offset + 2] = 0.0;
            outCoeffs[offset + 3] = 0.0;
            outCoeffs[offset + 4] = 0.0;
            return;
        }

        double A = Math.pow(10.0, gainDb / 40.0);
        double w0 = (2.0 * Math.PI * freq) / fs;
        double cosW0 = Math.cos(w0);
        double sinW0 = Math.sin(w0);
        double alpha = sinW0 / (2.0 * q);

        double b0, b1, b2, a0, a1, a2;
        if (band.type == FilterType.LSQ) {
            double twoSqrtAAlpha = 2.0 * Math.sqrt(A) * alpha;
            b0 = A * ((A + 1.0) - (A - 1.0) * cosW0 + twoSqrtAAlpha);
            b1 = 2.0 * A * ((A - 1.0) - (A + 1.0) * cosW0);
            b2 = A * ((A + 1.0) - (A - 1.0) * cosW0 - twoSqrtAAlpha);
            a0 = (A + 1.0) + (A - 1.0) * cosW0 + twoSqrtAAlpha;
            a1 = -2.0 * ((A - 1.0) + (A + 1.0) * cosW0);
            a2 = (A + 1.0) + (A - 1.0) * cosW0 - twoSqrtAAlpha;
        } else if (band.type == FilterType.HSQ) {
            double twoSqrtAAlpha = 2.0 * Math.sqrt(A) * alpha;
            b0 = A * ((A + 1.0) + (A - 1.0) * cosW0 + twoSqrtAAlpha);
            b1 = -2.0 * A * ((A - 1.0) + (A + 1.0) * cosW0);
            b2 = A * ((A + 1.0) + (A - 1.0) * cosW0 - twoSqrtAAlpha);
            a0 = (A + 1.0) - (A - 1.0) * cosW0 + twoSqrtAAlpha;
            a1 = 2.0 * ((A - 1.0) - (A + 1.0) * cosW0);
            a2 = (A + 1.0) - (A - 1.0) * cosW0 - twoSqrtAAlpha;
        } else {
            b0 = 1.0 + alpha * A;
            b1 = -2.0 * cosW0;
            b2 = 1.0 - alpha * A;
            a0 = 1.0 + alpha / A;
            a1 = -2.0 * cosW0;
            a2 = 1.0 - alpha / A;
        }

        outCoeffs[offset] = b0 / a0;
        outCoeffs[offset + 1] = b1 / a0;
        outCoeffs[offset + 2] = b2 / a0;
        outCoeffs[offset + 3] = a1 / a0;
        outCoeffs[offset + 4] = a2 / a0;
    }

    public static double evaluateSingleBiquadDb(double[] coeffs, int offset, double freqHz, double fs) {
        double b0 = coeffs[offset];
        double b1 = coeffs[offset + 1];
        double b2 = coeffs[offset + 2];
        double a1 = coeffs[offset + 3];
        double a2 = coeffs[offset + 4];

        double w = (2.0 * Math.PI * freqHz) / fs;
        double cosW = Math.cos(w);
        double cos2W = Math.cos(2.0 * w);
        double sinW = Math.sin(w);
        double sin2W = Math.sin(2.0 * w);

        double numRe = b0 + b1 * cosW + b2 * cos2W;
        double numIm = -(b1 * sinW + b2 * sin2W);
        double denRe = 1.0 + a1 * cosW + a2 * cos2W;
        double denIm = -(a1 * sinW + a2 * sin2W);

        double magSq = (numRe * numRe + numIm * numIm) / Math.max(1e-18, denRe * denRe + denIm * denIm);
        return 10.0 * Math.log10(Math.max(1e-18, magSq));
    }

    public static double evaluateCompositeDb(double[] fiveBandCoeffs, double freqHz, double fs) {
        double sum = 0.0;
        for (int i = 0; i < 5; i++) {
            sum += evaluateSingleBiquadDb(fiveBandCoeffs, i * 5, freqHz, fs);
        }
        return sum;
    }

    public static final class HeadroomResult {
        public final float maxFilterBoostDb;
        public final float maxNetOutputDb;
        public final float recommendedMasterGain;

        public HeadroomResult(float maxFilterBoostDb, float maxNetOutputDb, float recommendedMasterGain) {
            this.maxFilterBoostDb = maxFilterBoostDb;
            this.maxNetOutputDb = maxNetOutputDb;
            this.recommendedMasterGain = recommendedMasterGain;
        }
    }

    public static HeadroomResult computeHeadroom(PeqSnapshot snapshot) {
        double[] coeffs = new double[25];
        for (int i = 0; i < 5; i++) {
            computeCoeffsInto(snapshot.bands[i], DEFAULT_FS, coeffs, i * 5);
        }
        double logMin = Math.log10(20.0);
        double logMax = Math.log10(20000.0);
        double maxBoost = -999.0;
        int steps = 160;
        for (int i = 0; i <= steps; i++) {
            double f = Math.pow(10.0, logMin + (i / (double) steps) * (logMax - logMin));
            double db = evaluateCompositeDb(coeffs, f, DEFAULT_FS);
            if (db > maxBoost) maxBoost = db;
        }
        float boost = PeqModels.round1((float) maxBoost);
        float net = PeqModels.round1(boost + snapshot.masterGain);
        float rec = boost > 0f ? Math.max(-12f, PeqModels.round1(-(boost + 0.5f))) : 0f;
        return new HeadroomResult(boost, net, rec);
    }
}
