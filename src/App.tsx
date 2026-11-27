import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { TabEarSweep } from './components/TabEarSweep';
import { TabEqAndVolume } from './components/TabEqAndVolume';
import { TabHardwareAndChip } from './components/TabHardwareAndChip';
import { TabProfilesAndXml } from './components/TabProfilesAndXml';
import { AppTab, BottomNavBar, TopAppBar } from './components/TopBarAndNav';
import { parseAnyPresetFile } from './core/fiioXml';
import { DEFAULT_NEUTRAL_BANDS, EQ_PRESET_NAMES, PeqProfile } from './core/ja11Protocol';
import { EngineState, ja11Engine } from './core/liveSyncEngine';
import { loadVaultProfiles, upsertVaultProfile } from './services/presetVault';
import { AndroidUsbTransport, isRunningInsideAndroidApk } from './transports/androidUsbTransport';
import { WebHidTransport } from './transports/webHidTransport';

export const App: React.FC = () => {
  const [engineState, setEngineState] = useState<EngineState>(() => ja11Engine.getState());
  const [activeTab, setActiveTab] = useState<AppTab>('eq');
  const [selectedBand, setSelectedBand] = useState(3); // Default Band 4 (4380Hz ear peak)
  const [activeSweepHz, setActiveSweepHz] = useState<number | null>(null);
  const [vaultProfiles, setVaultProfiles] = useState<PeqProfile[]>(() => loadVaultProfiles());
  const [activeProfileName, setActiveProfileName] = useState<string>('JD1 Cân bằng & Cắt chói');
  const [dragOverlay, setDragOverlay] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastNonBypassPresetRef = useRef<number>(3);

  useEffect(() => {
    return ja11Engine.subscribe((nextState) => {
      setEngineState(nextState);
      if (nextState.hardware.eqPreset !== 4) {
        lastNonBypassPresetRef.current = nextState.hardware.eqPreset;
      }
    });
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  };

  const handleConnect = async () => {
    try {
      const makeTransport = () =>
        isRunningInsideAndroidApk() ? new AndroidUsbTransport() : new WebHidTransport();
      await ja11Engine.connectWith(makeTransport(), makeTransport);
      showToast('Đã kết nối FiiO JA11 thành công!');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleToggleEqBypass = () => {
    const cur = engineState.hardware.eqPreset;
    if (cur === 4) {
      const target = lastNonBypassPresetRef.current !== 4 ? lastNonBypassPresetRef.current : 3;
      void ja11Engine.setEqMode(target);
      showToast(`Đã bật lại EQ (${EQ_PRESET_NAMES[target] ?? 'User 1'})`);
    } else {
      lastNonBypassPresetRef.current = cur;
      void ja11Engine.setEqMode(4);
      showToast('Đã chuyển sang EQ TẮT (So sánh A/B phẳng 0 dB)');
    }
  };

  const handleImportFileObj = async (file: File) => {
    try {
      const content = await file.text();
      const profile = parseAnyPresetFile(content, file.name);
      const updated = upsertVaultProfile(profile, {
        name: profile.name,
        description: profile.description,
        category: 'personal',
      });
      setVaultProfiles(updated);
      setActiveProfileName(profile.name);
      ja11Engine.applySnapshotLive(profile, profile.name);
      showToast(`Đã nạp "${profile.name}" vào DSP RAM & lưu Kho Offline!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDropXml = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverlay(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await handleImportFileObj(file);
  };

  const handlePreviewProfile = (p: PeqProfile) => {
    setActiveProfileName(p.name);
    ja11Engine.applySnapshotLive(p, p.name);
  };

  const handleChangeEqMode = (code: number) => {
    if (code !== 3) {
      setActiveProfileName(EQ_PRESET_NAMES[code] ?? `Mode ${code}`);
    }
    void ja11Engine.setEqMode(code);
  };

  const handleAssignPeakToBand4 = (hz: number) => {
    setSelectedBand(3);
    ja11Engine.updateBandLive(3, { type: 'PK', freq: hz, gain: -3.8, q: 3.2 });
    setActiveProfileName(`Custom (Gọt đỉnh ${hz}Hz)`);
    setActiveTab('eq');
    showToast(`Đã gán ${hz.toLocaleString('vi-VN')} Hz vào Band 4 (-3.8 dB, Q 3.2)!`);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOverlay(true);
      }}
      onDragLeave={() => setDragOverlay(false)}
      onDrop={(e) => void handleDropXml(e)}
      className="min-h-screen bg-surface text-on-surface flex flex-col"
    >
      {/* Hidden File Picker for .XML / .TXT / .JSON */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xml,.txt,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleImportFileObj(f);
          e.currentTarget.value = '';
        }}
      />

      {/* Drag & Drop Overlay */}
      {dragOverlay && (
        <div className="fixed inset-0 z-50 bg-surface/90 backdrop-blur-md border-2 border-dashed border-primary-container flex items-center justify-center pointer-events-none p-6">
          <div className="text-center space-y-1">
            <p className="font-sans text-lg font-bold text-primary">
              Thả file FiiO .XML / AutoEQ .TXT vào đây
            </p>
            <p className="font-mono text-xs text-on-surface-variant">
              Tự động nạp nghe thử Live trên RAM (không ghi đè bộ nhớ gốc)
            </p>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toast && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 max-w-[92vw] px-3.5 py-2 rounded-xl bg-surface-container-highest border border-primary-container/40 text-on-surface shadow-2xl flex items-center gap-2 pointer-events-none">
          <CheckCircle2 className="w-4 h-4 text-primary-container shrink-0" />
          <span className="font-mono text-[11px] font-medium truncate">{toast}</span>
        </div>
      )}

      {/* Persistent Top App Bar */}
      <TopAppBar
        activeTab={activeTab}
        engineState={engineState}
        onConnect={() => void handleConnect()}
        onDisconnect={() => void ja11Engine.disconnect()}
        onToggleEqBypass={handleToggleEqBypass}
      />

      {/* Active Tab Content Area */}
      <main className="flex-1 w-full max-w-[560px] mx-auto px-3.5 pt-3 pb-24">
        {activeTab === 'eq' && (
          <TabEqAndVolume
            engineState={engineState}
            selectedBand={selectedBand}
            onSelectBand={setSelectedBand}
            onChangeBand={(idx, patch) => {
              setActiveProfileName('Tùy chỉnh Live');
              ja11Engine.updateBandLive(idx, patch);
            }}
            onChangeDeviceVolume={(vol) => ja11Engine.updateDeviceVolumeLive(vol)}
            onChangeMasterGain={(mg) => ja11Engine.updateMasterGainLive(mg)}
            onChangeEqMode={handleChangeEqMode}
            onRevert={() => void ja11Engine.revertToSavedSnapshot()}
            onResetFlat={() => {
              setActiveProfileName('Flat Reference (0 dB)');
              ja11Engine.applySnapshotLive(
                { masterGain: 0, bands: DEFAULT_NEUTRAL_BANDS },
                'Flat Reference (0 dB)',
              );
              showToast('Đã đặt 5 băng tần về phẳng 0 dB.');
            }}
            onSaveToChip={() => {
              void ja11Engine
                .commitToFlash()
                .then(() => showToast('Đã gửi lệnh ghi cứng vào Flash ROM JA11!'))
                .catch((err) => showToast(err instanceof Error ? err.message : String(err)));
            }}
            onOpenImportXml={() => fileInputRef.current?.click()}
            quickProfiles={vaultProfiles}
            activeProfileName={activeProfileName}
            onQuickApplyProfile={handlePreviewProfile}
            activeSweepHz={activeSweepHz}
          />
        )}

        {activeTab === 'sweep' && (
          <TabEarSweep
            onActiveFreqChange={setActiveSweepHz}
            onAssignPeakToBand4={handleAssignPeakToBand4}
          />
        )}

        {activeTab === 'profiles' && (
          <TabProfilesAndXml
            livePeq={engineState.livePeq}
            savedSnapshot={engineState.savedFlashSnapshot}
            isBypassed={engineState.hardware.eqPreset === 4}
            activeProfileName={activeProfileName}
            vaultProfiles={vaultProfiles}
            onVaultChange={setVaultProfiles}
            onPreviewProfileLive={handlePreviewProfile}
            onOpenImportXml={() => fileInputRef.current?.click()}
            onNotify={showToast}
          />
        )}

        {activeTab === 'hardware' && (
          <TabHardwareAndChip
            engineState={engineState}
            onChangeEqMode={handleChangeEqMode}
            onSaveToFlash={() => {
              void ja11Engine
                .commitToFlash()
                .then(() => showToast('Đã ghi cứng chế độ hiện tại vào Flash ROM!'))
                .catch((err) => showToast(err instanceof Error ? err.message : String(err)));
            }}
            onRevert={() => void ja11Engine.revertToSavedSnapshot()}
            onToggleInlineMic={(en) => void ja11Engine.setInlineMic(en)}
            onChangeUacMode={(m) => void ja11Engine.setUacMode(m)}
            onFactoryReset={() => {
              void ja11Engine
                .factoryResetPeq()
                .then(() => {
                  setActiveProfileName('Mặc định xuất xưởng');
                  showToast('Đã khôi phục thông số PEQ xuất xưởng!');
                });
            }}
          />
        )}
      </main>

      {/* Persistent 4-Tab Bottom Navigation Bar */}
      <BottomNavBar activeTab={activeTab} onSelectTab={setActiveTab} />
    </div>
  );
};
