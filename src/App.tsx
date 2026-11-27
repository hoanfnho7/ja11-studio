import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Maximize2, Minimize2, Pin, PinOff, RotateCcw, Save } from 'lucide-react';
import { HardwareControlBar } from './components/HardwareControlBar';
import { BAND_COLORS, InteractiveEqCanvas } from './components/InteractiveEqCanvas';
import { PresetVaultAndCloud } from './components/PresetVaultAndCloud';
import { SineSweepPanel } from './components/SineSweepPanel';
import { parseAnyPresetFile } from './core/fiioXml';
import { DEFAULT_NEUTRAL_BANDS, EQ_PRESET_NAMES, FilterType, PeqProfile } from './core/ja11Protocol';
import { EngineState, ja11Engine } from './core/liveSyncEngine';
import { upsertVaultProfile } from './services/presetVault';
import { AndroidUsbTransport, isRunningInsideAndroidApk } from './transports/androidUsbTransport';
import { WebHidTransport } from './transports/webHidTransport';

export const App: React.FC = () => {
  const [engineState, setEngineState] = useState<EngineState>(() => ja11Engine.getState());
  const [selectedBand, setSelectedBand] = useState(3); // Default highlight Band 4 (4380Hz user peak!)
  const [activeSweepHz, setActiveSweepHz] = useState<number | null>(null);
  const [activeProfileName, setActiveProfileName] = useState<string>('JD1 + JA11 | Custom Ear 4380Hz (Chuẩn tai bạn)');
  const [dragOverlay, setDragOverlay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Sticky Follow-Along EQ Graph state
  const [stickyFollow, setStickyFollow] = useState(true);
  const [isGraphDocked, setIsGraphDocked] = useState(false);
  const [dockCompact, setDockCompact] = useState(true);
  const graphSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return ja11Engine.subscribe(setEngineState);
  }, []);

  useEffect(() => {
    const el = graphSentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first) {
          setIsGraphDocked(!first.isIntersecting);
        }
      },
      { threshold: 0, rootMargin: '-8px 0px 0px 0px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

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

  const showDockedChrome = stickyFollow && isGraphDocked;
  const activeBand = engineState.livePeq.bands[selectedBand] ?? engineState.livePeq.bands[0];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverlay(true);
      }}
      onDragLeave={() => setDragOverlay(false)}
      onDrop={(e) => void handleDropXml(e)}
      className="min-h-screen bg-[#090d16] text-slate-100 px-3 sm:px-5 py-3.5 max-w-6xl mx-auto space-y-3.5"
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

      {/* 1. Hardware Connection, Volume 0..60 & Live/Flash Safety Bar */}
      <HardwareControlBar
        engineState={engineState}
        onConnect={() => void handleConnect()}
        onDisconnect={() => void ja11Engine.disconnect()}
        onRevert={() => void ja11Engine.revertToSavedSnapshot()}
        onSaveToFlash={() => {
          void ja11Engine.commitToFlash().catch((e) => showToast(String(e)));
        }}
        onChangeDeviceVolume={(vol) => ja11Engine.updateDeviceVolumeLive(vol)}
        onChangeMasterGain={(mg) => ja11Engine.updateMasterGainLive(mg)}
        onChangeEqMode={(code) => {
          setActiveProfileName(EQ_PRESET_NAMES[code] ?? `Mode ${code}`);
          void ja11Engine.setEqMode(code);
        }}
        onToggleInlineMic={(en) => void ja11Engine.setInlineMic(en)}
        onChangeUacMode={(m) => void ja11Engine.setUacMode(m)}
      />

      {/* Sentinel to detect when user scrolls past top controls */}
      <div ref={graphSentinelRef} className="h-px w-full -my-1 pointer-events-none" />

      {/* 2. Real-time Drag & Drop 5-Band EQ Graph — Automatically follows screen when scrolling! */}
      <div
        className={
          stickyFollow
            ? `sticky top-2 z-30 transition-all duration-200 ${
                showDockedChrome
                  ? 'bg-[#090d16]/95 backdrop-blur-md p-2.5 rounded-2xl border border-cyan-500/40 shadow-[0_14px_34px_rgba(0,0,0,0.8)] space-y-2'
                  : ''
              }`
            : ''
        }
      >
        {/* Top control strip for Sticky Graph */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-xs">
          <div className="flex items-center gap-2 min-w-0">
            <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
            <span className="font-semibold text-cyan-300 truncate">
              Đang hiển thị: {activeProfileName}
            </span>
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono text-[11px] shrink-0">
              Pre {engineState.livePeq.masterGain > 0 ? '+' : ''}
              {engineState.livePeq.masterGain.toFixed(1)}dB
            </span>
            {showDockedChrome && (
              <span className="hidden md:inline font-mono text-[11px] text-slate-400">
                • B{selectedBand + 1}: {activeBand.freq}Hz ({activeBand.gain > 0 ? '+' : ''}
                {activeBand.gain}dB, Q {activeBand.q})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {showDockedChrome && engineState.hardware.connected && engineState.hasUnsavedRamChanges && (
              <button
                onClick={() => void ja11Engine.revertToSavedSnapshot()}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-300 text-[11px] flex items-center gap-1 cursor-pointer"
                title="Hoàn tác về cấu hình gốc"
              >
                <RotateCcw className="w-3 h-3" />
                Hoàn tác
              </button>
            )}

            {showDockedChrome && engineState.hardware.connected && engineState.hardware.eqPreset === 3 && (
              <button
                onClick={() => void ja11Engine.commitToFlash().catch((e) => showToast(String(e)))}
                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                title="Lưu cứng User 1 vào Flash JA11"
              >
                <Save className="w-3 h-3" />
                Lưu Flash
              </button>
            )}

            {showDockedChrome && (
              <button
                onClick={() => setDockCompact((v) => !v)}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] flex items-center gap-1 cursor-pointer"
                title={dockCompact ? 'Phóng to đồ thị ghim' : 'Thu gọn đồ thị ghim'}
              >
                {dockCompact ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
                {dockCompact ? 'Mở rộng' : 'Thu gọn'}
              </button>
            )}

            <button
              onClick={() => setStickyFollow((v) => !v)}
              className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 cursor-pointer transition ${
                stickyFollow
                  ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
              title="Giữ đồ thị EQ đi theo màn hình khi cuộn xuống chọn Profile"
            >
              {stickyFollow ? <Pin className="w-3 h-3" /> : <PinOff className="w-3 h-3" />}
              {stickyFollow ? 'Ghim đồ thị: Bật' : 'Ghim đồ thị: Tắt'}
            </button>

            {showDockedChrome && (
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 cursor-pointer"
                title="Cuộn lên đầu trang"
              >
                <ArrowUp className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        <InteractiveEqCanvas
          livePeq={engineState.livePeq}
          savedSnapshot={engineState.savedFlashSnapshot}
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

      {/* 3. Fine Parametric Band Strip (5 Bands in wide 5-column PC grid) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-semibold text-slate-300">
            Tinh chỉnh chính xác 5 băng tần (Kéo đến đâu tai nghe đổi tiếng đến đó)
          </span>
          <button
            onClick={() => {
              setActiveProfileName('Phẳng 0 dB');
              ja11Engine.applySnapshotLive(
                { masterGain: engineState.livePeq.masterGain, bands: DEFAULT_NEUTRAL_BANDS },
                'Phẳng 0 dB',
              );
            }}
            className="text-[11px] text-slate-400 hover:text-cyan-300 underline cursor-pointer"
          >
            Đặt 5 band về 0 dB
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {engineState.livePeq.bands.map((band, idx) => {
            const isSel = idx === selectedBand;
            const color = BAND_COLORS[idx];
            return (
              <div
                key={idx}
                onClick={() => setSelectedBand(idx)}
                className={`rounded-xl p-2.5 border transition cursor-pointer space-y-2 text-xs ${
                  isSel
                    ? 'bg-slate-900 border-cyan-500/60 shadow-[0_0_0_1px_rgba(6,182,212,0.25)]'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-4 rounded-full text-[10px] font-bold text-slate-950 flex items-center justify-center"
                      style={{ backgroundColor: color }}
                    >
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-200">Band {idx + 1}</span>
                  </div>

                  <select
                    value={band.type}
                    onChange={(e) => {
                      setActiveProfileName('Tùy chỉnh Live');
                      ja11Engine.updateBandLive(idx, { type: e.target.value as FilterType });
                    }}
                    className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[11px] text-slate-200 cursor-pointer"
                  >
                    <option value="LSQ">LSQ (Trầm)</option>
                    <option value="PK">PK (Đỉnh)</option>
                    <option value="HSQ">HSQ (Cao)</option>
                  </select>
                </div>

                {/* Frequency */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Tần số</span>
                    <input
                      type="number"
                      min={20}
                      max={20000}
                      value={band.freq}
                      onChange={(e) => {
                        setActiveProfileName('Tùy chỉnh Live');
                        ja11Engine.updateBandLive(idx, { freq: Number(e.target.value) });
                      }}
                      className="w-20 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-right font-mono text-slate-100"
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
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Độ lợi (dB)</span>
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
                      className="w-20 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-right font-mono text-slate-100"
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

                {/* Q Factor */}
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Độ rộng Q</span>
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
                      className="w-20 px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-right font-mono text-slate-100"
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
      </div>

      {/* 4. Integrated Sine Sweep Ear Calibrator */}
      <SineSweepPanel onActiveFreqChange={setActiveSweepHz} />

      {/* 5. Offline Profile Vault, FiiO XML Import/Export & Hand-Picked Online Browser */}
      <PresetVaultAndCloud
        currentLivePeq={engineState.livePeq}
        activeProfileName={activeProfileName}
        onPreviewProfileLive={handlePreviewProfile}
        onNotify={showToast}
      />
    </div>
  );
};
