import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  FastForward,
  Headphones,
  Info,
  Lightbulb,
  Pause,
  Sliders,
  Square,
  Star,
  Volume2,
  X,
} from 'lucide-react';

interface Props {
  onActiveFreqChange: (hz: number | null) => void;
  onAssignPeakToBand4: (hz: number) => void;
}

function getZoneLabel(f: number): string {
  if (f < 100) return 'ÂM SIÊU TRẦM (SUB-BASS)';
  if (f < 300) return 'DẢI TRẦM ẤM (MID-BASS)';
  if (f < 1200) return 'DẢI TRUNG ÂM (MID VOCAL)';
  if (f < 3000) return 'DẢI TRUNG CAO (HIGH MID)';
  if (f <= 5500) return 'VÙNG CỘNG HƯỞNG TAI (PINNA PEAK)';
  if (f < 9000) return 'DẢI CHÓI GẮT (TREBLE SIBILANCE)';
  return 'DẢI KHÔNG GIAN & KHÍ (AIR / ULTRA-HIGH)';
}

export const TabEarSweep: React.FC<Props> = ({ onActiveFreqChange, onAssignPeakToBand4 }) => {
  const [freq, setFreq] = useState(4380);
  const [playing, setPlaying] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [volume, setVolume] = useState(15);
  const [pan, setPan] = useState<-1 | 0 | 1>(0);
  const [showTipModal, setShowTipModal] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const panRef = useRef<StereoPannerNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const freqRef = useRef(freq);
  freqRef.current = freq;

  const volToSafeGain = (v: number) => {
    const norm = v / 100;
    return Math.max(0.0005, norm * norm * 0.25);
  };

  const ensureAudio = () => {
    if (!audioCtxRef.current) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freqRef.current;

      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;

      const gain = ctx.createGain();
      gain.gain.value = 0.0001;

      osc.connect(panner);
      panner.connect(gain);
      gain.connect(ctx.destination);
      osc.start();

      audioCtxRef.current = ctx;
      oscRef.current = osc;
      panRef.current = panner;
      gainRef.current = gain;
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
  };

  const stopSweepLoop = () => {
    setSweeping(false);
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const togglePlay = (nextState?: boolean) => {
    const target = nextState ?? !playing;
    if (target) {
      ensureAudio();
      const ctx = audioCtxRef.current!;
      oscRef.current!.frequency.setTargetAtTime(freqRef.current, ctx.currentTime, 0.015);
      gainRef.current!.gain.cancelScheduledValues(ctx.currentTime);
      gainRef.current!.gain.setTargetAtTime(volToSafeGain(volume), ctx.currentTime, 0.03);
      setPlaying(true);
      onActiveFreqChange(freqRef.current);
    } else {
      stopSweepLoop();
      if (audioCtxRef.current && gainRef.current) {
        const ctx = audioCtxRef.current;
        gainRef.current.gain.cancelScheduledValues(ctx.currentTime);
        gainRef.current.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.02);
      }
      setPlaying(false);
      onActiveFreqChange(null);
    }
  };

  const changeFreq = (nextHz: number) => {
    const clamped = Math.max(20, Math.min(20000, Math.round(nextHz)));
    setFreq(clamped);
    if (playing) {
      onActiveFreqChange(clamped);
      if (audioCtxRef.current && oscRef.current) {
        oscRef.current.frequency.setTargetAtTime(clamped, audioCtxRef.current.currentTime, 0.012);
      }
    }
  };

  const toggleAutoSweep = () => {
    if (sweeping) {
      stopSweepLoop();
      return;
    }
    let f = freq < 1800 || freq > 9800 ? 2000 : freq;
    changeFreq(f);
    if (!playing) togglePlay(true);
    setSweeping(true);

    let lastTs = performance.now();
    const step = (ts: number) => {
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;
      const octavesPerSec = Math.log2(10000 / 2000) / 10;
      f = f * Math.pow(2, octavesPerSec * dt);
      if (f >= 10000) {
        changeFreq(10000);
        stopSweepLoop();
        return;
      }
      changeFreq(f);
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    if (audioCtxRef.current && gainRef.current && playing) {
      gainRef.current.gain.setTargetAtTime(
        volToSafeGain(volume),
        audioCtxRef.current.currentTime,
        0.02,
      );
    }
  }, [volume, playing]);

  useEffect(() => {
    if (audioCtxRef.current && panRef.current) {
      panRef.current.pan.setTargetAtTime(pan, audioCtxRef.current.currentTime, 0.02);
    }
  }, [pan]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (audioCtxRef.current) void audioCtxRef.current.close();
      onActiveFreqChange(null);
    };
  }, []);

  const sweepPct =
    freq <= 2000 ? 0 : freq >= 10000 ? 100 : Math.round(((freq - 2000) / (10000 - 2000)) * 100);

  const presets = [
    { hz: 55, label: '55 Hz', sub: 'Sub-bass' },
    { hz: 185, label: '185 Hz', sub: 'Mid-bass' },
    { hz: 680, label: '680 Hz', sub: 'Low-mid' },
    { hz: 3200, label: '3.2 kHz', sub: 'Pinna Gain' },
    { hz: 4380, label: '4.38 kHz', sub: 'Đỉnh tai bạn', featured: true },
    { hz: 7500, label: '7.5 kHz', sub: 'Sibilance' },
  ];

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Advisory Header */}
      <div className="bg-surface-container-low px-3 py-2 rounded-xl border border-surface-variant/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Headphones className="w-4 h-4 text-secondary-fixed-dim shrink-0" />
          <span className="font-mono text-[11px] font-medium text-on-surface truncate">
            Đo đỉnh cộng hưởng ống tai (Ear Sweep)
          </span>
        </div>
        <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-surface-container-high text-primary uppercase shrink-0">
          DAC 24-BIT
        </span>
      </div>

      {/* Hero Sine Generator Card */}
      <section className="bg-surface-container-low p-3.5 rounded-xl border border-surface-variant/40 flex flex-col gap-3 relative overflow-hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                playing
                  ? 'bg-secondary-container shadow-[0_0_8px_rgba(0,238,252,0.8)] animate-pulse'
                  : 'bg-outline'
              }`}
            />
            <span className="font-mono text-[11px] uppercase tracking-wider text-secondary-fixed-dim">
              Bộ phát sóng đơn sắc (Sine Gen)
            </span>
          </div>
          <span className="font-mono text-[9px] px-2 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
            THD+N &lt; 0.0006%
          </span>
        </div>

        <div className="bg-surface-container-lowest rounded-lg p-3 flex flex-col gap-2.5 border border-surface-variant/30">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex flex-col min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="font-sans text-[28px] leading-none font-semibold text-primary tracking-tight">
                  {freq.toLocaleString('vi-VN')}
                </span>
                <span className="font-mono text-[11px] text-on-surface-variant uppercase">Hz</span>
              </div>
              <span className="font-mono text-[10px] text-secondary-fixed-dim mt-1 truncate">
                {getZoneLabel(freq)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onAssignPeakToBand4(freq)}
              className="px-2.5 py-1.5 rounded-lg bg-secondary-container/15 hover:bg-secondary-container/25 border border-secondary-container/40 text-secondary-fixed font-mono text-[10px] font-semibold flex items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition"
              title="Đưa tần số đang dò này sang Band 4 (Cắt Chói Tai) để gọt đỉnh ngay"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>Gán vào B4</span>
            </button>
          </div>

          {/* Sine Visualizer Box */}
          <div className="h-14 w-full relative flex items-center justify-center overflow-hidden rounded bg-surface-container-low/50">
            <svg
              className="w-full h-full text-secondary-container opacity-85"
              preserveAspectRatio="none"
              viewBox="0 0 500 70"
            >
              <defs>
                <linearGradient id="sineWaveGlow" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="currentColor" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              <path
                d="M0,35 C 75,6 125,64 200,35 C 275,6 325,64 400,35 C 450,15 475,55 500,35 L 500,70 L 0,70 Z"
                fill="url(#sineWaveGlow)"
              />
              <path
                d="M0,35 C 75,6 125,64 200,35 C 275,6 325,64 400,35 C 450,15 475,55 500,35"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2.2"
              />
            </svg>
            <div className="absolute inset-x-0 bottom-1 flex justify-between items-center px-2.5 pointer-events-none font-mono text-[9px]">
              <span className="text-outline">20 Hz</span>
              <span className="text-secondary-fixed-dim font-semibold">
                TÂM DÒ {(freq / 1000).toFixed(2)} kHz
              </span>
              <span className="text-outline">20 kHz</span>
            </div>
          </div>

          {/* 2k -> 10k Sweep Progress */}
          <div className="flex flex-col gap-1">
            <div className="flex justify-between items-center font-mono text-[10px] text-on-surface-variant">
              <span>Tiến trình dải nhạy (2k → 10k)</span>
              <span className="text-primary font-semibold">{sweepPct}%</span>
            </div>
            <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-container rounded-full transition-all duration-100"
                style={{ width: `${sweepPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Two Hero Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => togglePlay()}
            className={`min-h-[46px] px-3 py-2 rounded-xl font-mono text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer ${
              playing
                ? 'bg-error-container text-on-error-container'
                : 'bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container shadow-sm'
            }`}
          >
            {playing ? <Square className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            <span>{playing ? 'Dừng phát' : 'Phát sóng Sin'}</span>
          </button>

          <button
            type="button"
            onClick={toggleAutoSweep}
            className={`min-h-[46px] px-3 py-2 rounded-xl font-mono text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer ${
              sweeping
                ? 'bg-error-container text-on-error-container'
                : 'bg-surface-container-high hover:bg-surface-bright text-secondary-fixed border border-surface-variant'
            }`}
          >
            {sweeping ? <Pause className="w-4 h-4" /> : <FastForward className="w-4 h-4" />}
            <span>{sweeping ? 'Dừng tại đây' : 'Tự quét 2k→10k'}</span>
          </button>
        </div>
      </section>

      {/* Signal Parameters & Channel Routing */}
      <section className="bg-surface-container-low p-3.5 rounded-xl border border-surface-variant/40 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary" />
            <span className="font-sans text-[15px] font-semibold text-on-surface">
              Thông số sóng thử
            </span>
          </div>
          <span className="font-mono text-[9px] text-outline uppercase">REG 0x12 // JA11</span>
        </div>

        {/* Exact Frequency + Step Buttons */}
        <div className="bg-surface-container rounded-lg p-3 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium text-on-surface">
              Tần số chính xác
            </span>
            <div className="flex items-center gap-1 bg-surface-container-lowest px-2.5 py-1 rounded border border-surface-variant/60">
              <input
                type="number"
                min={20}
                max={20000}
                value={freq}
                onChange={(e) => changeFreq(Number(e.target.value))}
                className="w-16 bg-transparent text-right font-mono text-[11px] font-bold text-primary focus:outline-none"
              />
              <span className="font-mono text-[10px] text-on-surface-variant">Hz</span>
            </div>
          </div>

          <input
            type="range"
            min={20}
            max={15000}
            step={10}
            value={Math.min(15000, freq)}
            onChange={(e) => {
              if (sweeping) stopSweepLoop();
              changeFreq(Number(e.target.value));
            }}
            className="w-full h-1.5 cursor-pointer"
          />

          <div className="grid grid-cols-4 gap-1.5 pt-0.5">
            {[-100, -10, 10, 100].map((delta) => (
              <button
                key={delta}
                type="button"
                onClick={() => {
                  if (sweeping) stopSweepLoop();
                  changeFreq(freq + delta);
                }}
                className="min-h-[40px] py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-container-highest active:scale-95 text-on-surface font-mono text-[11px] font-medium transition cursor-pointer"
              >
                {delta > 0 ? `+${delta}Hz` : `${delta}Hz`}
              </button>
            ))}
          </div>
        </div>

        {/* L / L+R / R Channel Routing */}
        <div className="bg-surface-container rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium text-on-surface">
              Kênh phát kiểm tra (Routing)
            </span>
            <span className="font-mono text-[9px] text-on-surface-variant uppercase">
              DÒ LỆCH TAI L/R
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-surface-container-lowest p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setPan(-1)}
              className={`min-h-[40px] rounded-lg font-mono text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                pan === -1
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Trái (L)</span>
            </button>

            <button
              type="button"
              onClick={() => setPan(0)}
              className={`min-h-[40px] rounded-lg font-mono text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                pan === 0
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>Cả hai (L+R)</span>
            </button>

            <button
              type="button"
              onClick={() => setPan(1)}
              className={`min-h-[40px] rounded-lg font-mono text-[11px] font-semibold flex items-center justify-center gap-1 transition cursor-pointer ${
                pan === 1
                  ? 'bg-surface-container-high text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span>Phải (R)</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Safe Volume Slider */}
        <div className="bg-surface-container rounded-lg p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium text-on-surface">
              Âm lượng tín hiệu thử
            </span>
            <span className="font-mono text-[11px] font-bold text-primary">{volume}%</span>
          </div>

          <input
            type="range"
            min={1}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full h-1.5 cursor-pointer"
          />

          <div className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-surface-container-lowest/80 border border-surface-container-high font-mono text-[10px] text-on-surface-variant">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="w-3.5 h-3.5 text-primary-container shrink-0" />
              <span className="truncate">Khuyến nghị an toàn: &lt; 20% vol (3k–8kHz)</span>
            </div>
            <span className="text-primary font-bold px-1.5 py-0.5 rounded bg-surface-container-high shrink-0">
              SAFE
            </span>
          </div>
        </div>
      </section>

      {/* Quick Reference Frequency Badges */}
      <section className="bg-surface-container-low p-3.5 rounded-xl border border-surface-variant/40 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Bookmark className="w-4 h-4 text-primary" />
            <span className="font-sans text-[15px] font-semibold text-on-surface">
              Tần số tham chiếu nhanh
            </span>
          </div>
          <span className="font-mono text-[10px] text-outline">Chạm để thử tức thì</span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p.hz}
              type="button"
              onClick={() => {
                if (sweeping) stopSweepLoop();
                changeFreq(p.hz);
              }}
              className={`min-h-[46px] px-2 py-1.5 rounded-lg transition active:scale-95 flex flex-col items-center justify-center cursor-pointer ${
                p.featured
                  ? 'bg-surface-container-high ring-1 ring-primary/40 shadow-[0_0_12px_rgba(255,159,10,0.22)]'
                  : 'bg-surface-container hover:bg-surface-container-high'
              }`}
            >
              <div className="flex items-center gap-1">
                {p.featured && <Star className="w-3 h-3 text-primary-container fill-current" />}
                <span
                  className={`font-mono text-[11px] font-semibold ${
                    p.featured ? 'text-primary' : 'text-on-surface'
                  }`}
                >
                  {p.label}
                </span>
              </div>
              <span
                className={`font-mono text-[9px] mt-0.5 ${
                  p.featured ? 'text-primary font-medium' : 'text-outline'
                }`}
              >
                {p.sub}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Tip Banner + Modal */}
      <div className="flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-surface-container-low/70 border border-surface-variant/30">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-secondary-fixed-dim" />
          <span className="text-[12px] text-on-surface-variant">Cần mẹo bắt đỉnh chói nhanh?</span>
        </div>
        <button
          type="button"
          onClick={() => setShowTipModal(true)}
          className="px-3 py-1.5 rounded-lg bg-surface-container-high hover:bg-surface-bright text-primary font-mono text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
        >
          <Info className="w-3.5 h-3.5" />
          <span>Mẹo dò</span>
        </button>
      </div>

      {showTipModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-low max-w-[400px] w-full p-4 rounded-xl border border-surface-variant flex flex-col gap-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-secondary-fixed-dim" />
                <span className="font-sans text-[16px] font-semibold text-on-surface">
                  Mẹo bắt đỉnh chói ống tai
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowTipModal(false)}
                className="p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[13px] text-on-surface-variant leading-relaxed">
              Bấm <strong className="text-on-surface">Tự quét 2k→10k</strong>. Ngay khoảnh khắc tiếng
              rít gắt buốt nhô to nhất trong tai bạn, chạm <strong className="text-primary">Dừng tại đây</strong>,
              sau đó bấm nút <strong className="text-secondary-fixed">Gán vào B4</strong> để đưa đúng tần số đó
              sang Band 4 gọt chói (-3 dB đến -5 dB).
            </p>
            <button
              type="button"
              onClick={() => setShowTipModal(false)}
              className="w-full py-2.5 rounded-lg bg-primary-container text-on-primary-container font-mono text-[11px] font-bold uppercase tracking-wider cursor-pointer"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
