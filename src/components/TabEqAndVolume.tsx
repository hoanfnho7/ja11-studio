import React from 'react';
import { CheckCircle2, RotateCcw, Save, Sliders, Sparkles, Upload } from 'lucide-react';
import { computePeakResponseDb } from '../core/biquadMath';
import { DEFAULT_NEUTRAL_BANDS, EQ_PRESET_NAMES, FilterType, PeqBand, PeqProfile } from '../core/ja11Protocol';
import { EngineState } from '../core/liveSyncEngine';
import { InteractiveEqCanvas } from './InteractiveEqCanvas';

const BAND_NAMES_VI = [
  'Bass Nền',
  'Trung Trầm',
  'Giọng Hát',
  'Cắt Chói Tai',
  'Âm Trường Cao',
] as const;

interface Props {
  engineState: EngineState;
  selectedBand: number;
  onSelectBand: (idx: number) => void;
  onChangeBand: (idx: number, patch: Partial<PeqBand>) => void;
  onChangeDeviceVolume: (vol: number) => void;
  onChangeMasterGain: (gain: number) => void;
  onChangeEqMode: (code: number) => void;
  onRevert: () => void;
  onResetFlat: () => void;
  onSaveToChip: () => void;
  onOpenImportXml: () => void;
  quickProfiles: PeqProfile[];
  activeProfileName: string;
  onQuickApplyProfile: (p: PeqProfile) => void;
  activeSweepHz: number | null;
}

export const TabEqAndVolume: React.FC<Props> = ({
  engineState,
  selectedBand,
  onSelectBand,
  onChangeBand,
  onChangeDeviceVolume,
  onChangeMasterGain,
  onChangeEqMode,
  onRevert,
  onResetFlat,
  onSaveToChip,
  onOpenImportXml,
  quickProfiles,
  activeProfileName,
  onQuickApplyProfile,
  activeSweepHz,
}) => {
  const { hardware, livePeq, savedFlashSnapshot, hasUnsavedRamChanges, isSyncing } = engineState;
  const headroom = computePeakResponseDb(livePeq);
  const clippingRisk = headroom.maxNetOutputDb > 0.2;
  const isBypassed = hardware.eqPreset === 4;

  const volPct = Math.max(0, Math.min(100, (hardware.deviceVolume / 60) * 100));
  const preampPct = Math.max(0, Math.min(100, ((livePeq.masterGain - -12) / (12 - -12)) * 100));

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* 1. Status & Format Telemetry Strip */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-surface-container-low/90 rounded-lg border border-surface-variant/40">
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            {hardware.connected && (
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-tertiary opacity-75" />
            )}
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                hardware.connected
                  ? 'bg-tertiary shadow-[0_0_6px_rgba(83,236,111,0.6)]'
                  : 'bg-outline'
              }`}
            />
          </span>
          <span className="font-mono text-[10px] font-semibold tracking-wider uppercase text-on-surface truncate">
            {hardware.connected
              ? hasUnsavedRamChanges
                ? 'DSP RAM LIVE (CHƯA LƯU CHIP)'
                : 'DSP ONLINE'
              : 'CHẾ ĐỘ OFFLINE'}
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary-fixed-dim">
            {hardware.connected && hardware.sampleRate !== '--' ? hardware.sampleRate : '384kHz'}
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-highest text-primary font-semibold">
            {hardware.connected && hardware.firmwareVersion !== '--' ? hardware.firmwareVersion : '32-BIT'}
          </span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant">
            {hardware.uacMode === 0 ? 'UAC 1.0' : 'UAC 2.0'}
          </span>
        </div>
      </div>

      {/* 2. Visual PEQ Frequency Response Display + Quick Profile Switcher */}
      <section className="flex flex-col gap-2 p-3 bg-surface-container-low rounded-xl border border-surface-variant/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Sparkles className="w-4 h-4 text-primary-container shrink-0" />
            <span className="font-sans text-[15px] font-semibold tracking-tight text-on-surface truncate">
              Đáp Tuyến PEQ
            </span>
            {activeProfileName && (
              <span className="font-mono text-[10px] text-primary truncate max-w-[130px] sm:max-w-[220px]">
                • {activeProfileName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {hardware.connected && hasUnsavedRamChanges && (
              <button
                type="button"
                onClick={onRevert}
                className="flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-primary font-mono text-[10px] transition active:scale-95 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Hoàn tác</span>
              </button>
            )}
            <button
              type="button"
              onClick={onResetFlat}
              className="flex items-center gap-1 px-2 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface font-mono text-[10px] transition active:scale-95 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Đặt Flat (0 dB)</span>
            </button>
          </div>
        </div>

        <InteractiveEqCanvas
          livePeq={livePeq}
          savedSnapshot={savedFlashSnapshot}
          selectedBand={selectedBand}
          onSelectBand={onSelectBand}
          onChangeBand={onChangeBand}
          activeSweepHz={activeSweepHz}
          isBypassed={isBypassed}
        />

        {/* Horizontal Quick Mode & Saved Profile Rail right below Graph — see curve change immediately! */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 pt-0.5">
          {([
            { code: 3, label: 'User 1' },
            { code: 0, label: 'Vocal' },
            { code: 2, label: 'Bass' },
            { code: 1, label: 'Classic' },
          ] as const).map((m) => {
            const active = hardware.eqPreset === m.code;
            return (
              <button
                key={m.code}
                type="button"
                disabled={isSyncing}
                onClick={() => onChangeEqMode(m.code)}
                className={`px-2.5 py-1 rounded-md font-mono text-[10px] shrink-0 transition cursor-pointer ${
                  active
                    ? 'bg-primary-container text-on-primary-container font-bold'
                    : 'bg-surface-container text-on-surface-variant hover:text-on-surface border border-surface-variant/40'
                }`}
              >
                {m.label}
              </button>
            );
          })}

          <span className="h-3.5 w-px bg-surface-variant/60 shrink-0 mx-0.5" />

          {quickProfiles.slice(0, 6).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onQuickApplyProfile(p)}
              className={`px-2.5 py-1 rounded-md font-mono text-[10px] shrink-0 transition cursor-pointer border ${
                activeProfileName === p.name
                  ? 'bg-secondary-container/20 border-secondary-container/60 text-secondary-fixed font-semibold'
                  : 'bg-surface-container border-surface-variant/30 text-on-surface-variant hover:text-on-surface'
              }`}
            >
              ⚡ {p.name.replace(/^JD1 \+ JA11 \| /, '').replace(/^JD1 \| /, '')}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Hardware Volume & Master Preamp Stage (Tầng Xuất) */}
      <section className="flex flex-col gap-2.5 p-3 bg-surface-container-low rounded-xl border border-surface-variant/40">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-primary-container" />
            <span className="font-sans text-[15px] font-semibold tracking-tight text-on-surface">
              Tầng Xuất
            </span>
          </div>
          <span className="font-mono text-[10px] text-on-surface-variant tracking-wider">REG 0x02</span>
        </div>

        {/* DAC Hardware Volume 0..60 */}
        <div className="flex flex-col gap-2 p-2.5 bg-surface-container rounded-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium text-on-surface">Âm lượng DAC</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onChangeDeviceVolume(32)}
                className="px-2 py-0.5 rounded bg-surface-container-highest hover:bg-surface-bright text-secondary-fixed font-mono text-[10px] transition cursor-pointer"
              >
                32 (PC)
              </button>
              <div className="flex items-baseline gap-0.5 font-mono px-2 py-0.5 bg-surface-container-highest rounded">
                <span className="text-[12px] font-bold text-secondary-fixed">{hardware.deviceVolume}</span>
                <span className="text-[10px] text-on-surface-variant">/60</span>
              </div>
            </div>
          </div>

          <div className="relative flex items-center w-full h-5">
            <div className="absolute inset-x-0 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-secondary-fixed-dim transition-all duration-75"
                style={{ width: `${volPct}%` }}
              />
            </div>
            <input
              aria-label="DAC Hardware Volume"
              type="range"
              min={0}
              max={60}
              step={1}
              value={hardware.deviceVolume}
              onChange={(e) => onChangeDeviceVolume(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>
        </div>

        {/* Master Preamp -12..+12 dB */}
        <div className="flex flex-col gap-2 p-2.5 bg-surface-container rounded-lg">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] font-medium text-on-surface">Master Preamp</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  onChangeMasterGain(clippingRisk ? headroom.recommendedMasterGain : -12)
                }
                className="px-2 py-0.5 rounded bg-primary-container text-on-primary-container font-mono text-[10px] font-semibold hover:bg-primary-fixed-dim transition cursor-pointer"
              >
                {clippingRisk ? `Auto ${headroom.recommendedMasterGain}dB` : 'Safe -12dB'}
              </button>
              <span className="font-mono text-[12px] font-bold text-primary px-2 py-0.5 bg-surface-container-highest rounded">
                {livePeq.masterGain > 0 ? '+' : ''}
                {livePeq.masterGain.toFixed(1)} dB
              </span>
            </div>
          </div>

          <div className="relative flex items-center w-full h-5">
            <div className="absolute inset-x-0 h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
              <div
                className="h-full bg-primary-container transition-all duration-75"
                style={{ width: `${preampPct}%` }}
              />
            </div>
            <input
              aria-label="Master Preamp Gain"
              type="range"
              min={-12}
              max={12}
              step={0.1}
              value={livePeq.masterGain}
              onChange={(e) => onChangeMasterGain(Number(e.target.value))}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between font-mono text-[10px] text-on-surface-variant">
            <span>-12 dB</span>
            <span className={clippingRisk ? 'text-error font-semibold' : 'text-tertiary'}>
              {clippingRisk
                ? `Cảnh báo vượt đỉnh: +${headroom.maxNetOutputDb} dB`
                : `Headroom an toàn (${headroom.maxNetOutputDb} dB)`}
            </span>
            <span>+12 dB</span>
          </div>
        </div>
      </section>

      {/* 4. 5-Band Parametric Equalizer Channels */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="font-sans text-[15px] font-semibold tracking-tight text-on-surface">
            Băng Tần (5 Bands)
          </span>
          <span className="font-mono text-[10px] text-on-surface-variant uppercase">PRECISION PEQ</span>
        </div>

        {livePeq.bands.map((band, idx) => {
          const isSel = idx === selectedBand;
          const logSliderVal = Math.round(
            ((Math.log10(Math.max(20, band.freq)) - Math.log10(20)) /
              (Math.log10(20000) - Math.log10(20))) *
              1000,
          );

          return (
            <div
              key={idx}
              onClick={() => onSelectBand(idx)}
              className={`flex flex-col gap-2 p-2.5 rounded-xl border transition cursor-pointer ${
                isSel
                  ? 'bg-surface-container border-secondary-container/50 shadow-[0_0_12px_rgba(0,238,252,0.08)]'
                  : 'bg-surface-container-low border-surface-variant/40 hover:border-surface-variant'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded flex items-center justify-center font-mono text-[10px] font-bold ${
                      isSel
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-primary text-on-primary'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span
                    className={`text-[13px] font-semibold ${
                      isSel ? 'text-secondary-fixed' : 'text-on-surface'
                    }`}
                  >
                    {BAND_NAMES_VI[idx]}
                  </span>
                </div>

                {/* Segmented LSQ | PK | HSQ */}
                <div className="flex items-center gap-0.5 bg-surface-container-highest/60 p-0.5 rounded">
                  {(['LSQ', 'PK', 'HSQ'] as FilterType[]).map((ft) => {
                    const activeType = band.type === ft;
                    return (
                      <button
                        key={ft}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onChangeBand(idx, { type: ft });
                        }}
                        className={`px-2 py-0.5 rounded font-mono text-[10px] transition cursor-pointer ${
                          activeType
                            ? isSel
                              ? 'bg-secondary-container text-on-secondary-container font-bold'
                              : 'bg-primary-container text-on-primary-container font-bold'
                            : 'text-on-surface-variant hover:text-on-surface'
                        }`}
                      >
                        {ft}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 3 Compact Parameter Boxes: Freq | Gain | Q */}
              <div className="grid grid-cols-3 gap-1.5">
                {/* Freq */}
                <div className="flex flex-col p-1.5 bg-surface-container-highest/35 rounded-lg">
                  <div className="flex items-baseline justify-between font-mono gap-1">
                    <span className="text-[9px] text-on-surface-variant">Tần số</span>
                    <input
                      type="number"
                      min={20}
                      max={20000}
                      value={band.freq}
                      onChange={(e) => onChangeBand(idx, { freq: Number(e.target.value) })}
                      className="w-14 bg-transparent text-right text-[11px] font-semibold text-on-surface focus:outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1000}
                    value={logSliderVal}
                    onChange={(e) => {
                      const r = Number(e.target.value) / 1000;
                      const hz = Math.round(
                        Math.pow(10, Math.log10(20) + r * (Math.log10(20000) - Math.log10(20))),
                      );
                      onChangeBand(idx, { freq: hz });
                    }}
                    className="w-full h-1 mt-1.5 cursor-pointer"
                  />
                </div>

                {/* Gain */}
                <div className="flex flex-col p-1.5 bg-surface-container-highest/35 rounded-lg">
                  <div className="flex items-baseline justify-between font-mono gap-1">
                    <span className="text-[9px] text-on-surface-variant">Gain</span>
                    <input
                      type="number"
                      min={-12}
                      max={12}
                      step={0.1}
                      value={band.gain}
                      onChange={(e) => onChangeBand(idx, { gain: Number(e.target.value) })}
                      className={`w-12 bg-transparent text-right text-[11px] font-semibold focus:outline-none ${
                        band.gain < 0 ? 'text-error' : 'text-primary'
                      }`}
                    />
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.1}
                    value={band.gain}
                    onChange={(e) => onChangeBand(idx, { gain: Number(e.target.value) })}
                    className="w-full h-1 mt-1.5 cursor-pointer"
                  />
                </div>

                {/* Q */}
                <div className="flex flex-col p-1.5 bg-surface-container-highest/35 rounded-lg">
                  <div className="flex items-baseline justify-between font-mono gap-1">
                    <span className="text-[9px] text-on-surface-variant">Q</span>
                    <input
                      type="number"
                      min={0.1}
                      max={10}
                      step={0.05}
                      value={band.q}
                      onChange={(e) => onChangeBand(idx, { q: Number(e.target.value) })}
                      className="w-11 bg-transparent text-right text-[11px] font-semibold text-secondary-fixed focus:outline-none"
                    />
                  </div>
                  <input
                    type="range"
                    min={0.1}
                    max={10}
                    step={0.05}
                    value={band.q}
                    onChange={(e) => onChangeBand(idx, { q: Number(e.target.value) })}
                    className="w-full h-1 mt-1.5 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* 5. DAC Flash Memory Action Strip */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-surface-container-low rounded-xl border border-surface-variant/40">
        <div className="flex items-center gap-2 min-w-0">
          <CheckCircle2 className="w-4 h-4 text-tertiary shrink-0" />
          <span className="font-mono text-[11px] text-on-surface truncate">
            {engineState.lastMessage}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-2">
          <button
            type="button"
            onClick={onOpenImportXml}
            className="px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-on-surface font-mono text-[10px] border border-surface-variant/50 flex items-center gap-1 cursor-pointer"
          >
            <Upload className="w-3 h-3" />
            <span>Nạp XML</span>
          </button>

          {hardware.connected && hardware.eqPreset === 3 && (
            <button
              type="button"
              disabled={isSyncing}
              onClick={onSaveToChip}
              className="px-3 py-1.5 rounded-lg bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-mono text-[10px] font-bold flex items-center gap-1 shadow-sm disabled:opacity-50 cursor-pointer"
              title="Ghi cứng User 1 vào Flash ROM của JA11 để rút sang thiết bị khác vẫn nhớ"
            >
              <Save className="w-3 h-3" />
              <span>Lưu Chip</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
