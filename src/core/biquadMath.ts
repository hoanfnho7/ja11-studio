import { PeqBand, PeqSnapshot, normalizeMasterGain } from './ja11Protocol';

export const DSP_SAMPLE_RATE = 48000;

interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a0: number;
  a1: number;
  a2: number;
}

/**
 * RBJ Audio EQ Cookbook coefficients matching FiiO Control's DSP curve engine (fs = 48 kHz).
 */
export function computeBiquadCoeffs(band: PeqBand, fs = DSP_SAMPLE_RATE): BiquadCoeffs {
  if (Math.abs(band.gain) < 1e-4) {
    return { b0: 1, b1: 0, b2: 0, a0: 1, a1: 0, a2: 0 };
  }

  const f0 = Math.max(10, Math.min(fs * 0.495, band.freq));
  const Q = Math.max(0.1, Math.min(10, band.q));
  const A = Math.pow(10, band.gain / 40);
  const w0 = (2 * Math.PI * f0) / fs;
  const cosw0 = Math.cos(w0);
  const sinw0 = Math.sin(w0);
  const alpha = sinw0 / (2 * Q);

  if (band.type === 'PK') {
    return {
      b0: 1 + alpha * A,
      b1: -2 * cosw0,
      b2: 1 - alpha * A,
      a0: 1 + alpha / A,
      a1: -2 * cosw0,
      a2: 1 - alpha / A,
    };
  }

  const twoSqrtAAlpha = 2 * Math.sqrt(A) * alpha;

  if (band.type === 'LSQ') {
    return {
      b0: A * ((A + 1) - (A - 1) * cosw0 + twoSqrtAAlpha),
      b1: 2 * A * ((A - 1) - (A + 1) * cosw0),
      b2: A * ((A + 1) - (A - 1) * cosw0 - twoSqrtAAlpha),
      a0: (A + 1) + (A - 1) * cosw0 + twoSqrtAAlpha,
      a1: -2 * ((A - 1) + (A + 1) * cosw0),
      a2: (A + 1) + (A - 1) * cosw0 - twoSqrtAAlpha,
    };
  }

  // HSQ (High-Shelf)
  return {
    b0: A * ((A + 1) + (A - 1) * cosw0 + twoSqrtAAlpha),
    b1: -2 * A * ((A - 1) + (A + 1) * cosw0),
    b2: A * ((A + 1) + (A - 1) * cosw0 - twoSqrtAAlpha),
    a0: (A + 1) - (A - 1) * cosw0 + twoSqrtAAlpha,
    a1: 2 * ((A - 1) - (A + 1) * cosw0),
    a2: (A + 1) - (A - 1) * cosw0 - twoSqrtAAlpha,
  };
}

export function evaluateBiquadDb(c: BiquadCoeffs, freq: number, fs = DSP_SAMPLE_RATE): number {
  const w = (2 * Math.PI * freq) / fs;
  const cosw = Math.cos(w);
  const sinw = Math.sin(w);
  const cos2w = Math.cos(2 * w);
  const sin2w = Math.sin(2 * w);

  const numRe = c.b0 + c.b1 * cosw + c.b2 * cos2w;
  const numIm = -(c.b1 * sinw + c.b2 * sin2w);
  const denRe = c.a0 + c.a1 * cosw + c.a2 * cos2w;
  const denIm = -(c.a1 * sinw + c.a2 * sin2w);

  const numMagSq = numRe * numRe + numIm * numIm;
  const denMagSq = denRe * denRe + denIm * denIm;
  if (denMagSq <= 0 || numMagSq <= 0) return 0;

  return 10 * Math.log10(numMagSq / denMagSq);
}

export function generateLogFrequencies(count = 160, minHz = 20, maxHz = 20000): number[] {
  const logMin = Math.log10(minHz);
  const logMax = Math.log10(maxHz);
  const freqs: number[] = [];
  for (let i = 0; i < count; i++) {
    freqs.push(Math.pow(10, logMin + ((logMax - logMin) * i) / (count - 1)));
  }
  return freqs;
}

export function computePeakResponseDb(snapshot: PeqSnapshot): {
  maxFilterBoostDb: number;
  maxNetOutputDb: number;
  recommendedMasterGain: number;
} {
  const freqs = generateLogFrequencies(180, 20, 20000);
  const coeffs = snapshot.bands.map((b) => computeBiquadCoeffs(b));
  let maxFilterBoost = 0;
  for (const f of freqs) {
    let sum = 0;
    for (const c of coeffs) sum += evaluateBiquadDb(c, f);
    if (sum > maxFilterBoost) maxFilterBoost = sum;
  }
  const maxNetOutputDb = maxFilterBoost + snapshot.masterGain;
  const recommendedMasterGain = maxFilterBoost > 0
    ? normalizeMasterGain(-Math.ceil(maxFilterBoost * 10 + 2) / 10)
    : 0;

  return {
    maxFilterBoostDb: Math.round(maxFilterBoost * 10) / 10,
    maxNetOutputDb: Math.round(maxNetOutputDb * 10) / 10,
    recommendedMasterGain,
  };
}
