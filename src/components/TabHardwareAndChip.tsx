import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  Gamepad2,
  Mic,
  RotateCcw,
  Save,
  Sliders,
  Sparkles,
  Usb,
  X,
} from 'lucide-react';
import { EQ_PRESET_NAMES } from '../core/ja11Protocol';
import { EngineState } from '../core/liveSyncEngine';
import { InteractiveEqCanvas } from './InteractiveEqCanvas';

interface Props {
  engineState: EngineState;
  onChangeEqMode: (presetCode: number) => void;
  onSaveToFlash: () => void;
  onRevert: () => void;
  onToggleInlineMic: (enabled: boolean) => void;
  onChangeUacMode: (modeCode: number) => void;
  onFactoryReset: () => void;
}

const NVRAM_MODES = [
  { code: 3, badge: 'U1', title: 'User 1', desc: 'Bộ nhớ PEQ 5-Band tùy chỉnh riêng' },
  { code: 0, badge: 'VC', title: 'Vocal', desc: 'Tôn giọng hát ca sĩ rõ nét' },
  { code: 2, badge: 'BS', title: 'Bass Boost', desc: 'Tăng lực dải trầm sôi động' },
  { code: 1, badge: 'CL', title: 'Classic', desc: 'Cân bằng nhạc cụ cổ điển' },
  { code: 4, badge: 'BY', title: 'Tắt EQ (Hardware Bypass)', desc: 'Xuất âm mộc phẳng 0 dB' },
] as const;

export const TabHardwareAndChip: React.FC<Props> = ({
  engineState,
  onChangeEqMode,
  onSaveToFlash,
  onRevert,
  onToggleInlineMic,
  onChangeUacMode,
  onFactoryReset,
}) => {
  const { hardware, livePeq, savedFlashSnapshot, hasUnsavedRamChanges, isSyncing } = engineState;
  const [showStickyCurve, setShowStickyCurve] = useState(true);
  const [showResetModal, setShowResetModal] = useState(false);

  const isBypassed = hardware.eqPreset === 4;
  const activeModeLabel = EQ_PRESET_NAMES[hardware.eqPreset] ?? 'User 1';

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Sticky Live PEQ Curve Monitor so switching Vocal / Bass / Classic / User 1 shows immediate curve change! */}
      <div className="sticky top-14 z-30 -mx-1 px-1 pt-0.5 pb-1.5 bg-surface/95 backdrop-blur-md border-b border-surface-variant/30">
        <div className="bg-surface-container-low rounded-xl p-2.5 border border-surface-variant/50 shadow-md flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-secondary-container shrink-0" />
              <span className="font-mono text-[10px] text-on-surface-variant uppercase">
                Đáp tuyến Chip:
              </span>
              <span className="font-mono text-[11px] font-bold text-primary truncate">
                {activeModeLabel}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setShowStickyCurve((v) => !v)}
              className="px-2 py-0.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-mono text-[10px] flex items-center gap-1 cursor-pointer"
            >
              {showStickyCurve ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              <span>{showStickyCurve ? 'Thu gọn' : 'Hiện đồ thị'}</span>
            </button>
          </div>

          {showStickyCurve && (
            <InteractiveEqCanvas
              compact
              livePeq={livePeq}
              savedSnapshot={savedFlashSnapshot}
              isBypassed={isBypassed}
            />
          )}
        </div>
      </div>

      {/* 1. Hardware & Chipset Status Card */}
      <section className="w-full bg-surface-container-low rounded-xl p-3.5 border border-surface-variant/40 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              {hardware.connected && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary-fixed opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  hardware.connected ? 'bg-tertiary' : 'bg-outline'
                }`}
              />
            </span>
            <span
              className={`font-mono text-[11px] tracking-wider font-semibold uppercase truncate ${
                hardware.connected ? 'text-tertiary' : 'text-on-surface-variant'
              }`}
            >
              {hardware.connected ? 'DSP Active • Trực tiếp phần cứng' : 'Chưa kết nối USB-C JA11'}
            </span>
          </div>
          <span className="font-mono text-[9px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded shrink-0">
            REG 0x00: JA11_SOC
          </span>
        </div>

        <div className="flex items-center justify-between pt-0.5">
          <div className="flex flex-col">
            <div className="flex items-baseline gap-2">
              <span className="font-sans text-[20px] font-bold text-on-surface tracking-tight">
                FiiO Custom DSP
              </span>
              <span className="font-mono text-[9px] text-primary-container bg-surface-container px-1.5 py-0.5 rounded uppercase font-semibold">
                FLASH ROM
              </span>
            </div>
            <span className="text-[12px] text-on-surface-variant">
              {hardware.connected
                ? `${hardware.productName} • DAC & PEQ phần cứng 5-Band`
                : 'Bộ giải mã tích hợp DAC & PEQ rời 5-Band'}
            </span>
          </div>

          <div className="w-11 h-11 rounded-lg bg-surface-container-high border border-surface-variant/50 flex items-center justify-center text-primary-container shrink-0">
            <Cpu className="w-6 h-6" />
          </div>
        </div>

        {/* 4 Telemetry Tiles */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <div className="bg-surface-container p-2.5 rounded-lg flex flex-col justify-between">
            <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
              Vi mã (Firmware)
            </span>
            <div className="flex items-center justify-between mt-1 gap-1">
              <span className="font-mono text-[12px] font-bold text-on-surface">
                {hardware.connected && hardware.firmwareVersion !== '--'
                  ? hardware.firmwareVersion
                  : 'KT02H20'}
              </span>
              <span className="font-mono text-[9px] text-tertiary flex items-center gap-0.5">
                <CheckCircle2 className="w-3 h-3" /> Chuẩn
              </span>
            </div>
          </div>

          <div className="bg-surface-container p-2.5 rounded-lg flex flex-col justify-between">
            <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
              Bộ nhớ NVRAM
            </span>
            <div className="flex items-center justify-between mt-1 gap-1">
              <span className="font-mono text-[12px] font-bold text-on-surface">
                {hasUnsavedRamChanges ? 'RAM Tạm' : 'Đồng bộ'}
              </span>
              <span
                className={`font-mono text-[9px] ${
                  hasUnsavedRamChanges ? 'text-primary' : 'text-secondary-fixed-dim'
                }`}
              >
                {hasUnsavedRamChanges ? 'Chưa lưu' : 'An toàn'}
              </span>
            </div>
          </div>

          <div className="bg-surface-container p-2.5 rounded-lg flex flex-col justify-between">
            <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
              Băng thông tối đa
            </span>
            <div className="flex items-center justify-between mt-1 gap-1">
              <span className="font-mono text-[12px] font-bold text-on-surface">
                {hardware.connected && hardware.sampleRate !== '--'
                  ? hardware.sampleRate
                  : '384kHz / 32b'}
              </span>
              <span className="font-mono text-[9px] text-primary-fixed-dim">DSD128</span>
            </div>
          </div>

          <div className="bg-surface-container p-2.5 rounded-lg flex flex-col justify-between">
            <span className="font-mono text-[9px] text-on-surface-variant uppercase tracking-wider">
              Giao thức âm thanh
            </span>
            <div className="flex items-center justify-between mt-1 gap-1">
              <span className="font-mono text-[12px] font-bold text-secondary-fixed-dim">
                {hardware.uacMode === 0 ? 'UAC 1.0' : 'UAC 2.0'}
              </span>
              <span className="font-mono text-[9px] text-on-surface-variant">
                {hardware.transportName === 'android-usb'
                  ? 'OTG USB'
                  : hardware.transportName === 'webhid'
                    ? 'WebHID'
                    : 'USB-C'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Hardware NVRAM Preset Selector */}
      <section className="w-full bg-surface-container-low rounded-xl p-3.5 border border-surface-variant/40 flex flex-col gap-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Save className="w-4 h-4 text-primary-container" />
            <span className="font-sans text-[15px] font-semibold text-on-surface">
              Bộ nhớ Flash phần cứng
            </span>
          </div>
          <span className="font-mono text-[9px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
            NVRAM 0x16
          </span>
        </div>

        <div className="flex flex-col gap-1.5">
          {NVRAM_MODES.map((m) => {
            const active = hardware.eqPreset === m.code;
            return (
              <button
                key={m.code}
                type="button"
                disabled={isSyncing}
                onClick={() => onChangeEqMode(m.code)}
                className={`w-full rounded-lg px-3 py-2.5 flex items-center justify-between text-left transition active:scale-[0.99] cursor-pointer border ${
                  active
                    ? 'bg-surface-container-high border-primary-container/50'
                    : 'bg-surface-container hover:bg-surface-container-high border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className={`w-7 h-7 rounded flex items-center justify-center font-mono text-[11px] font-bold shrink-0 ${
                      active
                        ? 'bg-primary-container text-on-primary-container'
                        : 'bg-surface-container-highest text-on-surface-variant'
                    }`}
                  >
                    {m.badge}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[12px] font-bold text-on-surface truncate">
                        {m.title}
                      </span>
                      {active && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-primary text-on-primary font-bold shrink-0">
                          Đang chạy
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-on-surface-variant truncate">{m.desc}</span>
                  </div>
                </div>

                <div
                  className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    active ? 'border-primary-container' : 'border-outline'
                  }`}
                >
                  {active && <span className="w-2 h-2 rounded-full bg-primary-container" />}
                </div>
              </button>
            );
          })}
        </div>

        {/* Commit to SPI Flash Action Bar */}
        {hardware.connected && (
          <div className="pt-1 flex flex-col gap-2 border-t border-surface-variant/30">
            <div className="flex items-center gap-2">
              {hasUnsavedRamChanges && (
                <button
                  type="button"
                  onClick={onRevert}
                  className="min-h-[40px] px-3 py-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-on-surface font-mono text-[10px] flex items-center justify-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Hoàn tác</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSyncing}
                onClick={onSaveToFlash}
                className="flex-1 min-h-[40px] px-3 py-2 rounded-lg bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-mono text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Lưu cứng {activeModeLabel} vào Flash ROM</span>
              </button>
            </div>
            <span className="font-mono text-[10px] text-on-surface-variant leading-snug">
              Lưu ý: Khi ghi cứng vào SPI Flash (0x19), chip JA11 sẽ tự chớp ngắt USB ~1 giây để khóa dữ liệu vĩnh viễn.
            </span>
          </div>
        )}
      </section>

      {/* 3. Hardware Switches (Inline Mic & UAC 1.0 / 2.0) */}
      <section className="w-full bg-surface-container-low rounded-xl p-3.5 border border-surface-variant/40 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-secondary-fixed-dim" />
            <span className="font-sans text-[15px] font-semibold text-on-surface">
              Giao thức &amp; Đàm thoại
            </span>
          </div>
          <span className="font-mono text-[9px] text-on-surface-variant bg-surface-container px-1.5 py-0.5 rounded">
            I/O CONFIG
          </span>
        </div>

        {/* Inline Mic Switch */}
        <div className="bg-surface-container p-3 rounded-lg flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <div className="flex items-center gap-1.5">
              <Mic className="w-4 h-4 text-primary-container shrink-0" />
              <span className="font-mono text-[12px] font-semibold text-on-surface truncate">
                Inline Mic (3.5mm CTIA)
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant">
              Tắt nếu dùng IEM thuần nghe nhạc để triệt nhiễu nền
            </span>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={hardware.inlineControl}
            disabled={!hardware.connected}
            onClick={() => onToggleInlineMic(!hardware.inlineControl)}
            className={`w-12 h-7 rounded-full p-0.5 transition-colors duration-200 shrink-0 flex items-center cursor-pointer disabled:opacity-50 ${
              hardware.inlineControl
                ? 'bg-primary-container justify-end'
                : 'bg-surface-container-highest justify-start'
            }`}
          >
            <span
              className={`w-6 h-6 rounded-full shadow-md flex items-center justify-center ${
                hardware.inlineControl ? 'bg-on-primary-container' : 'bg-surface-container-low'
              }`}
            >
              {hardware.inlineControl ? (
                <Check className="w-3.5 h-3.5 text-primary-container" />
              ) : (
                <X className="w-3.5 h-3.5 text-on-surface-variant" />
              )}
            </span>
          </button>
        </div>

        {/* UAC 2.0 vs UAC 1.0 Selector */}
        <div className="bg-surface-container p-3 rounded-lg flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Usb className="w-4 h-4 text-secondary-fixed-dim" />
              <span className="font-mono text-[12px] font-semibold text-on-surface">
                Chuẩn USB Audio
              </span>
            </div>
            <span className="font-mono text-[10px] text-secondary-fixed-dim uppercase font-bold">
              {hardware.uacMode === 0 ? 'UAC 1.0 (CONSOLE)' : 'UAC 2.0 (HI-RES)'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 bg-surface-container-high p-1 rounded-lg">
            <button
              type="button"
              disabled={!hardware.connected}
              onClick={() => onChangeUacMode(1)}
              className={`min-h-[40px] py-2 px-2 rounded font-mono text-[10px] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                hardware.uacMode !== 0
                  ? 'bg-surface-container-lowest text-on-surface font-bold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-secondary-fixed-dim shrink-0" />
              <span className="truncate">UAC 2.0 (384k)</span>
            </button>

            <button
              type="button"
              disabled={!hardware.connected}
              onClick={() => onChangeUacMode(0)}
              className={`min-h-[40px] py-2 px-2 rounded font-mono text-[10px] flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-50 ${
                hardware.uacMode === 0
                  ? 'bg-surface-container-lowest text-on-surface font-bold shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface font-medium'
              }`}
            >
              <Gamepad2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">UAC 1.0 (PS5/Switch)</span>
            </button>
          </div>
        </div>
      </section>

      {/* 4. Factory Reset Button */}
      <div className="pt-1 pb-2 flex flex-col items-center">
        <button
          type="button"
          onClick={() => setShowResetModal(true)}
          className="w-full min-h-[44px] py-2.5 px-3.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high border border-surface-variant/40 active:scale-[0.99] transition flex items-center justify-center gap-2 text-on-surface-variant hover:text-error cursor-pointer"
        >
          <RotateCcw className="w-4 h-4" />
          <span className="font-mono text-[11px] font-medium">
            Khôi phục vi mã xuất xưởng (Factory Reset)
          </span>
        </button>
        <span className="font-mono text-[9px] text-outline mt-2 text-center">
          FiiO JA11 USB-C Portable DAC/Amp • Acoustic Precision Studio v2.0
        </span>
      </div>

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-high max-w-[360px] w-full p-4 rounded-xl border border-surface-variant shadow-2xl flex flex-col gap-3">
            <div className="flex items-center gap-2 text-error">
              <AlertTriangle className="w-5 h-5" />
              <span className="font-sans text-[16px] font-semibold">Khôi phục gốc chip?</span>
            </div>
            <p className="text-[13px] text-on-surface leading-relaxed">
              Thao tác này sẽ đưa thông số 5-Band EQ trên JA11 về mặc định xuất xưởng (0 dB). Các cấu hình bạn đã cất trong Kho Offline vẫn được giữ nguyên.
            </p>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                className="px-3.5 py-2 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface font-mono text-[11px] cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowResetModal(false);
                  onFactoryReset();
                }}
                className="px-3.5 py-2 rounded-lg bg-error-container text-on-error-container font-mono text-[11px] font-bold cursor-pointer"
              >
                Xóa và nạp lại
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
