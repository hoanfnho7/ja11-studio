import React, { useEffect, useRef, useState } from 'react';
import { Play, Square, Waves } from 'lucide-react';

interface Props {
  onActiveFreqChange: (hz: number | null) => void;
}

export const SineSweepPanel: React.FC<Props> = ({ onActiveFreqChange }) => {
  const [freq, setFreq] = useState(4380);
  const [playing, setPlaying] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [volume, setVolume] = useState(20);
  const [pan, setPan] = useState<-1 | 0 | 1>(0);

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
            {playing ? 'Dừng sóng Sin' : 'Phát sóng Sin dò tai'}
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
            {sweeping ? 'Đang quét 2k→10k...' : 'Tự quét 2k→10k'}
          </button>

          <span className="font-mono font-bold text-sm text-rose-400 ml-1">{freq} Hz</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg border border-slate-700 overflow-hidden">
            {([-1, 0, 1] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPan(p)}
                className={`px-2 py-1 cursor-pointer ${
                  pan === p ? 'bg-cyan-500 text-slate-950 font-semibold' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {p === -1 ? 'Trái' : p === 0 ? 'L+R' : 'Phải'}
              </button>
            ))}
          </div>

          <label className="flex items-center gap-1.5 text-slate-400">
            <span>Âm thử</span>
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
        </div>
      </div>

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
        <span className="text-slate-400">Nhảy nhanh mốc JD1:</span>
        {[55, 185, 680, 3200, 4380, 7500].map((hz) => (
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
            {hz === 4380 ? '4380Hz (Đỉnh tai bạn)' : `${hz}Hz`}
          </button>
        ))}
      </div>
    </div>
  );
};
