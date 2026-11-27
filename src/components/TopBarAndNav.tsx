import React from 'react';
import {
  ArrowLeftRight,
  AudioWaveform,
  Cpu,
  Download,
  FolderKanban,
  SlidersHorizontal,
  Unplug,
} from 'lucide-react';
import { EngineState } from '../core/liveSyncEngine';
import { isRunningInsideAndroidApk } from '../transports/androidUsbTransport';

export type AppTab = 'eq' | 'sweep' | 'profiles' | 'hardware';

const TAB_SUBTITLES: Record<AppTab, string> = {
  eq: 'Eq & Volume',
  sweep: 'Ear Peak Sweep',
  profiles: 'Profiles & Xml',
  hardware: 'Hardware & Chip',
};

interface TopBarProps {
  activeTab: AppTab;
  engineState: EngineState;
  onConnect: () => void;
  onDisconnect: () => void;
  onToggleEqBypass: () => void;
}

export const TopAppBar: React.FC<TopBarProps> = ({
  activeTab,
  engineState,
  onConnect,
  onDisconnect,
  onToggleEqBypass,
}) => {
  const { hardware } = engineState;
  const isEqEnabled = hardware.eqPreset !== 4;

  return (
    <header className="sticky top-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-xl border-b border-surface-variant/35 pt-safe">
      <div className="h-14 px-3.5 max-w-[560px] lg:max-w-5xl mx-auto flex items-center justify-between gap-2">
        {/* Left Brand & Active Screen Subtitle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-surface-container-low border border-surface-variant/60 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 32 32" className="w-5 h-5">
              <path
                d="M3 19 C7 9, 11 24, 16 14 C21 5, 25 22, 29 12"
                fill="none"
                stroke="#ff9f0a"
                strokeWidth="2.6"
                strokeLinecap="round"
              />
              <circle cx="22" cy="11" r="2.2" fill="#00eefc" />
            </svg>
          </div>

          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-sans text-[16px] font-semibold tracking-tight text-on-surface leading-none">
                FiiO JA11
              </span>
              <span className="font-mono text-[9px] font-semibold uppercase px-1 py-0.5 rounded bg-surface-container-high text-secondary-fixed-dim leading-none">
                DSP
              </span>
            </div>
            <span className="font-mono text-[10px] text-on-surface-variant truncate mt-0.5">
              {TAB_SUBTITLES[activeTab]}
            </span>
          </div>
        </div>

        {/* Right Connection & Instant A/B EQ Bypass */}
        <div className="flex items-center gap-1.5 shrink-0">
          {!isRunningInsideAndroidApk() && (
            <a
              href="https://github.com/hoanfnho7/ja11-studio/releases/latest/download/JA11-Studio-v3.0.apk"
              target="_blank"
              rel="noreferrer"
              title="Tải ứng dụng Android Native 120Hz (JA11-Studio-v3.0.apk)"
              className="h-9 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container border border-surface-variant/60 flex items-center gap-1 text-secondary-fixed hover:text-primary transition"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="font-mono text-[10px] font-semibold hidden sm:inline">APK</span>
            </a>
          )}
          {!hardware.connected ? (
            <button
              onClick={onConnect}
              type="button"
              className="h-9 px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-surface-variant/60 active:scale-[0.98] transition flex items-center gap-1.5 cursor-pointer"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-container opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-container" />
              </span>
              <span className="font-mono text-[11px] font-medium text-on-surface">Kết nối</span>
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <div className="h-9 px-2.5 rounded-lg bg-surface-container-low border border-surface-variant/50 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-secondary-fixed-dim opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-secondary-fixed-dim" />
                </span>
                <span className="font-mono text-[11px] font-medium text-on-surface hidden sm:inline">
                  Đã kết nối
                </span>
              </div>
              <button
                onClick={onDisconnect}
                type="button"
                title="Ngắt kết nối USB"
                className="h-9 w-8 rounded-lg bg-surface-container-low hover:bg-surface-container border border-surface-variant/50 flex items-center justify-center text-on-surface-variant hover:text-error cursor-pointer"
              >
                <Unplug className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={onToggleEqBypass}
            type="button"
            title="Bật/Tắt EQ nhanh để so sánh A/B trực tiếp"
            className={`h-9 px-2.5 rounded-lg font-mono text-[11px] font-semibold tracking-wider uppercase flex items-center gap-1.5 active:scale-[0.98] transition cursor-pointer ${
              isEqEnabled
                ? 'bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container shadow-[0_0_12px_rgba(255,159,10,0.28)]'
                : 'bg-surface-container-high text-on-surface-variant border border-surface-variant'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{isEqEnabled ? 'EQ BẬT' : 'EQ TẮT'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

interface BottomNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
}

export const BottomNavBar: React.FC<BottomNavProps> = ({ activeTab, onSelectTab }) => {
  const items: Array<{ id: AppTab; label: string; Icon: React.FC<{ className?: string }> }> = [
    { id: 'eq', label: 'EQ & Âm lượng', Icon: SlidersHorizontal },
    { id: 'sweep', label: 'Dò đỉnh tai', Icon: AudioWaveform },
    { id: 'profiles', label: 'Kho Profile', Icon: FolderKanban },
    { id: 'hardware', label: 'Phần cứng', Icon: Cpu },
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-surface/95 backdrop-blur-xl border-t border-surface-variant/40 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.5)]">
      <div className="flex justify-around items-center h-15 py-1.5 max-w-[560px] lg:max-w-3xl mx-auto px-1.5 gap-1">
        {items.map(({ id, label, Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onSelectTab(id)}
              className={`flex flex-col items-center justify-center min-h-[44px] w-full py-1 px-1 rounded-lg transition-all gap-0.5 cursor-pointer ${
                active
                  ? 'text-primary-container bg-surface-container-high/70 font-semibold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" />
              <span className="font-mono text-[10px] tracking-tight truncate max-w-full">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
