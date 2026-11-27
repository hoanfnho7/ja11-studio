import React, { useEffect, useRef, useState } from 'react';
import { computeBiquadCoeffs, evaluateBiquadDb } from '../core/biquadMath';
import { PeqBand, PeqSnapshot } from '../core/ja11Protocol';

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const LOG_MIN = Math.log10(MIN_FREQ);
const LOG_MAX = Math.log10(MAX_FREQ);
const MIN_DB = -13.5;
const MAX_DB = 13.5;

interface Props {
  livePeq: PeqSnapshot;
  savedSnapshot?: PeqSnapshot | null;
  selectedBand?: number;
  onSelectBand?: (index: number) => void;
  onChangeBand?: (index: number, patch: Partial<PeqBand>) => void;
  activeSweepHz?: number | null;
  compact?: boolean;
  isBypassed?: boolean;
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
  savedSnapshot = null,
  selectedBand = 3,
  onSelectBand,
  onChangeBand,
  activeSweepHz = null,
  compact = false,
  isBypassed = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draggingBand, setDraggingBand] = useState<number | null>(null);
  const [sizeTick, setSizeTick] = useState(0);

  const PAD = compact ? { l: 28, r: 10, t: 10, b: 18 } : { l: 34, r: 14, t: 20, b: 24 };

  useEffect(() => {
    const onResize = () => setSizeTick((n) => n + 1);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
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

    // Deep Carbon Backplate (#0d0e11)
    ctx.fillStyle = '#0d0e11';
    ctx.fillRect(0, 0, W, H);

    // Horizontal dB Grid Lines
    const dbTicks = compact ? [-12, 0, 12] : [-12, -6, 0, 6, 12];
    ctx.font = `${compact ? 9 : 10}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (const db of dbTicks) {
      const y = dbToY(db, H, PAD.t, PAD.b);
      ctx.strokeStyle = db === 0 ? 'rgba(255, 159, 10, 0.28)' : 'rgba(52, 53, 56, 0.45)';
      ctx.lineWidth = db === 0 ? 1 : 0.75;
      if (db === 0) ctx.setLineDash([3, 3]);
      else ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(PAD.l, y);
      ctx.lineTo(W - PAD.r, y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = db === 0 ? '#ffc688' : '#636670';
      ctx.fillText(db === 0 ? '0' : `${db > 0 ? '+' : ''}${db}`, PAD.l - 5, y);
    }

    // Vertical Log Frequency Grid Lines
    const freqTicks = compact ? [20, 100, 1000, 10000, 20000] : [20, 100, 1000, 4380, 10000, 20000];
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    for (const f of freqTicks) {
      const x = freqToX(f, W, PAD.l, PAD.r);
      const is4380 = f === 4380;
      ctx.strokeStyle = is4380 ? 'rgba(0, 238, 252, 0.16)' : 'rgba(52, 53, 56, 0.35)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(x, PAD.t);
      ctx.lineTo(x, H - PAD.b);
      ctx.stroke();

      ctx.fillStyle = is4380 ? '#00dbe9' : '#6e717a';
      const lbl =
        f === 4380 ? '4.38k' : f >= 1000 ? `${f / 1000}kHz` : `${f}Hz`;
      const clampedX = Math.max(PAD.l + 12, Math.min(W - PAD.r - 14, x));
      ctx.fillText(lbl, clampedX, H - 3);
    }

    const plotW = Math.max(1, Math.floor(W - PAD.l - PAD.r));
    const zeroY = dbToY(0, H, PAD.t, PAD.b);

    // 1. Optional Ghost Curve of Saved Hardware Snapshot
    if (savedSnapshot && !isBypassed) {
      const savedCoeffs = savedSnapshot.bands.map((b) => computeBiquadCoeffs(b));
      ctx.save();
      ctx.strokeStyle = 'rgba(218, 195, 173, 0.32)';
      ctx.lineWidth = 1.25;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let dx = 0; dx <= plotW; dx += 2) {
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

    // 2. Electric Amber (#ff9f0a) Area Gradient + Main Spline Curve
    const liveCoeffs = livePeq.bands.map((b) => computeBiquadCoeffs(b));
    const curvePoints: Array<[number, number]> = [];
    for (let dx = 0; dx <= plotW; dx += 2) {
      const px = PAD.l + dx;
      const freq = xToFreq(px, W, PAD.l, PAD.r);
      let sumDb = 0;
      if (!isBypassed) {
        for (const c of liveCoeffs) sumDb += evaluateBiquadDb(c, freq);
      }
      curvePoints.push([px, dbToY(sumDb, H, PAD.t, PAD.b)]);
    }

    if (curvePoints.length > 1) {
      const grad = ctx.createLinearGradient(0, PAD.t, 0, H - PAD.b);
      grad.addColorStop(0, isBypassed ? 'rgba(142,145,153,0.12)' : 'rgba(255, 159, 10, 0.28)');
      grad.addColorStop(0.55, isBypassed ? 'rgba(142,145,153,0.03)' : 'rgba(255, 159, 10, 0.05)');
      grad.addColorStop(1, 'rgba(255, 159, 10, 0)');

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(curvePoints[0][0], zeroY);
      for (const [px, py] of curvePoints) ctx.lineTo(px, py);
      ctx.lineTo(curvePoints[curvePoints.length - 1][0], zeroY);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = isBypassed ? '#6e717a' : '#ff9f0a';
      ctx.lineWidth = compact ? 2 : 2.5;
      if (!isBypassed) {
        ctx.shadowColor = 'rgba(255, 159, 10, 0.35)';
        ctx.shadowBlur = 8;
      }
      ctx.beginPath();
      curvePoints.forEach(([px, py], i) => {
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.restore();
    }

    // 3. Active Sine Sweep Laser Line
    if (activeSweepHz !== null) {
      const sx = freqToX(activeSweepHz, W, PAD.l, PAD.r);
      ctx.save();
      ctx.strokeStyle = '#00eefc';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, PAD.t);
      ctx.lineTo(sx, H - PAD.b);
      ctx.stroke();
      ctx.restore();
    }

    // 4. Parametric Nodes B1..B5 (Amber rings, Ion Cyan #00eefc for selected band)
    if (!isBypassed) {
      livePeq.bands.forEach((band, idx) => {
        const hx = freqToX(band.freq, W, PAD.l, PAD.r);
        const hy = dbToY(band.gain, H, PAD.t, PAD.b);
        const isSel = !compact && idx === selectedBand;
        const strokeCol = isSel ? '#00eefc' : '#ff9f0a';
        const r = compact ? 4.5 : isSel ? 8.5 : 7.5;

        if (isSel) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(hx, hy, 14, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 238, 252, 0.16)';
          ctx.fill();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(hx, hy, r, 0, Math.PI * 2);
        ctx.fillStyle = '#121316';
        ctx.fill();
        ctx.lineWidth = compact ? 1.5 : 2;
        ctx.strokeStyle = strokeCol;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(hx, hy, compact ? 1.5 : isSel ? 3 : 2.4, 0, Math.PI * 2);
        ctx.fillStyle = strokeCol;
        ctx.fill();

        if (!compact) {
          ctx.fillStyle = strokeCol;
          ctx.font = 'bold 9px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          const labelY = hy < PAD.t + 16 ? hy + 20 : hy - 10;
          ctx.fillText(`B${idx + 1}`, hx, labelY);
        }
      });
    }
  }, [livePeq, savedSnapshot, selectedBand, activeSweepHz, compact, isBypassed, sizeTick]);

  const findNearestBand = (clientX: number, clientY: number): number | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    let bestIdx: number | null = null;
    let bestDist = 34; // Generous thumb touch target on mobile!
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
    if (!onChangeBand) return;
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
    if (compact || !onChangeBand) return;
    const hit = findNearestBand(e.clientX, e.clientY);
    const targetIdx = hit !== null ? hit : selectedBand;
    onSelectBand?.(targetIdx);
    setDraggingBand(targetIdx);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (hit !== null) {
      applyDragCoords(targetIdx, e.clientX, e.clientY);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (compact || draggingBand === null) return;
    applyDragCoords(draggingBand, e.clientX, e.clientY);
  };

  const handlePointerUp = () => {
    setDraggingBand(null);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (compact || !onChangeBand) return;
    e.preventDefault();
    const band = livePeq.bands[selectedBand];
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    const nextQ = Math.max(0.1, Math.min(10, Math.round((band.q + delta) * 100) / 100));
    onChangeBand(selectedBand, { q: nextQ });
  };

  const activeBand = livePeq.bands[selectedBand] ?? livePeq.bands[0];

  return (
    <div className="flex flex-col gap-2 w-full select-none">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onWheel={handleWheel}
        className={
          compact
            ? 'w-full h-24 rounded-lg border border-surface-variant/40 block'
            : 'w-full aspect-[2.05/1] min-h-[175px] rounded-lg border border-surface-variant/40 cursor-grab active:cursor-grabbing touch-none block'
        }
      />

      {!compact && (
        <div className="flex items-center justify-between px-2.5 py-1.5 bg-surface-container rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-1.5 h-1.5 rounded-full bg-secondary-container shrink-0" />
            <span className="font-mono text-[11px] text-on-surface truncate">
              {isBypassed
                ? 'EQ TẮT • Đường đáp tuyến phẳng (Hardware Bypass 0 dB)'
                : `B${selectedBand + 1} • ${activeBand.freq.toLocaleString('vi-VN')} Hz • ${
                    activeBand.gain > 0 ? '+' : ''
                  }${activeBand.gain.toFixed(1)} dB • Q ${activeBand.q.toFixed(2)}`}
            </span>
          </div>
          <span className="font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-surface-container-high text-secondary-fixed shrink-0">
            IIR 5-TAP
          </span>
        </div>
      )}
    </div>
  );
};
