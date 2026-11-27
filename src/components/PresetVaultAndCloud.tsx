import React, { useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Globe,
  HardDrive,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
} from 'lucide-react';
import { parseAnyPresetFile } from '../core/fiioXml';
import { PeqProfile, PeqSnapshot } from '../core/ja11Protocol';
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

interface Props {
  currentLivePeq: PeqSnapshot;
  activeProfileName: string;
  isSyncing?: boolean;
  onPreviewProfileLive: (profile: PeqProfile) => void;
  onNotify: (msg: string) => void;
}

export const PresetVaultAndCloud: React.FC<Props> = ({
  currentLivePeq,
  activeProfileName,
  isSyncing = false,
  onPreviewProfileLive,
  onNotify,
}) => {
  const [tab, setTab] = useState<'vault' | 'handpicked'>('vault');
  const [vault, setVault] = useState<PeqProfile[]>(() => loadVaultProfiles());
  const [vaultFilter, setVaultFilter] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [cloudList, setCloudList] = useState<PeqProfile[]>(() => loadCachedHandPicked());
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalRows, setTotalRows] = useState(0);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [hasLoadedFirstPage, setHasLoadedFirstPage] = useState(false);
  const [cloudNotice, setCloudNotice] = useState(
    'Gõ tên bất kỳ Profile nào (VD: "podcast", "phonk", "jd1", "gaming", "vocal") rồi bấm Enter / Tìm FiiO Hand-Picked hoặc Đo AutoEQ 5000+ IEM!',
  );
  const [showRelayConfig, setShowRelayConfig] = useState(false);
  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(() => loadCloudSettings());

  const handleSaveCurrentToVault = () => {
    const title = newName.trim() || `JA11 Custom (${new Date().toLocaleTimeString('vi-VN')})`;
    const updated = upsertVaultProfile(currentLivePeq, {
      name: title,
      description: newDesc.trim() || 'Lưu từ bàn chỉnh JA11 Studio',
      category: 'personal',
    });
    setVault(updated);
    setNewName('');
    setNewDesc('');
    onNotify(`Đã lưu "${title}" vào Kho Profile Offline!`);
  };

  const handleImportFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    let importedCount = 0;
    let lastImported: PeqProfile | null = null;

    for (const file of Array.from(files)) {
      try {
        const text = await file.text();
        const parsed = parseAnyPresetFile(text, file.name);
        const updated = upsertVaultProfile(parsed, {
          name: parsed.name,
          description: parsed.description,
          category: 'personal',
        });
        setVault(updated);
        lastImported = parsed;
        importedCount++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        onNotify(`Lỗi đọc file ${file.name}: ${msg}`);
      }
    }

    if (lastImported && importedCount > 0) {
      onPreviewProfileLive(lastImported);
      onNotify(`Đã nhập ${importedCount} file FiiO XML/Preset và nạp nghe thử Live!`);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFiioSearchOrBrowse = async (targetPage = 1, overrideQuery?: string) => {
    const q = overrideQuery !== undefined ? overrideQuery : searchQuery;
    setCloudLoading(true);
    setCloudNotice(
      q.trim()
        ? `Đang tìm profile "${q.trim()}" trực tiếp trên trang FiiO Hand-Picked...`
        : `Đang tải trang ${targetPage} từ kho FiiO Hand-Picked...`,
    );
    try {
      const res = await syncFiioHandPickedPresets(q, cloudSettings, targetPage);
      setCloudList(res.profiles);
      setTotalRows(res.totalRows);
      setPage(targetPage);
      setCloudNotice(res.notice);
    } finally {
      setCloudLoading(false);
    }
  };

  const triggerAutoEqSearch = async () => {
    setCloudLoading(true);
    setCloudNotice(`Đang tìm mẫu tai nghe "${searchQuery || 'FiiO JD'}" trên Kho đo AutoEQ Quốc tế...`);
    try {
      const res = await searchAutoEqInternational(searchQuery || 'FiiO JD');
      if (res.profiles.length > 0) {
        setCloudList(res.profiles);
        setTotalRows(res.profiles.length);
      }
      setCloudNotice(res.notice);
    } catch (err) {
      setCloudNotice(`Lỗi tìm kho AutoEQ: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCloudLoading(false);
    }
  };

  useEffect(() => {
    saveCloudSettings(cloudSettings);
  }, [cloudSettings]);

  useEffect(() => {
    if (tab === 'handpicked' && !hasLoadedFirstPage) {
      setHasLoadedFirstPage(true);
      void triggerFiioSearchOrBrowse(1, '');
    }
  }, [tab]);

  const renderBandSummary = (p: PeqProfile) =>
    p.bands
      .map(
        (b) =>
          `${b.type} ${b.freq >= 1000 ? `${(b.freq / 1000).toFixed(1)}k` : b.freq}Hz (${b.gain > 0 ? '+' : ''}${b.gain}dB)`,
      )
      .join(' • ');

  const visibleVault = vaultFilter.trim()
    ? vault.filter(
        (p) =>
          p.name.toLowerCase().includes(vaultFilter.toLowerCase()) ||
          p.description.toLowerCase().includes(vaultFilter.toLowerCase()),
      )
    : vault;

  const totalPages = Math.max(1, Math.ceil(totalRows / 18));

  return (
    <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs xl:h-[calc(100vh-88px)] xl:flex xl:flex-col">
      {/* Tabs Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setTab('vault')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition ${
              tab === 'vault'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            Kho Profile Offline &amp; FiiO XML ({vault.length})
          </button>

          <button
            onClick={() => setTab('handpicked')}
            className={`px-3 py-1.5 rounded-lg font-semibold flex items-center gap-1.5 cursor-pointer transition ${
              tab === 'handpicked'
                ? 'bg-cyan-500 text-slate-950'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Kho FiiO Hand-Picked &amp; Online {totalRows > 0 ? `(${totalRows})` : ''}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xml,.txt,.json"
            multiple
            className="hidden"
            onChange={(e) => void handleImportFiles(e.target.files)}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/20 font-medium flex items-center gap-1.5 cursor-pointer"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Nhập file .XML FiiO / AutoEQ
          </button>

          <button
            onClick={() =>
              downloadProfileAsFiioXml({
                name: newName.trim() || activeProfileName || 'JD1 + JA11 Custom',
                description: newDesc.trim() || 'Exported from JA11 Studio',
                masterGain: currentLivePeq.masterGain,
                bands: currentLivePeq.bands,
              })
            }
            className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            Xuất .XML hiện tại
          </button>
        </div>
      </div>

      {tab === 'vault' ? (
        <div className="space-y-3 xl:flex-1 xl:flex xl:flex-col xl:min-h-0">
          <div className="flex flex-wrap items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 shrink-0">
            <input
              type="text"
              placeholder="Đặt tên Profile mới (VD: JD1 Podcast êm tai)..."
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-w-[170px] px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              placeholder="Ghi chú ngắn (tùy chọn)..."
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="flex-1 min-w-[150px] px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleSaveCurrentToVault}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Cất vào Kho Offline
            </button>
            <input
              type="text"
              placeholder="Lọc nhanh tên profile trong kho..."
              value={vaultFilter}
              onChange={(e) => setVaultFilter(e.target.value)}
              className="w-48 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => {
                setVault(resetVaultDefaults());
                onNotify('Đã khôi phục bộ Preset mặc định cho JD1 + JA11.');
              }}
              className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 cursor-pointer"
              title="Khôi phục danh sách Preset gốc"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-2.5 xl:flex-1 xl:overflow-y-auto xl:content-start pr-1">
            {visibleVault.map((p) => {
              const isAct = activeProfileName === p.name;
              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2 ${
                    isAct
                      ? 'bg-cyan-950/25 border-cyan-400/70 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                      : 'bg-slate-950/70 border-slate-800 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-100 text-[13px] leading-snug">{p.name}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[10px] shrink-0">
                        Pre {p.masterGain > 0 ? '+' : ''}
                        {p.masterGain}dB
                      </span>
                    </div>
                    {p.description && <p className="text-slate-400 text-[11px] line-clamp-2">{p.description}</p>}
                    <p className="text-[10px] font-mono text-slate-500 truncate">{renderBandSummary(p)}</p>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => onPreviewProfileLive(p)}
                      className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 cursor-pointer transition ${
                        isAct
                          ? 'bg-cyan-500 text-slate-950 font-semibold'
                          : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25'
                      }`}
                    >
                      {isAct ? <CheckCircle2 className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      {isAct ? (isSyncing ? 'Đang gửi...' : 'Đang áp dụng') : 'Nghe thử Live (RAM)'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => downloadProfileAsFiioXml(p)}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer flex items-center gap-1"
                        title="Xuất ra file .XML chuẩn FiiO"
                      >
                        <Download className="w-3 h-3" />
                        .XML
                      </button>
                      <button
                        onClick={() => setVault(deleteVaultProfile(p.id))}
                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title="Xoá khỏi Kho"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="space-y-3 xl:flex-1 xl:flex xl:flex-col xl:min-h-0">
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <input
              type="text"
              placeholder="Tìm tên Profile trên FiiO Hand-Picked hoặc tên IEM AutoEQ (VD: podcast, phonk, jd1, chu 2)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void triggerFiioSearchOrBrowse(1)}
              className="flex-1 min-w-[220px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
            />

            <select
              value={cloudSettings.deviceFilter}
              onChange={(e) => {
                const next = e.target.value === 'ALL' ? 'ALL' : 'JA11';
                setCloudSettings((s) => ({ ...s, deviceFilter: next }));
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
            >
              <option value="JA11">Đúng hệ JA11 (800+ profile)</option>
              <option value="ALL">Mọi DAC FiiO (KA15/KA17/BTR...)</option>
            </select>

            <button
              onClick={() => void triggerFiioSearchOrBrowse(1)}
              disabled={cloudLoading}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cloudLoading ? 'animate-spin' : ''}`} />
              Tìm FiiO Hand-Picked
            </button>

            <button
              onClick={() => void triggerAutoEqSearch()}
              disabled={cloudLoading}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-emerald-500/40 text-emerald-300 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              title="Tìm theo tên mẫu tai nghe trong kho đo phòng lab AutoEQ (5.000+ IEM)"
            >
              <Search className="w-3.5 h-3.5" />
              Đo AutoEQ (5000+ IEM)
            </button>

            <button
              onClick={() => setShowRelayConfig((v) => !v)}
              className="px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
              title="Cấu hình Relay tùy chọn"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {showRelayConfig && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-[11px]">
              <p className="text-slate-300 font-medium">
                Cấu hình nâng cao (bỏ trống sẽ tự động dùng cầu nối tích hợp):
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder="Cloudflare Relay URL (tùy chọn)"
                  value={cloudSettings.relayBaseUrl}
                  onChange={(e) => setCloudSettings((s) => ({ ...s, relayBaseUrl: e.target.value }))}
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono"
                />
                <input
                  type="password"
                  placeholder="FiiO Token (không bắt buộc)"
                  value={cloudSettings.authToken}
                  onChange={(e) => setCloudSettings((s) => ({ ...s, authToken: e.target.value }))}
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
            <p className="text-[11px] text-cyan-300/90">{cloudNotice}</p>

            {!searchQuery.trim() && totalRows > 18 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={cloudLoading || page <= 1}
                  onClick={() => void triggerFiioSearchOrBrowse(page - 1, '')}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 flex items-center gap-0.5 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  Trước
                </button>
                <span className="font-mono text-slate-400">
                  Trang {page}/{totalPages}
                </span>
                <button
                  disabled={cloudLoading || page >= totalPages}
                  onClick={() => void triggerFiioSearchOrBrowse(page + 1, '')}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 flex items-center gap-0.5 cursor-pointer"
                >
                  Sau
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2 gap-2.5 xl:flex-1 xl:overflow-y-auto xl:content-start pr-1">
            {cloudList.map((p) => {
              const isAct = activeProfileName === p.name;
              return (
                <div
                  key={p.id}
                  className={`p-3 rounded-xl border transition flex flex-col justify-between gap-2 ${
                    isAct
                      ? 'bg-cyan-950/25 border-cyan-400/70 shadow-[0_0_0_1px_rgba(34,211,238,0.2)]'
                      : 'bg-slate-950/70 border-slate-800 hover:border-cyan-500/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold text-slate-100 text-[13px]">{p.name}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {p.compressedFromBands && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px]">
                            5/{p.compressedFromBands} band
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-300 font-mono text-[10px]">
                          {p.masterGain > 0 ? '+' : ''}
                          {p.masterGain}dB
                        </span>
                      </div>
                    </div>
                    <p className="text-slate-400 text-[11px] line-clamp-2">{p.description}</p>
                    <div className="flex items-center justify-between text-[10px] text-slate-500">
                      <span className="font-mono truncate max-w-[70%]">{renderBandSummary(p)}</span>
                      {p.author && <span className="text-slate-400 shrink-0">@{p.author}</span>}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1.5 pt-1 border-t border-slate-800/80">
                    <button
                      onClick={() => onPreviewProfileLive(p)}
                      className={`px-2.5 py-1 rounded font-medium flex items-center gap-1 cursor-pointer transition ${
                        isAct
                          ? 'bg-cyan-500 text-slate-950 font-semibold'
                          : 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 hover:bg-cyan-500/25'
                      }`}
                    >
                      {isAct ? <CheckCircle2 className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                      {isAct ? (isSyncing ? 'Đang gửi...' : 'Đang áp dụng') : 'Nghe thử Live'}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => downloadProfileAsFiioXml(p)}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
                        title="Tải về dạng file .XML chuẩn FiiO"
                      >
                        <Download className="w-3 h-3" />
                        .XML
                      </button>
                      <button
                        onClick={() => {
                          const updated = upsertVaultProfile(p, {
                            name: p.name,
                            description: p.description,
                            category: 'handpicked',
                            author: p.author,
                          });
                          setVault(updated);
                          onNotify(`Đã lưu "${p.name}" về Kho Offline của bạn!`);
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 text-emerald-300 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        Lưu Offline
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
