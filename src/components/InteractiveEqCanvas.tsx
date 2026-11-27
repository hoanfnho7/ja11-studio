import React, { useEffect, useRef, useState } from 'react';
import { computeBiquadCoeffs, evaluateBiquadDb } from '../core/biquadMath';
import { PeqBand, PeqSnapshot } from '../core/ja11Protocol';

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);
const MIN_DB = -14;
const MAX_DB = 14;

export const BAND_COLORS = [
  '#38bdf8', // Band 1 - Sky
  '#a78bfa', // Band 2 - Violet
  '#34d399', // Band 3 - Emerald
  '#fbbf24', // Band 4 - Amber
  '#fb7185', // Band 5 - Rose
] as const;

interface Props {
  livePeq: PeqSnapshot;
  savedSnapshot: PeqSnapshot | null;
  selectedBand: number;
  onSelectBand: (index: number) => void;
  onChangeBand: (index: number, patch: Partial<PeqBand>) => void;
  activeSweepHz: number | null;
  compactDocked?: boolean;
}

function freqToX(freq: number, width: number, padL: number, padR: number): number {
  const usable = width - padL - padR;
  const clamped = Math.max(MIN_FREQ, Math.min(MAX_FREQ, freq));
  const ratio = (Math.log10(clamped) - LOG_MIN) / (LOG_MAX - LOG_MIN);
  return padL + ratio * usable;
}

function xToFreq(x: number, width: number, padL: number, padR: number): number {
  const usable = Math.max(1, width - padL - padR);
  const ratio = Math.max(0, Math.min(1, (x - padL) / usable));
  return Math.round(Math.pow(10, LOG_MIN + ratio * (LOG_MAX - LOG_MIN)));
}

function dbToY(db: number, height: number, padT: number, padB: number): number {
  const usable = height - padT - padB;
  const clamped = Math.max(MIN_DB, Math.min(MAX_DB, db));
  const ratio = (MAX_DB - clamped) / (MAX_DB - MIN_DB);
  return padT + ratio * usable;
}

function yToDb(y: number, height: number, padT: number, padB: number): number {
  const usable = Math.max(1, height - padT - padB);
  const ratio = Math.max(0, Math.min(1, (y - padT) / usable));
  const raw = MAX_DB - ratio * (MAX_DB - MIN_DB);
  return Math.max(-12, Math.min(12, Math.round(raw * 10) / 10));
}

export const InteractiveEqCanvas: React.FC<Props> = ({
  livePeq,
  savedSnapshot,
  selectedBand,
  onSelectBand,
  onChangeBand,
  activeSweepHz,
  compactDocked = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggingBand, setDraggingBand] = useState<number | null>(null);
  const [sizeTick, setSizeTick] = useState(0);

  const PAD = compactDocked
    ? { l: 34, r: 14, t: 12, b: 20 }
    : { l: 38, r: 16, t: 18, b: 26 };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onResize = () => setSizeTick((n) => n + 1);
    window.addEventListener('resize', onResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => setSizeTick((n) => n + 1));
      ro.observe(canvas);
    }
    return () => {
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = rect.width;
    const H = rect.height;

    // Background
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, W, H);

    // Grid dB lines
    const dbTicks = compactDocked ? [-12, -6, 0, 6, 12] : [-12, -6, 0, 6, 12];
    ctx.font = `${compactDocked ? 10 : 11}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const db of dbTicks) {
      const y = dbToY(db, H, PAD.t, PAD.b);
      ctx.strokeStyle = db === 0 ? 'rgba(148, 163, 184, 0.35)' : 'rgba(51, 65, 85, 0.55)';
      ctx.lineWidth = db === 0 ? 1.5 : 1;
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(W - PAD.r, y);
      ctx.stroke();

      ctx.fillStyle = db === 0 ? '#cbd5e1' : '#64748b';
      ctx.fillText(`${db > 0 ? '+' : ''}${db}`, PAD.l - 6, y);
    }

    // Grid Frequency lines
    const freqTicks = [20, 50, 100, 200, 500, 1000, 2000, 4380, 8000, 16000];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const f of freqTicks) {
      const x = freqToX(f, W, PAD.l, PAD.r);
      const isSpecial4380 = f === 4380;
      ctx.strokeStyle = isSpecial4380 ? 'rgba(251, 191, 36, 0.22)' : 'rgba(51, 65, 85, 0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, H - PAD.b);
      ctx.stroke();

      ctx.fillStyle = isSpecial4380 ? '#fbbf24' : '#64748b';
      const label = f >= 1000 ? `${(f / 1000).toFixed(f === 4380 ? 2 : 0)}k` : `${f}`;
      ctx.fillText(label, x, H - 3);
    }

    const plotW = Math.max(1, Math.floor(W - PAD.l - PAD.r));
    const sampleStep = 2;

    // 1. Optional Ghost Curve of Saved Hardware Snapshot (before live edits)
    if (savedSnapshot) {
      const savedCoeffs = savedSnapshot.bands.map((b) => computeBiquadCoeffs(b));
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      for (let dx = 0; dx <= plotW; dx += sampleStep) {
        const px = PAD.l + dx;
        const freq = xToFreq(px, W, PAD.l, PAD.r);
        let sumDb = 0;
        for (const c of savedCoeffs) sumDb += evaluateBiquadDb(c, freq);
        const py = dbToY(sumDb, H, PAD.t, PAD.b);
        if (dx === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
    }

    // 2. Per-band shaded curves
    const liveCoeffs = livePeq.bands.map((b) => computeBiquadCoeffs(b));
    const zeroY = dbToY(0, H, PAD.t, PAD.b);

    liveCoeffs.forEach((coeff, idx) => {
      const band = livePeq.bands[idx];
      if (Math.abs(band.gain) < 0.05 && idx !== selectedBand) return;

      const color = BAND_COLORS[idx];
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(PAD.l, zeroY);
      for (let dx = 0; dx <= plotW; dx += sampleStep * 2) {
        const px = PAD.l + dx;
        const freq = xToFreq(px, W, PAD.l, PAD.r);
        const db = evaluateBiquadDb(coeff, freq);
        ctx.lineTo(px, dbToY(db, H, PAD.t, PAD.b));
      }
      ctx.lineTo(PAD.l + plotW, zeroY);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = idx === selectedBand ? 0.16 : 0.07;
      ctx.fill();
      ctx.restore();
    });

    // 3. Composite Summed Response Curve
    ctx.save();
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = compactDocked ? 2.3 : 2.6;
    ctx.shadowColor = 'rgba(34, 211, 238, 0.45)';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let dx = 0; dx <= plotW; dx += sampleStep) {
      const px = PAD.l + dx;
      const freq = xToFreq(px, W, PAD.l, PAD.r);
      let sumDb = 0;
      for (const c of liveCoeffs) sumDb += evaluateBiquadDb(c, freq);
      const py = dbToY(sumDb, H, PAD.t, PAD.b);
      if (dx === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();

    // 4. Active Sine Sweep Laser Line
    if (activeSweepHz !== null) {
      const sx = freqToX(activeSweepHz, W, PAD.l, PAD.r);
      ctx.save();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, PAD.t);
      ctx.lineTo(sx, H - PAD.b);
      ctx.stroke();
      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`♪ ${Math.round(activeSweepHz)}Hz`, Math.min(W - 38, Math.max(PAD.l + 32, sx)), PAD.t + 12);
      ctx.restore();
    }

    // 5. Draggable Handles for Bands 1..5
    livePeq.bands.forEach((band, idx) => {
      const hx = freqToX(band.freq, W, PAD.l, PAD.r);
      const hy = dbToY(band.gain, H, PAD.t, PAD.b);
      const isSel = idx === selectedBand;
      const color = BAND_COLORS[idx];

      if (isSel) {
        ctx.beginPath();
        ctx.arc(hx, hy, compactDocked ? 11 : 14, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.beginPath();
      ctx.arc(hx, hy, compactDocked ? (isSel ? 7.2 : 6.2) : isSel ? 8.5 : 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#090d16';
      ctx.stroke();

      ctx.fillStyle = '#090d16';
      ctx.font = `bold ${compactDocked ? 9 : 10}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(idx + 1), hx, hy + 0.5);
    });
  }, [livePeq, savedSnapshot, selectedBand, activeSweepHz, sizeTick, compactDocked]);

  const findNearestBand = (clientX: number, clientY: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    let bestIdx: number | null = null;
    let bestDist = 30;
    livePeq.bands.forEach((b, idx) => {
      const hx = freqToX(b.freq, rect.width, PAD.l, PAD.r);
      const hy = dbToY(b.gain, rect.height, PAD.t, PAD.b);
      const dist = Math.hypot(hx - x, hy - y);
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = idx;
      }
    });
    return bestIdx;
  };

  const applyDragCoords = (bandIdx: number, clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const freq = xToFreq(x, rect.width, PAD.l, PAD.r);
    const gain = yToDb(y, rect.height, PAD.t, PAD.b);
    onChangeBand(bandIdx, { freq, gain });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const hit = findNearestBand(e.clientX, e.clientY);
    const targetIdx = hit !== null ? hit : selectedBand;
    onSelectBand(targetIdx);
    setDraggingBand(targetIdx);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit !== null) {
      applyDragCoords(targetIdx, e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingBand === null) return;
    applyDragCoords(draggingBand, e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setDraggingBand(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const band = livePeq.bands[selectedBand];
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    const nextQ = Math.max(0.1, Math.min(10, Math.round((band.q + delta) * 100) / 100));
    onChangeBand(selectedBand, { q: nextQ });
  };

  return (
    <div className="relative w-full select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={`w-full rounded-xl border border-slate-800 cursor-grab active:cursor-grabbing touch-none transition-[height] duration-200 ${
          compactDocked ? 'h-36 sm:h-44' : 'h-60 sm:h-72'
        }`}
      />
      {!compactDocked && (
        <div className="flex flex-wrap items-center justify-between gap-2 mt-1.5 px-1 text-[11px] text-slate-400">
          <span>Mẹo: Kéo nút 1–5 để chỉnh Tần số &amp; Gain thời gian thực • Lăn chuột để đổi độ rộng Q</span>
          {savedSnapshot && (
            <span className="text-slate-400">--- Đường nét đứt: Profile gốc đang lưu trong chip</span>
          )}
        </div>
      )}
    </div>
  );
};
