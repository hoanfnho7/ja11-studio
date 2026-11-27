import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookmarkPlus,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileDown,
  FileUp,
  Globe,
  Info,
  RefreshCw,
  Save,
  Search,
  Settings2,
  Terminal,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { parseFiioXml, serializeFiioXml } from '../core/fiioXml';
import { PeqBand, PeqProfile, PeqSnapshot } from '../core/ja11Protocol';
import {
  CloudSettings,
  loadCachedHandPicked,
  loadCloudSettings,
  saveCloudSettings,
  searchAutoEqInternational,
  syncFiioHandPickedPresets,
} from '../services/fiioCloud';
import {
  deleteVaultProfile,
  downloadProfileAsFiioXml,
  loadVaultProfiles,
  resetVaultDefaults,
  upsertVaultProfile,
} from '../services/presetVault';
import { InteractiveEqCanvas } from './InteractiveEqCanvas';

interface Props {
  livePeq: PeqSnapshot;
  savedSnapshot: PeqSnapshot | null;
  isBypassed: boolean;
  activeProfileName: string;
  vaultProfiles: PeqProfile[];
  onVaultChange: (next: PeqProfile[]) => void;
  onPreviewProfileLive: (profile: PeqProfile) => void;
  onOpenImportXml: () => void;
  onNotify: (msg: string) => void;
}

function formatFreqShort(hz: number): string {
  if (hz >= 1000) {
    const k = hz / 1000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(2))}k`;
  }
  return `${Math.round(hz)}Hz`;
}

function formatBandPill(b: PeqBand, idx: number): string {
  const g = b.gain > 0 ? `+${b.gain}` : `${b.gain}`;
  return `B${idx + 1}: ${formatFreqShort(b.freq)} ${g}dB`;
}

export const TabProfilesAndXml: React.FC<Props> = ({
  livePeq,
  savedSnapshot,
  isBypassed,
  activeProfileName,
  vaultProfiles,
  onVaultChange,
  onPreviewProfileLive,
  onOpenImportXml,
  onNotify,
}) => {
  const [sourceTab, setSourceTab] = useState<'offline' | 'online'>('offline');
  const [showStickyCurve, setShowStickyCurve] = useState(true);
  const [showSaveDrawer, setShowSaveDrawer] = useState(false);

  // Offline vault filter & save state
  const [offlineQuery, setOfflineQuery] = useState('');
  const [newName, setNewName] = useState('');
  const [newNote, setNewNote] = useState('');

  // Online FiiO Hand-Picked & AutoEQ state
  const [cloudQuery, setCloudQuery] = useState('');
  const [cloudItems, setCloudItems] = useState<PeqProfile[]>(() => loadCachedHandPicked());
  const [cloudNotice, setCloudNotice] = useState(
    'Kho trực tuyến FiiO Hand-Picked (814+ preset JA11) & AutoEQ 5.000+ mẫu IEM.',
  );
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudPage, setCloudPage] = useState(1);
  const [cloudTotal, setCloudTotal] = useState(0);
  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(() => loadCloudSettings());
  const [showRelayConfig, setShowRelayConfig] = useState(false);
  const [hasLoadedOnlineOnce, setHasLoadedOnlineOnce] = useState(false);

  // XML Source Inspector / Editor Modal state
  const [xmlModalProfile, setXmlModalProfile] = useState<PeqProfile | null>(null);
  const [xmlModalText, setXmlModalText] = useState('');

  const filteredOffline = useMemo(() => {
    const q = offlineQuery.trim().toLowerCase();
    if (!q) return vaultProfiles;
    return vaultProfiles.filter((p) => {
      const hay = `${p.name} ${p.description} ${p.author ?? ''} ${p.deviceModel ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [vaultProfiles, offlineQuery]);

  const fetchFiioOnline = async (queryText: string, page = 1, nextSettings = cloudSettings) => {
    setCloudLoading(true);
    try {
      const res = await syncFiioHandPickedPresets(queryText, nextSettings, page);
      setCloudItems(res.profiles);
      setCloudTotal(res.totalRows);
      setCloudPage(page);
      setCloudNotice(res.notice);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    } finally {
      setCloudLoading(false);
    }
  };

  const fetchAutoEqOnline = async () => {
    setCloudLoading(true);
    try {
      const res = await searchAutoEqInternational(cloudQuery);
      setCloudItems(res.profiles);
      setCloudTotal(res.profiles.length);
      setCloudPage(1);
      setCloudNotice(res.notice);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    } finally {
      setCloudLoading(false);
    }
  };

  useEffect(() => {
    if (sourceTab === 'online' && !hasLoadedOnlineOnce) {
      setHasLoadedOnlineOnce(true);
      void fetchFiioOnline(cloudQuery, 1);
    }
  }, [sourceTab]);

  const handleSaveCurrentToVault = () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      onNotify('Vui lòng nhập Tên Profile trước khi cất vào Kho Offline!');
      return;
    }
    const updated = upsertVaultProfile(livePeq, {
      name: trimmed,
      description: newNote.trim() || 'Tùy chỉnh từ bàn EQ JA11 Studio',
      category: 'personal',
      author: 'Bạn',
    });
    onVaultChange(updated);
    setNewName('');
    setNewNote('');
    setShowSaveDrawer(false);
    onNotify(`Đã cất "${trimmed}" vào Kho Offline!`);
  };

  const handleSaveCloudItemOffline = (p: PeqProfile) => {
    const updated = upsertVaultProfile(p, {
      name: p.name,
      description: p.description,
      category: 'personal',
      author: p.author || 'FiiO Cloud',
    });
    onVaultChange(updated);
    onNotify(`Đã lưu "${p.name}" vào Kho Offline!`);
  };

  const handleDeleteProfile = (p: PeqProfile) => {
    const updated = deleteVaultProfile(p.id);
    onVaultChange(updated);
    onNotify(`Đã xóa "${p.name}" khỏi Kho Offline.`);
  };

  const handleExportCurrentXml = () => {
    downloadProfileAsFiioXml({
      name: activeProfileName || 'JA11_Custom_EQ',
      description: 'Exported from FiiO JA11 Studio',
      masterGain: livePeq.masterGain,
      bands: livePeq.bands,
    });
    onNotify('Đã xuất cấu hình hiện tại ra file .XML chuẩn FiiO!');
  };

  const openXmlInspector = (p: PeqProfile) => {
    setXmlModalProfile(p);
    setXmlModalText(serializeFiioXml(p));
  };

  const handleApplyEditedXml = () => {
    try {
      const parsed = parseFiioXml(xmlModalText, xmlModalProfile?.name || 'Edited XML');
      onPreviewProfileLive(parsed);
      onNotify(`Đã áp dụng mã XML "${parsed.name}" trực tiếp vào DSP RAM!`);
      setXmlModalProfile(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : String(err));
    }
  };

  const activeList = sourceTab === 'offline' ? filteredOffline : cloudItems;
  const xmlLineCount = useMemo(() => Math.max(12, xmlModalText.split('\n').length), [xmlModalText]);

  return (
    <div className="flex flex-col gap-3 w-full">
      {/* Pinned / Sticky Mini PEQ Curve Monitor so user ALWAYS sees curve morph when tapping profiles! */}
      <div className="sticky top-14 z-30 -mx-1 px-1 pt-0.5 pb-1.5 bg-surface/95 backdrop-blur-md border-b border-surface-variant/30">
        <div className="bg-surface-container-low rounded-xl p-2.5 border border-surface-variant/50 shadow-md flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full bg-primary-container shrink-0" />
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-on-surface-variant shrink-0">
                Đáp tuyến Live:
              </span>
              <span className="font-mono text-[11px] font-bold text-primary truncate">
                {isBypassed ? 'EQ TẮT (0 dB)' : activeProfileName || 'Tùy chỉnh RAM'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-secondary-fixed">
                Pre {livePeq.masterGain > 0 ? '+' : ''}
                {livePeq.masterGain.toFixed(1)}dB
              </span>
              <button
                type="button"
                onClick={() => setShowStickyCurve((v) => !v)}
                className="px-2 py-0.5 rounded bg-surface-container-high hover:bg-surface-bright text-on-surface-variant hover:text-on-surface font-mono text-[10px] flex items-center gap-1 cursor-pointer"
              >
                {showStickyCurve ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                <span>{showStickyCurve ? 'Thu gọn' : 'Hiện đồ thị'}</span>
              </button>
            </div>
          </div>

          {showStickyCurve && (
            <InteractiveEqCanvas
              compact
              livePeq={livePeq}
              savedSnapshot={savedSnapshot}
              isBypassed={isBypassed}
            />
          )}
        </div>
      </div>

      {/* 1. Segmented Source Switcher */}
      <section className="flex p-1 rounded-xl bg-surface-container-low border border-surface-variant/40 gap-1">
        <button
          type="button"
          onClick={() => setSourceTab('offline')}
          className={`flex-1 min-h-[42px] py-2 px-2 rounded-lg font-mono text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer ${
            sourceTab === 'offline'
              ? 'bg-surface-container-high text-primary-fixed-dim font-bold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface font-medium'
          }`}
        >
          <Save className="w-4 h-4" />
          <span>Offline &amp; FiiO XML</span>
        </button>

        <button
          type="button"
          onClick={() => setSourceTab('online')}
          className={`flex-1 min-h-[42px] py-2 px-2 rounded-lg font-mono text-[11px] flex items-center justify-center gap-1.5 transition cursor-pointer ${
            sourceTab === 'online'
              ? 'bg-surface-container-high text-secondary-fixed font-bold shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface font-medium'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>FiiO Online Cloud</span>
        </button>
      </section>

      {/* 2. Import / Export XML Bar */}
      <section className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOpenImportXml}
          className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-secondary-fixed-dim border border-surface-variant/50 transition cursor-pointer"
        >
          <FileDown className="w-4 h-4 shrink-0" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider truncate">
            Nhập file .XML
          </span>
        </button>

        <button
          type="button"
          onClick={handleExportCurrentXml}
          className="min-h-[42px] flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-surface-container-high hover:bg-surface-container-highest active:scale-[0.98] text-primary-fixed-dim border border-surface-variant/50 transition cursor-pointer"
        >
          <FileUp className="w-4 h-4 shrink-0" />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider truncate">
            Xuất .XML hiện tại
          </span>
        </button>
      </section>

      {/* 3A. OFFLINE SEARCH + SAVE NEW PRESET MODULE */}
      {sourceTab === 'offline' ? (
        <>
          <div className="relative flex items-center w-full">
            <Search className="w-4 h-4 absolute left-3.5 text-outline pointer-events-none" />
            <input
              type="text"
              value={offlineQuery}
              onChange={(e) => setOfflineQuery(e.target.value)}
              placeholder="Lọc nhanh tên profile trong kho Offline..."
              className="w-full pl-10 pr-9 py-2.5 rounded-xl bg-surface-container-low border border-surface-variant/40 text-on-surface placeholder:text-on-surface-variant/60 text-[13px] focus:outline-none focus:border-primary-container transition"
            />
            {offlineQuery && (
              <button
                type="button"
                onClick={() => setOfflineQuery('')}
                className="absolute right-2.5 p-1 rounded text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Save New Preset Card (Collapsible for compact mobile browsing) */}
          <section className="flex flex-col w-full p-3 rounded-xl bg-surface-container-low border border-surface-variant/40 gap-2.5">
            <button
              type="button"
              onClick={() => setShowSaveDrawer((v) => !v)}
              className="flex items-center justify-between w-full text-left cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <BookmarkPlus className="w-4 h-4 text-primary-container" />
                <span className="font-sans text-[15px] font-semibold text-on-surface">
                  Lưu Cấu Hình Mới
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] text-on-surface-variant uppercase px-1.5 py-0.5 rounded bg-surface-container-high">
                  DSP TAB 1 DATA
                </span>
                {showSaveDrawer ? (
                  <ChevronUp className="w-4 h-4 text-on-surface-variant" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                )}
              </div>
            </button>

            {showSaveDrawer && (
              <div className="flex flex-col gap-2 pt-1">
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant block mb-1">
                    Tên Profile
                  </label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="VD: FiiO JD1 - Cắt chói 4.38kHz"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container border border-surface-variant/50 text-on-surface text-[13px] placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary-container"
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] text-on-surface-variant block mb-1">
                    Ghi chú âm sắc
                  </label>
                  <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="VD: Giảm 3.8dB ở đỉnh 4.38kHz, sub-bass gọn"
                    className="w-full px-3 py-2 rounded-lg bg-surface-container border border-surface-variant/50 text-on-surface text-[13px] placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary-container"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveCurrentToVault}
                  className="mt-1 min-h-[42px] w-full py-2.5 px-3 rounded-lg bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-mono text-[11px] font-bold tracking-wider uppercase flex items-center justify-center gap-2 active:scale-[0.98] transition cursor-pointer"
                >
                  <Archive className="w-4 h-4" />
                  <span>Cất Vào Kho Offline</span>
                </button>
              </div>
            )}
          </section>
        </>
      ) : (
        /* 3B. ONLINE FIIO HAND-PICKED & AUTOEQ SEARCH MODULE */
        <section className="flex flex-col gap-2.5 p-3 rounded-xl bg-surface-container-low border border-surface-variant/40">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const next = { ...cloudSettings, deviceFilter: 'JA11' as const };
                  setCloudSettings(next);
                  saveCloudSettings(next);
                  void fetchFiioOnline(cloudQuery, 1, next);
                }}
                className={`px-2 py-1 rounded font-mono text-[10px] cursor-pointer transition ${
                  cloudSettings.deviceFilter === 'JA11'
                    ? 'bg-primary-container text-on-primary-container font-bold'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                JA11 (814+)
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = { ...cloudSettings, deviceFilter: 'ALL' as const };
                  setCloudSettings(next);
                  saveCloudSettings(next);
                  void fetchFiioOnline(cloudQuery, 1, next);
                }}
                className={`px-2 py-1 rounded font-mono text-[10px] cursor-pointer transition ${
                  cloudSettings.deviceFilter === 'ALL'
                    ? 'bg-primary-container text-on-primary-container font-bold'
                    : 'bg-surface-container text-on-surface-variant'
                }`}
              >
                Mọi DAC FiiO
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowRelayConfig((v) => !v)}
              className="px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high text-on-surface-variant font-mono text-[10px] flex items-center gap-1 cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Cấu hình</span>
            </button>
          </div>

          {showRelayConfig && (
            <div className="p-2.5 rounded-lg bg-surface-container flex flex-col gap-2 border border-surface-variant/40">
              <input
                type="text"
                value={cloudSettings.relayBaseUrl}
                onChange={(e) => {
                  const next = { ...cloudSettings, relayBaseUrl: e.target.value };
                  setCloudSettings(next);
                  saveCloudSettings(next);
                }}
                placeholder="Relay URL tùy chọn (để trống dùng cầu nối trực tiếp FiiO)"
                className="w-full px-2.5 py-1.5 rounded bg-surface-container-lowest text-on-surface font-mono text-[11px] border border-surface-variant/40 focus:outline-none"
              />
            </div>
          )}

          <div className="relative flex items-center w-full">
            <Search className="w-4 h-4 absolute left-3 text-outline pointer-events-none" />
            <input
              type="text"
              value={cloudQuery}
              onChange={(e) => setCloudQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void fetchFiioOnline(cloudQuery, 1);
              }}
              placeholder="Tìm tên profile FiiO (podcast, vocal, jd1) hoặc tên tai nghe..."
              className="w-full pl-9 pr-8 py-2 rounded-lg bg-surface-container border border-surface-variant/50 text-on-surface text-[13px] placeholder:text-on-surface-variant/55 focus:outline-none focus:border-secondary-container"
            />
            {cloudQuery && (
              <button
                type="button"
                onClick={() => {
                  setCloudQuery('');
                  void fetchFiioOnline('', 1);
                }}
                className="absolute right-2 p-1 text-on-surface-variant hover:text-on-surface cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={cloudLoading}
              onClick={() => void fetchFiioOnline(cloudQuery, 1)}
              className="min-h-[40px] py-2 px-2 rounded-lg bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-mono text-[10px] font-bold uppercase flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cloudLoading ? 'animate-spin' : ''}`} />
              <span>Tìm FiiO Hand-Picked</span>
            </button>

            <button
              type="button"
              disabled={cloudLoading}
              onClick={() => void fetchAutoEqOnline()}
              className="min-h-[40px] py-2 px-2 rounded-lg bg-surface-container-high hover:bg-surface-bright text-secondary-fixed border border-surface-variant font-mono text-[10px] font-semibold uppercase flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Đo AutoEQ 5000+</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <span className="font-mono text-[10px] text-on-surface-variant leading-snug">
              {cloudNotice}
            </span>

            {!cloudQuery.trim() && cloudTotal > 18 && (
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={cloudLoading || cloudPage <= 1}
                  onClick={() => void fetchFiioOnline('', cloudPage - 1)}
                  className="p-1.5 rounded bg-surface-container-high text-on-surface disabled:opacity-40 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono text-[10px] px-1 text-primary">Tr.{cloudPage}</span>
                <button
                  type="button"
                  disabled={cloudLoading || cloudPage * 18 >= cloudTotal}
                  onClick={() => void fetchFiioOnline('', cloudPage + 1)}
                  className="p-1.5 rounded bg-surface-container-high text-on-surface disabled:opacity-40 cursor-pointer"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. Section Header for Profile Cards */}
      <div className="flex items-center justify-between px-0.5">
        <div className="flex items-center gap-2">
          <span className="font-sans text-[15px] font-semibold text-on-surface">
            {sourceTab === 'offline' ? 'Danh Sách Profile' : 'Kết Quả Cộng Đồng'}
          </span>
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-surface-container-high text-secondary-fixed-dim font-medium">
            {activeList.length} Cấu hình
          </span>
        </div>

        {sourceTab === 'offline' ? (
          <button
            type="button"
            onClick={() => {
              const reset = resetVaultDefaults();
              onVaultChange(reset);
              onNotify('Đã khôi phục danh sách Profile mẫu mặc định.');
            }}
            className="font-mono text-[10px] text-on-surface-variant hover:text-primary underline cursor-pointer"
          >
            Khôi phục mẫu gốc
          </button>
        ) : (
          <span className="font-mono text-[10px] text-tertiary flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-tertiary" /> Live Sync
          </span>
        )}
      </div>

      {/* 5. Profile Cards List */}
      {activeList.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 px-4 text-center rounded-xl bg-surface-container-low border border-surface-variant/30 gap-2">
          <Search className="w-8 h-8 text-outline" />
          <span className="font-sans text-[15px] font-medium text-on-surface">
            Không tìm thấy profile
          </span>
          <p className="text-[12px] text-on-surface-variant max-w-xs">
            Không có cấu hình nào khớp với từ khóa tìm kiếm. Hãy thử từ khóa khác hoặc nhập file .XML.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {activeList.map((prof) => {
            const isActive = activeProfileName === prof.name;
            return (
              <article
                key={prof.id}
                className={`flex flex-col p-3 rounded-xl border transition gap-2.5 ${
                  isActive
                    ? 'bg-surface-container border-primary-container/60 shadow-[0_0_14px_rgba(255,159,10,0.12)]'
                    : 'bg-surface-container-low border-surface-variant/40 hover:bg-surface-container'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="font-sans text-[15px] font-semibold text-on-surface truncate">
                      {prof.name}
                    </span>
                    <span className="font-mono text-[10px] text-primary-fixed-dim truncate">
                      {prof.author ? `Bởi ${prof.author}` : 'JadeAudio JA11'}
                      {prof.deviceModel ? ` • ${prof.deviceModel}` : ''}
                      {prof.compressedFromBands ? ` (Gộp từ ${prof.compressedFromBands}-Band)` : ''}
                    </span>
                  </div>

                  <span
                    className={`shrink-0 font-mono text-[10px] px-2 py-0.5 rounded bg-surface-container-high font-semibold ${
                      prof.masterGain === 0 ? 'text-tertiary' : 'text-primary'
                    }`}
                  >
                    Pre {prof.masterGain > 0 ? '+' : ''}
                    {prof.masterGain} dB
                  </span>
                </div>

                {prof.description && (
                  <p className="text-[12px] text-on-surface-variant leading-relaxed line-clamp-2">
                    {prof.description}
                  </p>
                )}

                {/* 5-Band Breakdown Box */}
                <div className="flex flex-col gap-1.5 p-2 rounded-lg bg-surface-container-lowest border border-surface-variant/25">
                  <div className="flex items-center justify-between font-mono text-[9px]">
                    <span className="text-outline uppercase tracking-wider">Thông số 5-Band PEQ</span>
                    <span className="text-secondary-fixed-dim">IIR 5-BAND</span>
                  </div>
                  <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                    {prof.bands.map((b, bIdx) => {
                      const strong = Math.abs(b.gain) >= 3;
                      return (
                        <span
                          key={bIdx}
                          className={`px-1.5 py-0.5 rounded bg-surface-container ${
                            strong ? 'text-primary font-semibold' : 'text-on-surface'
                          }`}
                        >
                          {formatBandPill(b, bIdx)}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => onPreviewProfileLive(prof)}
                    className={`flex-1 min-h-[40px] py-2 px-2.5 rounded-lg font-mono text-[11px] font-bold tracking-wide uppercase flex items-center justify-center gap-1.5 transition active:scale-[0.98] cursor-pointer ${
                      isActive
                        ? 'bg-primary-container text-on-primary-container shadow-sm'
                        : 'bg-surface-container-high hover:bg-primary-container hover:text-on-primary-container text-on-surface'
                    }`}
                  >
                    <Zap
                      className={`w-3.5 h-3.5 ${
                        isActive ? 'text-on-primary-container' : 'text-secondary-fixed-dim'
                      }`}
                    />
                    <span>{isActive ? 'Đang nghe Live (RAM)' : 'Nghe thử Live (RAM)'}</span>
                  </button>

                  {sourceTab === 'online' && (
                    <button
                      type="button"
                      onClick={() => handleSaveCloudItemOffline(prof)}
                      title="Lưu cấu hình này vào Kho Offline"
                      className="w-10 h-10 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-primary flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      <BookmarkPlus className="w-4 h-4" />
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => openXmlInspector(prof)}
                    title="Xem / Sửa / Xuất mã nguồn XML"
                    className="w-10 h-10 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-secondary-fixed flex items-center justify-center active:scale-95 transition cursor-pointer"
                  >
                    <Code2 className="w-4 h-4" />
                  </button>

                  {sourceTab === 'offline' && prof.category === 'personal' && (
                    <button
                      type="button"
                      onClick={() => handleDeleteProfile(prof)}
                      title="Xóa khỏi Kho Offline"
                      className="w-10 h-10 rounded-lg bg-surface-container-high hover:bg-error-container text-on-surface-variant hover:text-on-error-container flex items-center justify-center active:scale-95 transition cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* 6. XML Source Viewer & Live Editor Modal */}
      {xmlModalProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/80 backdrop-blur-md">
          <div className="flex flex-col w-full max-w-[520px] max-h-[88vh] bg-surface-container rounded-xl border border-surface-variant shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-3.5 py-3 bg-surface-container-high border-b border-surface-variant/50">
              <div className="flex items-center gap-2 min-w-0">
                <Terminal className="w-5 h-5 text-primary-container shrink-0" />
                <div className="flex flex-col min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-[11px] font-bold tracking-wider text-on-surface uppercase">
                      MÃ NGUỒN XML PROFILE
                    </span>
                    <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-surface-container-highest text-secondary-fixed-dim uppercase">
                      FiiO DSP
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-on-surface-variant truncate">
                    {xmlModalProfile.name}.xml
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setXmlModalProfile(null)}
                className="w-8 h-8 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Toolbar */}
            <div className="flex items-center justify-between px-3.5 py-2 bg-surface-container-low border-b border-surface-variant/30">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-tertiary" />
                <span className="font-mono text-[10px] text-on-surface-variant">XML v1.0 / UTF-8</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(xmlModalText);
                    onNotify('Đã sao chép mã XML vào bộ nhớ đệm!');
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-mono text-[10px] cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Sao chép</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const parsed = parseFiioXml(xmlModalText, xmlModalProfile.name);
                      downloadProfileAsFiioXml(parsed);
                      onNotify(`Đang tải file "${parsed.name}.xml" về máy...`);
                    } catch (err) {
                      onNotify(err instanceof Error ? err.message : String(err));
                    }
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest text-secondary-fixed-dim font-mono text-[10px] cursor-pointer"
                >
                  <Download className="w-3 h-3" />
                  <span>Tải về .xml</span>
                </button>
              </div>
            </div>

            {/* Editable Line-Numbered XML Code Box */}
            <div className="p-3 flex flex-col gap-2.5 overflow-y-auto">
              <div className="rounded-lg bg-surface-container-lowest p-2.5 border border-surface-variant/40 flex font-mono text-[11px] leading-relaxed">
                <div className="select-none text-outline pr-2.5 text-right flex flex-col shrink-0 border-r border-surface-variant/40">
                  {Array.from({ length: xmlLineCount }, (_, i) => (
                    <span key={i}>{String(i + 1).padStart(2, '0')}</span>
                  ))}
                </div>
                <textarea
                  value={xmlModalText}
                  onChange={(e) => setXmlModalText(e.target.value)}
                  spellCheck={false}
                  rows={Math.min(18, xmlLineCount)}
                  className="flex-1 pl-2.5 bg-transparent text-on-surface font-mono text-[11px] leading-relaxed focus:outline-none resize-y whitespace-pre overflow-x-auto"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-container-high/70">
                <Info className="w-4 h-4 text-primary-container shrink-0" />
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  Bạn có thể chỉnh sửa trực tiếp thẻ XML chuẩn FiiO Control ở trên rồi bấm nạp thẳng vào RAM của JA11.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-3.5 py-2.5 bg-surface-container-high border-t border-surface-variant/50">
              <button
                type="button"
                onClick={() => setXmlModalProfile(null)}
                className="py-2 px-3 rounded-lg bg-surface-container hover:bg-surface-container-highest text-on-surface font-mono text-[11px] cursor-pointer"
              >
                Hủy / Đóng
              </button>
              <button
                type="button"
                onClick={handleApplyEditedXml}
                className="py-2 px-3.5 rounded-lg bg-primary-container hover:bg-primary-fixed-dim text-on-primary-container font-mono text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Áp dụng &amp; Nạp vào RAM</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
