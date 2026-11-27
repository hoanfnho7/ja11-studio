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
import { Lang, tr } from '../core/i18n';
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
  lang: Lang;
  currentLivePeq: PeqSnapshot;
  activeProfileName: string;
  isSyncing?: boolean;
  onPreviewProfileLive: (profile: PeqProfile) => void;
  onNotify: (msg: string) => void;
}

export const PresetVaultAndCloud: React.FC<Props> = ({
  lang,
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
  const [cloudNotice, setCloudNotice] = useState('');
  const [showRelayConfig, setShowRelayConfig] = useState(false);
  const [cloudSettings, setCloudSettings] = useState<CloudSettings>(() => loadCloudSettings());

  const handleSaveCurrentToVault = () => {
    const title = newName.trim() || `JA11 Custom (${new Date().toLocaleTimeString()})`;
    const updated = upsertVaultProfile(currentLivePeq, {
      name: title,
      description: newDesc.trim() || tr(lang, 'Lưu từ bàn chỉnh JA11 Studio', 'Saved from JA11 Studio'),
      category: 'personal',
    });
    setVault(updated);
    setNewName('');
    setNewDesc('');
    onNotify(tr(lang, `Đã lưu "${title}" vào Kho Offline!`, `Saved "${title}" to Offline Vault!`));
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
        onNotify(tr(lang, `Lỗi đọc file ${file.name}: ${msg}`, `Failed to parse ${file.name}: ${msg}`));
      }
    }

    if (lastImported && importedCount > 0) {
      onPreviewProfileLive(lastImported);
      onNotify(
        tr(
          lang,
          `Đã nhập ${importedCount} file FiiO XML/Preset và nạp nghe thử Live!`,
          `Imported ${importedCount} preset file(s) and applied Live to RAM!`,
        ),
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const triggerFiioSearchOrBrowse = async (targetPage = 1, overrideQuery?: string) => {
    const q = overrideQuery !== undefined ? overrideQuery : searchQuery;
    setCloudLoading(true);
    setCloudNotice(
      q.trim()
        ? tr(lang, `Đang tìm "${q.trim()}" trên FiiO Hand-Picked...`, `Searching "${q.trim()}" on FiiO Hand-Picked...`)
        : tr(lang, `Đang tải trang ${targetPage} từ FiiO Hand-Picked...`, `Loading page ${targetPage} from FiiO Hand-Picked...`),
    );
    try {
      const res = await syncFiioHandPickedPresets(q, cloudSettings, targetPage);
      setCloudList(res.profiles);
      setTotalRows(res.totalRows);
      setPage(targetPage);
      setCloudNotice(
        res.fromLiveServer
          ? tr(
              lang,
              res.notice,
              q.trim()
                ? `Found ${res.profiles.length} live preset(s) matching "${q.trim()}" on FiiO Hand-Picked!`
                : `Showing page ${targetPage} (${res.totalRows} total presets on FiiO Hand-Picked) — cached offline!`,
            )
          : tr(lang, res.notice, `Offline cache (${res.profiles.length} presets available).`),
      );
    } finally {
      setCloudLoading(false);
    }
  };

  const triggerAutoEqSearch = async () => {
    setCloudLoading(true);
    setCloudNotice(
      tr(
        lang,
        `Đang tìm mẫu tai nghe "${searchQuery || 'FiiO JD'}" trên Kho đo AutoEQ...`,
        `Searching "${searchQuery || 'FiiO JD'}" in AutoEQ 5,000+ IEM database...`,
      ),
    );
    try {
      const res = await searchAutoEqInternational(searchQuery || 'FiiO JD');
      if (res.profiles.length > 0) {
        setCloudList(res.profiles);
        setTotalRows(res.profiles.length);
      }
      setCloudNotice(
        res.profiles.length > 0
          ? tr(lang, res.notice, `Found ${res.profiles.length} IEM measurement(s) from AutoEQ!`)
          : tr(lang, res.notice, `No AutoEQ measurement found for "${searchQuery}". Try FiiO Hand-Picked for user-named presets!`),
      );
    } catch (err) {
      setCloudNotice(
        tr(
          lang,
          `Lỗi tìm kho AutoEQ: ${err instanceof Error ? err.message : String(err)}`,
          `AutoEQ fetch error: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
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
  const defaultCloudHint = tr(
    lang,
    'Gõ tên Profile (VD: "podcast", "phonk", "jd1", "vocal") rồi bấm Enter để tìm trực tiếp 814+ preset trên FiiO Hand-Picked!',
    'Search any profile name (e.g. "podcast", "phonk", "jd1", "vocal") across 814+ live FiiO Hand-Picked presets or 5,000+ AutoEQ IEMs!',
  );

  return (
    <div className="bg-slate-900/85 border border-slate-800 rounded-xl p-3.5 space-y-3 text-xs xl:h-[calc(100vh-88px)] xl:flex xl:flex-col">
      {/* Tabs Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2.5 shrink-0">
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
            {tr(lang, `Kho Offline & XML (${vault.length})`, `Offline Vault & XML (${vault.length})`)}
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
            {tr(lang, 'FiiO Hand-Picked & Online', 'FiiO Hand-Picked Online')} {totalRows > 0 ? `(${totalRows})` : ''}
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
            {tr(lang, 'Nhập .XML / AutoEQ', 'Import .XML / AutoEQ')}
          </button>

          <button
            onClick={() =>
              downloadProfileAsFiioXml({
                name: newName.trim() || activeProfileName || 'JA11 Custom',
                description: newDesc.trim() || 'Exported from JA11 Studio',
                masterGain: currentLivePeq.masterGain,
                bands: currentLivePeq.bands,
              })
            }
            className="px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700 flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            {tr(lang, 'Xuất .XML', 'Export .XML')}
          </button>
        </div>
      </div>

      {tab === 'vault' ? (
        <div className="space-y-3 xl:flex-1 xl:flex xl:flex-col xl:min-h-0">
          <div className="flex flex-wrap items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-lg p-2.5 shrink-0">
            <input
              type="text"
              placeholder={tr(lang, 'Tên Profile mới...', 'New profile name...')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 min-w-[140px] px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <input
              type="text"
              placeholder={tr(lang, 'Ghi chú ngắn...', 'Short note (optional)...')}
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              className="flex-1 min-w-[130px] px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={handleSaveCurrentToVault}
              className="px-3 py-1.5 rounded-lg bg-emerald-500 text-slate-950 font-semibold hover:bg-emerald-400 flex items-center gap-1 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {tr(lang, 'Lưu vào Kho', 'Save to Vault')}
            </button>
            <input
              type="text"
              placeholder={tr(lang, 'Lọc nhanh kho...', 'Filter vault...')}
              value={vaultFilter}
              onChange={(e) => setVaultFilter(e.target.value)}
              className="w-40 px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => {
                setVault(resetVaultDefaults());
                onNotify(tr(lang, 'Đã khôi phục bộ Preset mặc định.', 'Restored default built-in presets.'));
              }}
              className="px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 cursor-pointer"
              title={tr(lang, 'Khôi phục Preset gốc', 'Restore default presets')}
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
                      {isAct
                        ? isSyncing
                          ? tr(lang, 'Đang gửi...', 'Sending...')
                          : tr(lang, 'Đang áp dụng', 'Applied')
                        : tr(lang, 'Nghe thử Live (RAM)', 'Live Preview (RAM)')}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => downloadProfileAsFiioXml(p)}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 cursor-pointer flex items-center gap-1"
                        title={tr(lang, 'Xuất file .XML chuẩn FiiO', 'Export FiiO .XML')}
                      >
                        <Download className="w-3 h-3" />
                        .XML
                      </button>
                      <button
                        onClick={() => setVault(deleteVaultProfile(p.id))}
                        className="p-1 rounded bg-slate-800 text-slate-400 hover:text-rose-400 cursor-pointer"
                        title={tr(lang, 'Xóa khỏi Kho', 'Remove from Vault')}
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
              placeholder={tr(
                lang,
                'Tìm tên Profile FiiO hoặc tên tai nghe AutoEQ (VD: podcast, phonk, jd1)...',
                'Search FiiO Hand-Picked profile or AutoEQ IEM (e.g. podcast, phonk, jd1)...',
              )}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void triggerFiioSearchOrBrowse(1)}
              className="flex-1 min-w-[200px] px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 focus:outline-none focus:border-cyan-500"
            />

            <select
              value={cloudSettings.deviceFilter}
              onChange={(e) => {
                const next = e.target.value === 'ALL' ? 'ALL' : 'JA11';
                setCloudSettings((s) => ({ ...s, deviceFilter: next }));
              }}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
            >
              <option value="JA11">{tr(lang, 'Đúng hệ JA11 (814+)', 'JA11 Only (814+)')}</option>
              <option value="ALL">{tr(lang, 'Mọi DAC FiiO', 'All FiiO DACs')}</option>
            </select>

            <button
              onClick={() => void triggerFiioSearchOrBrowse(1)}
              disabled={cloudLoading}
              className="px-3 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-semibold hover:bg-cyan-400 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${cloudLoading ? 'animate-spin' : ''}`} />
              {tr(lang, 'Tìm FiiO Hand-Picked', 'Search FiiO Cloud')}
            </button>

            <button
              onClick={() => void triggerAutoEqSearch()}
              disabled={cloudLoading}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-emerald-500/40 text-emerald-300 hover:bg-slate-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              title={tr(lang, 'Tìm trong kho đo phòng lab AutoEQ (5.000+ IEM)', 'Search AutoEQ 5,000+ lab IEM measurements')}
            >
              <Search className="w-3.5 h-3.5" />
              AutoEQ (5000+)
            </button>

            <button
              onClick={() => setShowRelayConfig((v) => !v)}
              className="px-2 py-1.5 rounded-lg border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
              title={tr(lang, 'Cấu hình Relay tùy chọn', 'Optional Relay Settings')}
            >
              <Settings2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {showRelayConfig && (
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2 text-[11px] shrink-0">
              <p className="text-slate-300 font-medium">
                {tr(
                  lang,
                  'Cấu hình nâng cao (bỏ trống sẽ gọi trực tiếp FiiO Server):',
                  'Advanced settings (leave blank for direct browser connection to FiiO Server):',
                )}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                <input
                  type="text"
                  placeholder={tr(lang, 'Cloudflare Relay URL (tùy chọn)', 'Cloudflare Relay URL (optional)')}
                  value={cloudSettings.relayBaseUrl}
                  onChange={(e) => setCloudSettings((s) => ({ ...s, relayBaseUrl: e.target.value }))}
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono"
                />
                <input
                  type="password"
                  placeholder={tr(lang, 'FiiO Token (không bắt buộc)', 'FiiO Token (optional)')}
                  value={cloudSettings.authToken}
                  onChange={(e) => setCloudSettings((s) => ({ ...s, authToken: e.target.value }))}
                  className="px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-slate-200 font-mono"
                />
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-0.5 shrink-0">
            <p className="text-[11px] text-cyan-300/90">{cloudNotice || defaultCloudHint}</p>

            {!searchQuery.trim() && totalRows > 18 && (
              <div className="flex items-center gap-1.5">
                <button
                  disabled={cloudLoading || page <= 1}
                  onClick={() => void triggerFiioSearchOrBrowse(page - 1, '')}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 flex items-center gap-0.5 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  {tr(lang, 'Trước', 'Prev')}
                </button>
                <span className="font-mono text-slate-400">
                  {tr(lang, 'Trang', 'Page')} {page}/{totalPages}
                </span>
                <button
                  disabled={cloudLoading || page >= totalPages}
                  onClick={() => void triggerFiioSearchOrBrowse(page + 1, '')}
                  className="px-2 py-1 rounded bg-slate-800 text-slate-300 disabled:opacity-40 hover:bg-slate-700 flex items-center gap-0.5 cursor-pointer"
                >
                  {tr(lang, 'Sau', 'Next')}
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
                            5/{p.compressedFromBands}B
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
                      {isAct
                        ? isSyncing
                          ? tr(lang, 'Đang gửi...', 'Sending...')
                          : tr(lang, 'Đang áp dụng', 'Applied')
                        : tr(lang, 'Nghe thử Live', 'Live Preview')}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => downloadProfileAsFiioXml(p)}
                        className="px-2 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
                        title={tr(lang, 'Tải file .XML chuẩn FiiO', 'Download FiiO .XML')}
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
                          onNotify(
                            tr(
                              lang,
                              `Đã lưu "${p.name}" về Kho Offline!`,
                              `Saved "${p.name}" to Offline Vault!`,
                            ),
                          );
                        }}
                        className="px-2.5 py-1 rounded bg-slate-800 text-emerald-300 hover:bg-slate-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        {tr(lang, 'Lưu Offline', 'Save')}
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
