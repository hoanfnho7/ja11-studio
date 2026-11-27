import React from 'react';
import { Usb, Unplug, RotateCcw, Save, Smartphone, Mic, MicOff, Cpu } from 'lucide-react';
import { EQ_PRESET_NAMES, UAC_MODE_NAMES } from '../core/ja11Protocol';
import { EngineState } from '../core/liveSyncEngine';
import { isRunningInsideAndroidApk } from '../transports/androidUsbTransport';

interface Props {
  engineState: EngineState;
  onConnect: () => void;
  onDisconnect: () => void;
  onRevert: () => void;
  onSaveToFlash: () => void;
  onChangeEqMode: (code: number) => void;
  onToggleInlineMic: (enabled: boolean) => void;
  onChangeUacMode: (mode: number) => void;
}

const MODE_SHORT_VI = ['Vocal', 'Classic', 'Bass', 'User 1', 'Tắt EQ'];

/**
 * Non-wrapping Pro Studio Top Bar optimized for 1920x1080 (16:9) and responsive desktop screens.
 * Never breaks layout when JA11 connects or when RAM/Flash action buttons appear!
 */
export const HardwareControlBar: React.FC<Props> = ({
  engineState,
  onConnect,
  onDisconnect,
  onRevert,
  onSaveToFlash,
  onChangeEqMode,
  onToggleInlineMic,
  onChangeUacMode,
}) => {
  const { hardware, hasUnsavedRamChanges, isSyncing } = engineState;

  return (
    <header className="space-y-2">
      {/* Row 1: Locked Single-Row Studio Header (zero wrapping/overflow on 1280px..1920px!) */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3">
        {/* Left: Brand + Device Telemetry Pill */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                hardware.connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
              }`}
            />
            <span className="font-bold text-sm tracking-tight text-slate-100 whitespace-nowrap">
              {hardware.connected ? hardware.productName : 'FiiO JA11 Studio'}
            </span>
          </div>

          {hardware.connected && (
            <div className="hidden md:inline-flex items-center divide-x divide-slate-800 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono shrink-0">
              <span className="px-2 py-0.5 text-cyan-300">{hardware.firmwareVersion}</span>
              <span className="px-2 py-0.5 text-emerald-300">{hardware.sampleRate}</span>
              <span className="px-2 py-0.5 text-slate-400">
                {hardware.transportName === 'android-usb' ? 'OTG' : 'WebHID'}
              </span>
            </div>
          )}

          {hardware.connected && (
            <span
              className={`hidden lg:inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap ${
                hasUnsavedRamChanges
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {hasUnsavedRamChanges ? '⚡ RAM Live (Chưa lưu Flash)' : '✓ Khớp Flash'}
            </span>
          )}
        </div>

        {/* Center (16:9 Widescreen >= 1280px): 5 Hardware Modes right inside the Top Bar */}
        {hardware.connected && (
          <div className="hidden xl:flex items-center gap-1 bg-slate-950/90 p-1 rounded-lg border border-slate-800 shrink-0">
            {EQ_PRESET_NAMES.map((name, idx) => {
              const active = hardware.eqPreset === idx;
              return (
                <button
                  key={name}
                  disabled={isSyncing}
                  onClick={() => onChangeEqMode(idx)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                    active
                      ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {MODE_SHORT_VI[idx] ?? name}
                </button>
              );
            })}
          </div>
        )}

        {/* Right: Hardware I/O Toggles + Revert/Save + APK + Connect/Disconnect */}
        <div className="flex items-center gap-1.5 shrink-0">
          {hardware.connected && (
            <>
              <button
                onClick={() => onToggleInlineMic(!hardware.inlineControl)}
                disabled={isSyncing}
                className={`hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                  hardware.inlineControl
                    ? 'bg-cyan-500/10 border-cyan-500/35 text-cyan-300'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
                title="Bật/Tắt Inline Mic 3.5mm CTIA (tắt để nhận DAC thuần)"
              >
                {hardware.inlineControl ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>Mic</span>
              </button>

              <button
                onClick={() => onChangeUacMode(hardware.uacMode === 1 ? 0 : 1)}
                disabled={isSyncing}
                className="hidden sm:inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-white text-[11px] font-mono whitespace-nowrap cursor-pointer disabled:opacity-40"
                title="Chuyển đổi chuẩn USB Audio Class 1.0 / 2.0"
              >
                <Cpu className="w-3.5 h-3.5 text-slate-400" />
                <span>{UAC_MODE_NAMES[hardware.uacMode] ?? 'UAC 2.0'}</span>
              </button>

              <button
                onClick={onRevert}
                disabled={isSyncing || !hasUnsavedRamChanges}
                className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-35 transition inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                title="Trả âm thanh về nguyên trạng cấu hình gốc lúc mới cắm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Hoàn tác</span>
              </button>

              {hardware.eqPreset === 3 && (
                <button
                  onClick={onSaveToFlash}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition inline-flex items-center gap-1 whitespace-nowrap cursor-pointer shadow-sm"
                  title="Ghi cứng User 1 vào Flash ROM JA11 (chip chớp khởi động lại ~1s)"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Lưu Flash</span>
                </button>
              )}
            </>
          )}

          {!isRunningInsideAndroidApk() && (
            <a
              href="https://github.com/hoanfnho7/ja11-studio/releases/latest/download/JA11-Studio-v3.1.apk"
              target="_blank"
              rel="noreferrer"
              title="Tải App Android Native v3.1 (.APK)"
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-cyan-500/35 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition inline-flex items-center gap-1 whitespace-nowrap"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span className="hidden 2xl:inline">APK v3.1</span>
            </a>
          )}

          {!hardware.connected ? (
            <button
              onClick={onConnect}
              className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-sm"
            >
              <Usb className="w-3.5 h-3.5" />
              <span>Kết nối JA11</span>
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="p-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition cursor-pointer"
              title="Ngắt kết nối USB"
            >
              <Unplug className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Compact Secondary Hardware Modes Bar for screens < 1280px */}
      {hardware.connected && (
        <div className="flex xl:hidden flex-wrap items-center justify-between gap-2 bg-slate-900/75 border border-slate-800 rounded-xl px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-slate-400 font-medium">Chế độ chip:</span>
            {EQ_PRESET_NAMES.map((name, idx) => {
              const active = hardware.eqPreset === idx;
              return (
                <button
                  key={name}
                  disabled={isSyncing}
                  onClick={() => onChangeEqMode(idx)}
                  className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer disabled:opacity-50 ${
                    active
                      ? 'bg-cyan-500 text-slate-950 font-semibold'
                      : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                  }`}
                >
                  {MODE_SHORT_VI[idx] ?? name}
                </button>
              );
            })}
          </div>
          <span className="font-mono text-[11px] text-slate-400 truncate max-w-full">
            {engineState.lastMessage}
          </span>
        </div>
      )}
    </header>
  );
};
