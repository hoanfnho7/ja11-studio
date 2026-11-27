import React, { useEffect, useRef, useState } from 'react';
import { Crosshair, HelpCircle, Play, Square, Waves } from 'lucide-react';
import { Lang, tr } from '../core/i18n';

interface Props {
  lang: Lang;
  onActiveFreqChange: (hz: number | null) => void;
  onAssignPeakToBand4?: (hz: number) => void;
}

export const SineSweepPanel: React.FC<Props> = ({ lang, onActiveFreqChange, onAssignPeakToBand4 }) => {
  const [freq, setFreq] = useState(4000);
  const [playing, setPlaying] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [volume, setVolume] = useState(15);
  const [pan, setPan] = useState<-1 | 0 | 1>(0);
  const [showGuide, setShowGuide] = useState(false);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const panRef = useRef<StereoPannerNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const freqRef = useRef(freq);
  freqRef.current = freq;

  const volToSafeGain = (v: number) => {
    const norm = v / 100;
    return Math.max(0.0005, norm * norm * 0.28);
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
    const clamped = Math.max(20, Math.min(16000, Math.round(nextHz)));
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
      const octavesPerSec = Math.log2(10000 / 2000) / 14;
      f = f * Math.pow(2, octavesPerSec * dt);
      if (f >= 10200) {
        changeFreq(10200);
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
      gainRef.current.gain.setTargetAtTime(volToSafeGain(volume), audioCtxRef.current.currentTime, 0.02);
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
    };
  }, []);

  const logMin = Math.log10(20);
  const logMax = Math.log10(16000);
  const sliderPos = ((Math.log10(freq) - logMin) / (logMax - logMin)) * 1000;

  return (
    <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => togglePlay()}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition ${
              playing
                ? 'bg-rose-500 text-white hover:bg-rose-400'
                : 'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700'
            }`}
          >
            {playing ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {playing
              ? tr(lang, 'Dừng sóng Sin', 'Stop Sine')
              : tr(lang, 'Phát sóng Sin dò tai', 'Play Sine Sweep')}
          </button>

          <button
            onClick={toggleAutoSweep}
            className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-1 cursor-pointer transition ${
              sweeping
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Waves className="w-3.5 h-3.5" />
            {sweeping
              ? tr(lang, 'Đang quét 2k→10k...', 'Sweeping 2k→10k...')
              : tr(lang, 'Tự quét 2k→10k', 'Auto Sweep 2k→10k')}
          </button>

          <span className="font-mono font-bold text-sm text-rose-400 ml-1">{freq} Hz</span>

          {onAssignPeakToBand4 && (
            <button
              onClick={() => {
                togglePlay(false);
                onAssignPeakToBand4(freq);
              }}
              className="px-2 py-1 rounded-lg bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/25 flex items-center gap-1 font-medium cursor-pointer transition"
              title={tr(
                lang,
                'Đưa tần số đang chọn sang Band 4 (-3.8 dB, Q 3.2) để cắt chói',
                'Assign this peak frequency to Band 4 (-3.8 dB, Q 3.2) to notch out harshness',
              )}
            >
              <Crosshair className="w-3 h-3" />
              {tr(lang, 'Gán B4', 'Set B4')}
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
            {([-1, 0, 1] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPan(p)}
                className={`px-2 py-1 cursor-pointer ${
                  pan === p ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {p === -1 ? tr(lang, 'Trái', 'Left') : p === 0 ? 'L+R' : tr(lang, 'Phải', 'Right')}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-slate-400">
            <span>{tr(lang, 'Âm thử', 'Level')}</span>
            <input
              type="range"
              min={1}
              max={100}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="w-20 cursor-pointer"
            />
            <span className="font-mono w-8 text-right text-slate-200">{volume}%</span>
          </label>

          <button
            onClick={() => setShowGuide((v) => !v)}
            className={`px-2 py-1 rounded-lg border flex items-center gap-1 cursor-pointer transition ${
              showGuide
                ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            {tr(lang, 'Hướng dẫn', 'Guide')}
          </button>
        </div>
      </div>

      {showGuide && (
        <div className="rounded-lg bg-slate-950/90 border border-amber-500/30 p-2.5 text-[11px] text-slate-300 space-y-1 leading-relaxed">
          <div className="font-semibold text-amber-300">
            {tr(
              lang,
              '💡 Dò đỉnh tai (Ear Sweep) dùng để làm gì?',
              '💡 What is Ear Sweep for? (Beginner Guide)',
            )}
          </div>
          <p className="text-slate-400">
            {tr(
              lang,
              'Mỗi người có kích thước ống tai khác nhau nên tần số gây chói/rít chữ "s, x" trên cùng một tai nghe cũng khác nhau. Dùng công cụ này để tìm đúng điểm chói riêng của bạn:',
              'Every ear canal has a different resonance peak, so the exact harsh/sibilant frequency varies from person to person even on the same IEM:',
            )}
          </p>
          <ol className="list-decimal list-inside space-y-0.5 text-slate-300">
            <li>
              {tr(
                lang,
                'Giữ mức Âm thử nhỏ an toàn khoảng 12–15%.',
                'Keep the test tone Level low and safe around 12–15%.',
              )}
            </li>
            <li>
              {tr(
                lang,
                'Bấm Tự quét 2k→10k — nghe tiếng sóng chạy chậm từ thấp lên cao.',
                'Click Auto Sweep 2k→10k and listen as the pure sine tone rises.',
              )}
            </li>
            <li>
              {tr(
                lang,
                'Ngay chỗ tiếng đột nhiên nhô to / chói buốt nhất trong tai, bấm dừng quét.',
                'The instant the tone sounds noticeably louder or sharpest in your ear, click to stop.',
              )}
            </li>
            <li>
              {tr(
                lang,
                'Bấm Gán B4 → tự động đẩy tần số đó lên Band 4 (-3.8 dB, Q 3.2) để gọt đỉnh chói (dùng Trái/Phải để test lệch 2 bên tai).',
                'Click Set B4 → automatically notches that exact peak on Band 4 (-3.8 dB, Q 3.2). Use Left/Right to check L/R balance.',
              )}
            </li>
          </ol>
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          type="range"
          min={0}
          max={1000}
          step={1}
          value={Math.round(sliderPos)}
          onChange={(e) => {
            if (sweeping) stopSweepLoop();
            const r = Number(e.target.value) / 1000;
            changeFreq(Math.pow(10, logMin + r * (logMax - logMin)));
          }}
          className="flex-1 cursor-pointer"
        />
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="text-slate-400">{tr(lang, 'Mốc nhanh:', 'Quick Refs:')}</span>
        {[55, 185, 680, 3000, 4500, 7500].map((hz) => (
          <button
            key={hz}
            onClick={() => {
              if (sweeping) stopSweepLoop();
              changeFreq(hz);
            }}
            className={`px-2 py-0.5 rounded border cursor-pointer ${
              Math.abs(freq - hz) < 15
                ? 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {hz === 4500 ? tr(lang, '4.5kHz (Đỉnh tai)', '4.5kHz (Ear Peak)') : `${hz}Hz`}
          </button>
        ))}
      </div>
    </div>
  );
};
