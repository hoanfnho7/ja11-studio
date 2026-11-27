import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowUp,
  Maximize2,
  Minimize2,
  Pin,
  PinOff,
  RotateCcw,
  Save,
  ShieldAlert,
  Smartphone,
  Sparkles,
  Usb,
  Volume2,
} from 'lucide-react';
import { HardwareControlBar } from './components/HardwareControlBar';
import { BAND_COLORS, InteractiveEqCanvas } from './components/InteractiveEqCanvas';
import { PresetVaultAndCloud } from './components/PresetVaultAndCloud';
import { SineSweepPanel } from './components/SineSweepPanel';
import { computePeakResponseDb } from './core/biquadMath';
import { parseAnyPresetFile } from './core/fiioXml';
import { DEFAULT_NEUTRAL_BANDS, EQ_PRESET_NAMES, FilterType, PeqProfile } from './core/ja11Protocol';
import { EngineState, ja11Engine } from './core/liveSyncEngine';
import { upsertVaultProfile } from './services/presetVault';
import { AndroidUsbTransport, isRunningInsideAndroidApk } from './transports/androidUsbTransport';
import { WebHidTransport } from './transports/webHidTransport';

export const App: React.FC = () => {
  const [engineState, setEngineState] = useState<EngineState>(() => ja11Engine.getState());
  const [selectedBand, setSelectedBand] = useState(3); // Default Band 4 (4380Hz ear peak)
  const [activeSweepHz, setActiveSweepHz] = useState<number | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string>(
    'JD1 + JA11 | Custom Ear 4380Hz (Chuẩn tai bạn)',
  );
  const [dragOverlay, setDragOverlay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sticky Follow-Along EQ Graph state (for screens < 1280px; on 1920x1080 2-column layout it's permanently side-by-side!)
  const [stickyFollow, setStickyFollow] = useState(true);
  const [isGraphDocked, setIsGraphDocked] = useState(false);
  const [dockCompact, setDockCompact] = useState(true);
  const graphSentinelRef = useRef<HTMLDivElement | null>(null);

  const isPreviewConnected =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('preview_connected') === '1';

  useEffect(() => {
    return ja11Engine.subscribe(setEngineState);
  }, []);

  useEffect(() => {
    const el = graphSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first) setIsGraphDocked(!first.isIntersecting);
      },
      { threshold: 0, rootMargin: '-8px 0px 0px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [engineState.hardware.connected, isPreviewConnected]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleConnect = async () => {
    try {
      const makeTransport = () =>
        isRunningInsideAndroidApk() ? new AndroidUsbTransport() : new WebHidTransport();
      await ja11Engine.connectWith(makeTransport(), makeTransport);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDropXml = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverlay(false);
    if (!isUnlocked) {
      showToast('Hãy kết nối FiiO JA11 trước khi thả file Profile!');
      return;
    }
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    try {
      const content = await file.text();
      const profile = parseAnyPresetFile(content, file.name);
      upsertVaultProfile(profile, {
        name: profile.name,
        description: profile.description,
        category: 'personal',
      });
      setActiveProfileName(profile.name);
      ja11Engine.applySnapshotLive(profile, profile.name);
      showToast(`Đã thả & áp dụng nghe thử file "${profile.name}"!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handlePreviewProfile = (p: PeqProfile) => {
    setActiveProfileName(p.name);
    ja11Engine.applySnapshotLive(p, p.name);
  };

  const effectiveState: EngineState = isPreviewConnected
    ? {
        ...engineState,
        hardware: {
          ...engineState.hardware,
          connected: true,
          transportName: 'webhid',
          productName: 'JadeAudio JA11',
          firmwareVersion: 'v1.9',
          sampleRate: '48 kHz',
        },
      }
    : engineState;

  const isUnlocked = effectiveState.hardware.connected;
  const headroom = computePeakResponseDb(effectiveState.livePeq);
  const clippingRisk = headroom.maxNetOutputDb > 0.2;
  const showDockedChrome = stickyFollow && isGraphDocked;
  const activeBand = effectiveState.livePeq.bands[selectedBand] ?? effectiveState.livePeq.bands[0];
  const webHidAvailable =
    typeof navigator !== 'undefined' && 'hid' in navigator;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (isUnlocked) setDragOverlay(true);
      }}
      onDragLeave={() => setDragOverlay(false)}
      onDrop={(e) => void handleDropXml(e)}
      className="min-h-screen bg-[#090d16] text-slate-100 px-3 sm:px-4 xl:px-5 py-3 max-w-[1860px] mx-auto space-y-3"
    >
      {dragOverlay && (
        <div className="fixed inset-0 z-50 bg-cyan-950/75 backdrop-blur-sm border-2 border-dashed border-cyan-400 flex items-center justify-center pointer-events-none">
          <div className="text-center space-y-1">
            <p className="text-lg font-bold text-cyan-300">Thả file FiiO .XML / AutoEQ .TXT vào đây</p>
            <p className="text-xs text-slate-300">
              Tự động nạp nghe thử Live trên RAM (không ghi đè bộ nhớ gốc)
            </p>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-4 py-2.5 rounded-xl bg-slate-900 border border-cyan-500/50 text-cyan-200 text-xs shadow-xl">
          {toast}
        </div>
      )}

      {/* 1. Locked Single-Row Studio Top Bar */}
      <HardwareControlBar
        engineState={effectiveState}
        onConnect={() => void handleConnect()}
        onDisconnect={() => void ja11Engine.disconnect()}
        onRevert={() => void ja11Engine.revertToSavedSnapshot()}
        onSaveToFlash={() => {
          void ja11Engine.commitToFlash().catch((e) => showToast(String(e)));
        }}
        onChangeEqMode={(code) => {
          setActiveProfileName(EQ_PRESET_NAMES[code] ?? `Mode ${code}`);
          void ja11Engine.setEqMode(code);
        }}
        onToggleInlineMic={(en) => void ja11Engine.setInlineMic(en)}
        onChangeUacMode={(m) => void ja11Engine.setUacMode(m)}
      />

      {/* 2. Mandatory DAC Connection Gate when JA11 is not connected */}
      {!isUnlocked ? (
        <div className="min-h-[calc(100vh-100px)] flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-cyan-500/15 border border-cyan-500/35 flex items-center justify-center text-cyan-400 shadow-[0_0_24px_rgba(6,182,212,0.18)]">
              <Usb className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-100">
                Kết nối FiiO / JadeAudio JA11
              </h1>
              <p className="text-sm text-slate-400 leading-relaxed">
                Cắm DAC <span className="text-cyan-300 font-medium">FiiO JA11</span> vào cổng USB máy tính rồi nhấn nút bên dưới để đọc thông số trực tiếp từ chip và mở khóa toàn bộ bảng điều khiển Studio.
              </p>
            </div>

            {!webHidAvailable && !isRunningInsideAndroidApk() && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                Trình duyệt hiện tại chưa hỗ trợ WebHID. Vui lòng mở bằng <strong>Chrome</strong>, <strong>Edge</strong> hoặc <strong>Opera</strong> trên PC (hoặc tải App Android bên dưới).
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-1">
              <button
                onClick={() => void handleConnect()}
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 active:scale-[0.98] text-slate-950 font-bold text-sm transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-cyan-500/20"
              >
                <Usb className="w-5 h-5" />
                Kết nối FiiO JA11 ngay
              </button>

              {!isRunningInsideAndroidApk() && (
                <a
                  href="https://github.com/hoanfnho7/ja11-studio/releases/latest/download/JA11-Studio-v3.0.apk"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto px-5 py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-medium text-sm transition flex items-center justify-center gap-2"
                >
                  <Smartphone className="w-4 h-4 text-cyan-400" />
                  Tải App Android (.APK v3.0)
                </a>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 text-left text-xs">
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                <span className="font-mono text-cyan-400 font-semibold">01 / CẮM USB</span>
                <p className="text-slate-400 text-[11px]">Cắm JA11 (kèm tai nghe JD1/IEM) vào cổng USB-C hoặc USB-A.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                <span className="font-mono text-cyan-400 font-semibold">02 / CHỌN THIẾT BỊ</span>
                <p className="text-slate-400 text-[11px]">Chọn <strong>JadeAudio JA11</strong> trên hộp thoại trình duyệt và bấm Connect.</p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-1">
                <span className="font-mono text-cyan-400 font-semibold">03 / CHỈNH LIVE RAM</span>
                <p className="text-slate-400 text-[11px]">Tự sao lưu Profile gốc, nghe thử không ghi đè, xem đồ thị song song 16:9.</p>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-xs text-slate-500 pt-1">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">{effectiveState.lastMessage}</span>
            </div>
          </div>
        </div>
      ) : (
        /* 3. Unlocked 1920x1080 (16:9) 2-Column Widescreen Studio Workspace */
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-3.5 items-start">
          {/* LEFT STUDIO DECK (xl:col-span-7 -> Graph + Volume/Preamp + 5 Bands + Sine Sweep, always visible!) */}
          <div className="xl:col-span-7 space-y-3 xl:sticky xl:top-3">
            {/* Sentinel for compact docking on smaller (< 1280px) screens */}
            <div ref={graphSentinelRef} className="h-px w-full -my-1 pointer-events-none xl:hidden" />

            {/* Live Interactive PEQ Graph Card */}
            <div
              className={`bg-slate-900/85 border border-slate-800 rounded-xl p-3 space-y-2 ${
                stickyFollow
                  ? `sticky top-2 z-30 xl:static xl:z-auto ${
                      showDockedChrome
                        ? 'border-cyan-500/45 shadow-[0_14px_34px_rgba(0,0,0,0.85)] xl:border-slate-800 xl:shadow-none'
                        : ''
                    }`
                  : ''
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                  <span className="font-semibold text-cyan-300 truncate">{activeProfileName}</span>
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] shrink-0">
                    Pre {effectiveState.livePeq.masterGain > 0 ? '+' : ''}
                    {effectiveState.livePeq.masterGain.toFixed(1)}dB
                  </span>
                  <span className="hidden sm:inline font-mono text-[11px] text-slate-400 whitespace-nowrap">
                    • B{selectedBand + 1}: {activeBand.freq}Hz ({activeBand.gain > 0 ? '+' : ''}
                    {activeBand.gain}dB, Q {activeBand.q})
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => {
                      setActiveProfileName('Phẳng 0 dB');
                      ja11Engine.applySnapshotLive(
                        { masterGain: effectiveState.livePeq.masterGain, bands: DEFAULT_NEUTRAL_BANDS },
                        'Phẳng 0 dB',
                      );
                    }}
                    className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-[11px] cursor-pointer"
                  >
                    Đặt Flat 0dB
                  </button>

                  {/* Sticky dock buttons for < 1280px screens */}
                  <div className="flex xl:hidden items-center gap-1.5">
                    {showDockedChrome && effectiveState.hasUnsavedRamChanges && (
                      <button
                        onClick={() => void ja11Engine.revertToSavedSnapshot()}
                        className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-amber-300 text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <RotateCcw className="w-3 h-3" />
                      </button>
                    )}
                    {showDockedChrome && effectiveState.hardware.eqPreset === 3 && (
                      <button
                        onClick={() => void ja11Engine.commitToFlash().catch((e) => showToast(String(e)))}
                        className="px-2 py-1 rounded-lg bg-emerald-500 text-slate-950 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                      >
                        <Save className="w-3 h-3" />
                      </button>
                    )}
                    {showDockedChrome && (
                      <button
                        onClick={() => setDockCompact((v) => !v)}
                        className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 text-[11px] cursor-pointer"
                      >
                        {dockCompact ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                      </button>
                    )}
                    <button
                      onClick={() => setStickyFollow((v) => !v)}
                      className={`px-2 py-1 rounded-lg border text-[11px] flex items-center gap-1 cursor-pointer ${
                        stickyFollow
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      {stickyFollow ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
                    </button>
                    {showDockedChrome && (
                      <button
                        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                        className="p-1 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <InteractiveEqCanvas
                livePeq={effectiveState.livePeq}
                savedSnapshot={effectiveState.savedFlashSnapshot}
                selectedBand={selectedBand}
                onSelectBand={setSelectedBand}
                onChangeBand={(idx, patch) => {
                  setActiveProfileName('Tùy chỉnh Live');
                  ja11Engine.updateBandLive(idx, patch);
                }}
                activeSweepHz={activeSweepHz}
                compactDocked={showDockedChrome && dockCompact}
              />
            </div>

            {/* Hardware Volume (0..60) + Master Gain Preamp Compact Strip */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 bg-slate-900/80 border border-slate-800 rounded-xl p-3 text-xs">
              <div className="space-y-1.5 md:border-r md:border-slate-800 md:pr-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200 flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
                    Âm lượng DAC (0–60)
                  </span>
                  <span className="font-mono font-semibold text-cyan-300">
                    {effectiveState.hardware.deviceVolume} / 60
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={effectiveState.hardware.deviceVolume}
                    onChange={(e) => ja11Engine.updateDeviceVolumeLive(Number(e.target.value))}
                    className="flex-1 cursor-pointer"
                  />
                  <button
                    onClick={() => ja11Engine.updateDeviceVolumeLive(32)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 shrink-0 cursor-pointer"
                  >
                    32 (PC)
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-200">Master Gain (Preamp)</span>
                  <span className={`font-mono font-semibold ${clippingRisk ? 'text-rose-400' : 'text-emerald-300'}`}>
                    {effectiveState.livePeq.masterGain > 0 ? '+' : ''}
                    {effectiveState.livePeq.masterGain.toFixed(1)} dB
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.1}
                    value={effectiveState.livePeq.masterGain}
                    onChange={(e) => ja11Engine.updateMasterGainLive(Number(e.target.value))}
                    className="flex-1 cursor-pointer"
                  />
                  <button
                    onClick={() => ja11Engine.updateMasterGainLive(-12)}
                    className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shrink-0 cursor-pointer"
                  >
                    -12dB
                  </button>
                  {clippingRisk && (
                    <button
                      onClick={() => ja11Engine.updateMasterGainLive(headroom.recommendedMasterGain)}
                      className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <ShieldAlert className="w-3 h-3" />
                      {headroom.recommendedMasterGain}dB
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* 5-Band Precision Controls (Always 5 columns side-by-side on Desktop!) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2">
              {effectiveState.livePeq.bands.map((band, idx) => {
                const isSel = idx === selectedBand;
                const color = BAND_COLORS[idx];
                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedBand(idx)}
                    className={`rounded-xl p-2.5 border transition cursor-pointer space-y-1.5 text-xs ${
                      isSel
                        ? 'bg-slate-900 border-cyan-500/60 shadow-[0_0_0_1px_rgba(6,182,212,0.25)]'
                        : 'bg-slate-900/65 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-4 h-4 rounded-full text-[10px] font-bold text-slate-950 flex items-center justify-center shrink-0"
                          style={{ backgroundColor: color }}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-slate-200">B{idx + 1}</span>
                      </div>

                      <select
                        value={band.type}
                        onChange={(e) => {
                          setActiveProfileName('Tùy chỉnh Live');
                          ja11Engine.updateBandLive(idx, { type: e.target.value as FilterType });
                        }}
                        className="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] text-slate-200 cursor-pointer"
                      >
                        <option value="LSQ">LSQ</option>
                        <option value="PK">PK</option>
                        <option value="HSQ">HSQ</option>
                      </select>
                    </div>

                    {/* Frequency */}
                    <div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Hz</span>
                        <input
                          type="number"
                          min={20}
                          max={20000}
                          value={band.freq}
                          onChange={(e) => {
                            setActiveProfileName('Tùy chỉnh Live');
                            ja11Engine.updateBandLive(idx, { freq: Number(e.target.value) });
                          }}
                          className="w-16 px-1 py-0.5 rounded bg-slate-950 border border-slate-800 text-right font-mono text-[11px] text-slate-100"
                        />
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={1000}
                        value={Math.round(
                          ((Math.log10(band.freq) - Math.log10(20)) /
                            (Math.log10(20000) - Math.log10(20))) *
                            1000,
                        )}
                        onChange={(e) => {
                          const r = Number(e.target.value) / 1000;
                          const hz = Math.round(
                            Math.pow(10, Math.log10(20) + r * (Math.log10(20000) - Math.log10(20))),
                          );
                          setActiveProfileName('Tùy chỉnh Live');
                          ja11Engine.updateBandLive(idx, { freq: hz });
                        }}
                        className="w-full cursor-pointer"
                      />
                    </div>

                    {/* Gain */}
                    <div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">dB</span>
                        <input
                          type="number"
                          min={-12}
                          max={12}
                          step={0.1}
                          value={band.gain}
                          onChange={(e) => {
                            setActiveProfileName('Tùy chỉnh Live');
                            ja11Engine.updateBandLive(idx, { gain: Number(e.target.value) });
                          }}
                          className="w-16 px-1 py-0.5 rounded bg-slate-950 border border-slate-800 text-right font-mono text-[11px] text-slate-100"
                        />
                      </div>
                      <input
                        type="range"
                        min={-12}
                        max={12}
                        step={0.1}
                        value={band.gain}
                        onChange={(e) => {
                          setActiveProfileName('Tùy chỉnh Live');
                          ja11Engine.updateBandLive(idx, { gain: Number(e.target.value) });
                        }}
                        className="w-full cursor-pointer"
                      />
                    </div>

                    {/* Q */}
                    <div>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="text-slate-400">Q</span>
                        <input
                          type="number"
                          min={0.1}
                          max={10}
                          step={0.05}
                          value={band.q}
                          onChange={(e) => {
                            setActiveProfileName('Tùy chỉnh Live');
                            ja11Engine.updateBandLive(idx, { q: Number(e.target.value) });
                          }}
                          className="w-16 px-1 py-0.5 rounded bg-slate-950 border border-slate-800 text-right font-mono text-[11px] text-slate-100"
                        />
                      </div>
                      <input
                        type="range"
                        min={0.1}
                        max={10}
                        step={0.05}
                        value={band.q}
                        onChange={(e) => {
                          setActiveProfileName('Tùy chỉnh Live');
                          ja11Engine.updateBandLive(idx, { q: Number(e.target.value) });
                        }}
                        className="w-full cursor-pointer"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Integrated Sine Sweep Ear Calibrator */}
            <SineSweepPanel onActiveFreqChange={setActiveSweepHz} />

            {/* Live Status Line */}
            <div className="hidden xl:flex items-center gap-2 px-1 text-[11px] text-slate-400">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="truncate">{effectiveState.lastMessage}</span>
            </div>
          </div>

          {/* RIGHT PROFILE BROWSER (xl:col-span-5 -> Independently scrollable side-by-side with Graph!) */}
          <div className="xl:col-span-5">
            <PresetVaultAndCloud
              currentLivePeq={effectiveState.livePeq}
              activeProfileName={activeProfileName}
              isSyncing={effectiveState.isSyncing}
              onPreviewProfileLive={handlePreviewProfile}
              onNotify={showToast}
            />
          </div>
        </div>
      )}
    </div>
  );
};
