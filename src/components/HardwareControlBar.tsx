import React from 'react';
import { Usb, Unplug, RotateCcw, Save, Volume2, ShieldAlert, Sparkles, Smartphone } from 'lucide-react';
import { computePeakResponseDb } from '../core/biquadMath';
import { EQ_PRESET_NAMES, UAC_MODE_NAMES } from '../core/ja11Protocol';
import { EngineState } from '../core/liveSyncEngine';
import { isRunningInsideAndroidApk } from '../transports/androidUsbTransport';

interface Props {
  engineState: EngineState;
  onConnect: () => void;
  onDisconnect: () => void;
  onRevert: () => void;
  onSaveToFlash: () => void;
  onChangeDeviceVolume: (vol: number) => void;
  onChangeMasterGain: (gain: number) => void;
  onChangeEqMode: (code: number) => void;
  onToggleInlineMic: (enabled: boolean) => void;
  onChangeUacMode: (mode: number) => void;
}

const MODE_LABELS_VI = ['Vocal', 'Classic', 'Bass', 'User 1 (Tùy chỉnh)', 'Tắt EQ'];

export const HardwareControlBar: React.FC<Props> = ({
  engineState,
  onConnect,
  onDisconnect,
  onRevert,
  onSaveToFlash,
  onChangeDeviceVolume,
  onChangeMasterGain,
  onChangeEqMode,
  onToggleInlineMic,
  onChangeUacMode,
}) => {
  const { hardware, livePeq, hasUnsavedRamChanges, isSyncing } = engineState;
  const headroom = computePeakResponseDb(livePeq);
  const clippingRisk = headroom.maxNetOutputDb > 0.2;

  return (
    <div className="space-y-3">
      {/* Top Status & Connection Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/90 border border-slate-800 rounded-xl p-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                hardware.connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]' : 'bg-slate-600'
              }`}
            />
            <span className="font-semibold text-sm text-slate-100">
              {hardware.connected ? hardware.productName : 'JA11 Studio'}
            </span>
          </div>

          {hardware.connected && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 font-mono">
                FW {hardware.firmwareVersion}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-emerald-300 font-mono">
                {hardware.sampleRate}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-slate-300">
                {hardware.transportName === 'android-usb' ? 'Android USB-C OTG' : 'WebHID USB'}
              </span>
            </div>
          )}

          {hardware.connected && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                hasUnsavedRamChanges
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
              }`}
            >
              {hasUnsavedRamChanges
                ? '⚡ Đang nghe thử trên RAM (Chưa ghi đè gốc)'
                : '✓ Đang khớp với bộ nhớ JA11'}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isRunningInsideAndroidApk() && (
            <a
              href="https://github.com/hoanfnho7/ja11-studio/releases/latest/download/JA11-Studio-v3.0.apk"
              target="_blank"
              rel="noreferrer"
              title="Tải ứng dụng JA11 Studio v3.0 thuần Native 120Hz cho điện thoại Android"
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-cyan-500/35 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 transition flex items-center gap-1.5"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Tải App Android (.APK)</span>
            </a>
          )}

          {hardware.connected && (
            <>
              <button
                onClick={onRevert}
                disabled={isSyncing || !hasUnsavedRamChanges}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 disabled:opacity-40 transition flex items-center gap-1.5 cursor-pointer"
                title="Trả âm thanh về nguyên trạng Profile gốc lúc mới cắm"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Hoàn tác gốc
              </button>
              {hardware.eqPreset === 3 && (
                <button
                  onClick={onSaveToFlash}
                  disabled={isSyncing}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500 text-slate-950 hover:bg-emerald-400 disabled:opacity-50 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  title="Ghi cứng cấu hình User 1 vào chip Flash JA11 để cắm máy khác vẫn nhớ (chip JA11 sẽ chớp khởi động lại ~1s khi ghi Flash)"
                >
                  <Save className="w-3.5 h-3.5" />
                  Lưu cứng User 1 vào Flash
                </button>
              )}
            </>
          )}

          {!hardware.connected ? (
            <button
              onClick={onConnect}
              className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 text-slate-950 hover:bg-cyan-400 transition flex items-center gap-1.5 cursor-pointer shadow-sm"
            >
              <Usb className="w-4 h-4" />
              Kết nối FiiO JA11
            </button>
          ) : (
            <button
              onClick={onDisconnect}
              className="px-2.5 py-1.5 rounded-lg text-xs border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-rose-300 hover:border-rose-500/40 transition flex items-center gap-1 cursor-pointer"
              title="Ngắt kết nối USB"
            >
              <Unplug className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 5 Hardware EQ Preset Modes Row (Vocal, Classic, Bass, User 1, Off) */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/70 border border-slate-800/90 rounded-xl px-3 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-slate-400 font-medium mr-1">Chế độ sẵn trong chip JA11:</span>
          {EQ_PRESET_NAMES.map((name, idx) => {
            const active = hardware.eqPreset === idx;
            return (
              <button
                key={name}
                disabled={isSyncing}
                onClick={() => onChangeEqMode(idx)}
                className={`px-2.5 py-1 rounded-lg font-medium transition cursor-pointer disabled:opacity-50 ${
                  active
                    ? 'bg-cyan-500 text-slate-950 font-semibold shadow-sm'
                    : 'bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700'
                }`}
              >
                {MODE_LABELS_VI[idx] ?? name}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => onToggleInlineMic(!hardware.inlineControl)}
            disabled={!hardware.connected || isSyncing}
            className={`px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer disabled:opacity-40 ${
              hardware.inlineControl
                ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300'
                : 'bg-slate-800 border-slate-700 text-slate-400'
            }`}
            title="Tắt Inline Mic giúp Windows nhận JA11 làm DAC thuần thay vì Headset"
          >
            Inline Mic: {hardware.inlineControl ? 'Bật' : 'Tắt'}
          </button>

          <button
            onClick={() => onChangeUacMode(hardware.uacMode === 1 ? 0 : 1)}
            disabled={!hardware.connected || isSyncing}
            className="px-2.5 py-1 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 text-[11px] cursor-pointer disabled:opacity-40"
            title="Chuyển đổi chuẩn USB Audio Class 1.0 hoặc 2.0"
          >
            {UAC_MODE_NAMES[hardware.uacMode] ?? 'UAC 2.0'}
          </button>
        </div>
      </div>

      {/* Hardware Volume (60 steps) + Master Gain Preamp */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 bg-slate-900/70 border border-slate-800/90 rounded-xl p-3 text-xs">
        <div className="lg:col-span-6 space-y-1.5 lg:border-r lg:border-slate-800 lg:pr-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-200 flex items-center gap-1.5">
              <Volume2 className="w-3.5 h-3.5 text-cyan-400" />
              Âm lượng phần cứng DAC (0–60)
            </span>
            <span className="font-mono font-semibold text-cyan-300">{hardware.deviceVolume} / 60</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={60}
              step={1}
              value={hardware.deviceVolume}
              onChange={(e) => onChangeDeviceVolume(Number(e.target.value))}
              className="flex-1 cursor-pointer"
            />
            <button
              onClick={() => onChangeDeviceVolume(32)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 shrink-0 cursor-pointer"
            >
              Mức êm PC (32)
            </button>
          </div>
        </div>

        <div className="lg:col-span-6 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-medium text-slate-200">Master Gain (Preamp)</span>
            <span className={`font-mono font-semibold ${clippingRisk ? 'text-rose-400' : 'text-emerald-300'}`}>
              {livePeq.masterGain > 0 ? '+' : ''}
              {livePeq.masterGain.toFixed(1)} dB
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-12}
              max={12}
              step={0.1}
              value={livePeq.masterGain}
              onChange={(e) => onChangeMasterGain(Number(e.target.value))}
              className="flex-1 cursor-pointer"
            />
            <button
              onClick={() => onChangeMasterGain(-12)}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 shrink-0 cursor-pointer"
            >
              -12dB
            </button>
            {clippingRisk && (
              <button
                onClick={() => onChangeMasterGain(headroom.recommendedMasterGain)}
                className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <ShieldAlert className="w-3 h-3" />
                Chống rè ({headroom.recommendedMasterGain}dB)
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Live Status Toast Line */}
      <div className="flex items-center gap-2 px-1 text-xs text-slate-400">
        <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
        <span className="truncate">{engineState.lastMessage}</span>
      </div>
    </div>
  );
};
