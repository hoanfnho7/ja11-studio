import { decryptFiioBrowserData, encryptFiioBrowserPayload } from '../core/fiioCrypto';
import { parseAutoEqTxt } from '../core/fiioXml';
import { PeqBand, PeqProfile, adaptBandsToJa11, normalizeFilterType, normalizeMasterGain } from '../core/ja11Protocol';
import { isRunningInsideAndroidApk } from '../transports/androidUsbTransport';

const CLOUD_CACHE_KEY = 'ja11_studio_handpicked_cache_v3';
const CLOUD_SETTINGS_KEY = 'ja11_studio_cloud_settings_v2';
const AUTOEQ_INDEX_URL = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/INDEX.md';
const AUTOEQ_RAW_BASE = 'https://raw.githubusercontent.com/jaakkopasanen/AutoEq/master/results/';

/**
 * Verified from official fiiocontrol.fiio.com bundle (`pX` map):
 * JADEAUDIO_JA11 = 109, FIIO_KA17 = 108, FIIO_KA15 = 110, FIIO_BTR13 = 31, FIIO_BTR17 = 35
 */
export const FIIO_DEVICE_TYPES = {
  JA11: 109,
  KA15: 110,
  KA17: 108,
  BTR13: 31,
  BTR17: 35,
} as const;

const DEVICE_TYPE_LABELS: Record<number, string> = {
  109: 'JadeAudio JA11',
  110: 'FiiO KA15',
  108: 'FiiO KA17',
  31: 'FiiO BTR13',
  35: 'FiiO BTR17',
  24: 'FiiO BTR15',
};

export interface CloudSettings {
  relayBaseUrl: string;
  authToken: string;
  deviceFilter: 'JA11' | 'ALL';
}

export interface AutoEqIndexItem {
  name: string;
  source: string;
  relPath: string;
}

let memoryAutoEqIndex: AutoEqIndexItem[] | null = null;

const SEEDED_COMMUNITY_CACHE: PeqProfile[] = [
  {
    id: 'fiio-cloud-7673',
    name: 'JD1 + JA11 | Podcast & Speech',
    description:
      'Tuned for FiiO JD1 + JA11 combo. Removes boomy low-end and harsh sibilance for crystal-clear, fatigue-free Podcast & Audiobook listening.',
    category: 'handpicked',
    deviceModel: 'JadeAudio JA11',
    author: 'hoanfnho7',
    masterGain: -2,
    bands: [
      { type: 'LSQ', freq: 130, gain: -4.5, q: 0.71 },
      { type: 'PK', freq: 250, gain: -2, q: 1.5 },
      { type: 'PK', freq: 1500, gain: 2, q: 1.0 },
      { type: 'PK', freq: 3000, gain: 1.5, q: 1.6 },
      { type: 'PK', freq: 6000, gain: -3.5, q: 2.2 },
    ],
    updatedAt: 1732520000000,
  },
  {
    id: 'autoeq-jaytiss-fiio-jd1',
    name: 'FiiO JD1 (AutoEQ Official — Jaytiss Lab)',
    description: 'Thông số đo phòng lab chuẩn của FiiO JD1 từ dự án AutoEQ quốc tế (5 băng tần chính).',
    category: 'handpicked',
    deviceModel: 'JadeAudio JA11',
    author: 'Jaytiss / AutoEQ',
    masterGain: -3.4,
    bands: [
      { type: 'LSQ', freq: 105, gain: -2.8, q: 0.7 },
      { type: 'PK', freq: 169, gain: -2.6, q: 1.33 },
      { type: 'PK', freq: 719, gain: 3.6, q: 1.02 },
      { type: 'PK', freq: 2395, gain: -4.1, q: 3.24 },
      { type: 'PK', freq: 4556, gain: -4.9, q: 5.69 },
    ],
    updatedAt: 1732510000000,
    compressedFromBands: 10,
  },
  {
    id: 'fiio-hp-jd1-harman2019',
    name: 'FiiO JD1 → Harman IE 2019v2 Target',
    description: 'Chuẩn Harman In-Ear 2019 cho FiiO JD1: sub-bass sâu gọn, dải mid rõ nét, gọt chói màng LCP.',
    category: 'handpicked',
    deviceModel: 'JadeAudio JA11',
    author: 'Hand-Picked Community',
    masterGain: -8.5,
    bands: [
      { type: 'LSQ', freq: 85, gain: 1.8, q: 0.71 },
      { type: 'PK', freq: 195, gain: -3.2, q: 1.1 },
      { type: 'PK', freq: 720, gain: 1.9, q: 1.0 },
      { type: 'PK', freq: 3450, gain: -2.5, q: 2.2 },
      { type: 'PK', freq: 7800, gain: -3.0, q: 2.0 },
    ],
    updatedAt: 1732500000000,
  },
];

export function loadCloudSettings(): CloudSettings {
  try {
    const raw = localStorage.getItem(CLOUD_SETTINGS_KEY);
    if (!raw) return { relayBaseUrl: '', authToken: '', deviceFilter: 'JA11' };
    const parsed = JSON.parse(raw);
    return {
      relayBaseUrl: String(parsed.relayBaseUrl ?? ''),
      authToken: String(parsed.authToken ?? ''),
      deviceFilter: parsed.deviceFilter === 'ALL' ? 'ALL' : 'JA11',
    };
  } catch {
    return { relayBaseUrl: '', authToken: '', deviceFilter: 'JA11' };
  }
}

export function saveCloudSettings(settings: CloudSettings): void {
  try {
    localStorage.setItem(CLOUD_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function loadCachedHandPicked(): PeqProfile[] {
  try {
    const raw = localStorage.getItem(CLOUD_CACHE_KEY);
    if (!raw) return [...SEEDED_COMMUNITY_CACHE];
    const parsed = JSON.parse(raw) as PeqProfile[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...SEEDED_COMMUNITY_CACHE];
  } catch {
    return [...SEEDED_COMMUNITY_CACHE];
  }
}

export function saveCachedHandPicked(items: PeqProfile[]): void {
  try {
    localStorage.setItem(CLOUD_CACHE_KEY, JSON.stringify(items.slice(0, 120)));
  } catch {
    // ignore
  }
}

export async function searchAutoEqInternational(query: string): Promise<{
  profiles: PeqProfile[];
  notice: string;
}> {
  const term = query.trim().toLowerCase() || 'fiio jd';

  if (!memoryAutoEqIndex) {
    const resp = await fetch(AUTOEQ_INDEX_URL);
    if (!resp.ok) {
      throw new Error(`Không tải được danh mục AutoEQ quốc tế (HTTP ${resp.status})`);
    }
    const md = await resp.text();
    const parsed: AutoEqIndexItem[] = [];
    const lineRe = /^-\s+\[([^\]]+)\]\(\.\/([^)]+)\)\s+by\s+(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = lineRe.exec(md)) !== null) {
      parsed.push({
        name: m[1].trim(),
        relPath: m[2].trim(),
        source: m[3].trim(),
      });
    }
    memoryAutoEqIndex = parsed;
  }

  const words = term.split(/\s+/).filter(Boolean);
  const matches = memoryAutoEqIndex
    .filter((item) => {
      const hay = `${item.name} ${item.source}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    })
    .slice(0, 12);

  if (matches.length === 0) {
    return {
      profiles: [],
      notice: `Kho AutoEQ đo tai nghe không có mẫu tên "${query}" — nếu "${query}" là tên thể loại/profile người dùng đặt (như Podcast, Phonk, Gaming), hãy bấm nút "Tìm FiiO Hand-Picked"!`,
    };
  }

  const fetched = await Promise.all(
    matches.map(async (item): Promise<PeqProfile | null> => {
      try {
        const modelSegment = decodeURIComponent(item.relPath.split('/').pop() || item.name);
        const txtUrl = `${AUTOEQ_RAW_BASE}${item.relPath}/${encodeURIComponent(modelSegment)}%20ParametricEQ.txt`;
        const r = await fetch(txtUrl);
        if (!r.ok) return null;
        const txt = await r.text();
        const prof = parseAutoEqTxt(txt, `${item.name} (${item.source})`);
        return {
          ...prof,
          id: `autoeq-${item.relPath}`,
          name: `${item.name} — ${item.source}`,
          description: `Đo phòng lab từ AutoEQ Quốc tế (nguồn: ${item.source}).`,
          category: 'handpicked',
          author: item.source,
        };
      } catch {
        return null;
      }
    }),
  );

  const valid = fetched.filter((x): x is PeqProfile => x !== null);
  return {
    profiles: valid,
    notice: `Tìm thấy ${valid.length} mẫu tai nghe khớp "${query || 'FiiO JD'}" từ Kho AutoEQ Quốc tế!`,
  };
}

interface RawFiioRecord {
  id?: string | number;
  styleName?: string;
  peqUserName?: string;
  description?: string;
  deviceType?: string | number;
  masterGain?: number | string;
  shareCode?: string;
  eqParamsJson?: string | Array<Record<string, unknown>>;
}

function mapFiioRecordToProfile(rec: RawFiioRecord, idx: number): PeqProfile | null {
  let rawBands: Array<Record<string, unknown>> = [];
  if (typeof rec.eqParamsJson === 'string') {
    try {
      rawBands = JSON.parse(rec.eqParamsJson);
    } catch {
      return null;
    }
  } else if (Array.isArray(rec.eqParamsJson)) {
    rawBands = rec.eqParamsJson;
  }

  if (!Array.isArray(rawBands) || rawBands.length === 0) return null;

  const parsedBands: Partial<PeqBand>[] = rawBands.map((b) => ({
    type: normalizeFilterType(b.filterType ?? b.type ?? 0),
    freq: Number(b.frequency ?? b.freq ?? 1000),
    gain: Number(b.gain ?? 0),
    q: Number(b.qValue ?? b.q ?? 1),
  }));

  const { bands, compressedFrom } = adaptBandsToJa11(parsedBands);
  const devCode = Number(rec.deviceType);
  const devLabel = DEVICE_TYPE_LABELS[devCode] || (rec.deviceType ? `FiiO #${rec.deviceType}` : 'JadeAudio JA11');

  return {
    id: `fiio-cloud-${rec.id ?? idx}`,
    name: String(rec.styleName || `FiiO Preset #${idx + 1}`),
    description: String(rec.description || `Chia sẻ bởi ${rec.peqUserName || 'FiiO User'} (${devLabel})`),
    category: 'handpicked',
    deviceModel: devLabel,
    author: String(rec.peqUserName || 'FiiO Community'),
    masterGain: normalizeMasterGain(Number(rec.masterGain ?? 0)),
    bands,
    updatedAt: Date.now(),
    ...(compressedFrom ? { compressedFromBands: compressedFrom } : {}),
  };
}

async function postFiioDirectBrowser(
  baseHost: string,
  endpointPath: string,
  payload: Record<string, unknown>,
  settings: CloudSettings,
): Promise<unknown> {
  const plainJson = JSON.stringify(payload);
  const isUcenter = endpointPath.startsWith('/ucenter-api/');
  const encrypted = isUcenter ? encryptFiioBrowserPayload(plainJson) : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.fiio.v1+json, application/json',
  };
  if (encrypted) {
    headers['X-Request-ID'] = encrypted.requestId;
  }
  if (settings.authToken.trim()) {
    const tok = settings.authToken.trim();
    headers.Authorization = tok.startsWith('Bearer ') ? tok : `Bearer ${tok}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const resp = await fetch(`${baseHost}${endpointPath}`, {
      method: 'POST',
      headers,
      body: encrypted ? encrypted.envelopeJson : plainJson,
      signal: controller.signal,
    });
    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }
    const parsed = (await resp.json()) as { code?: number; data?: unknown; msg?: string };
    if (encrypted && parsed?.code === 200 && typeof parsed.data === 'string') {
      parsed.data = decryptFiioBrowserData(encrypted.keyHex, parsed.data);
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}

async function postFiioEndpoint(
  endpointPath: string,
  payload: Record<string, unknown>,
  settings: CloudSettings,
): Promise<unknown> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/vnd.fiio.v1+json, application/json',
  };
  if (settings.authToken.trim()) {
    const tok = settings.authToken.trim();
    headers.Authorization = tok.startsWith('Bearer ') ? tok : `Bearer ${tok}`;
  }

  const trimmedRelay = settings.relayBaseUrl.trim().replace(/\/+$/, '');

  if (isRunningInsideAndroidApk() && window.Ja11AndroidBridge?.httpPostJson) {
    const targetHost = trimmedRelay || 'https://fiiocontrol.fiio.com';
    const rawResp = window.Ja11AndroidBridge.httpPostJson(
      `${targetHost}${endpointPath}`,
      JSON.stringify(payload),
      JSON.stringify({
        ...headers,
        Origin: 'https://fiiocontrol.fiio.com',
        Referer: 'https://fiiocontrol.fiio.com/equalizer/hand-picked',
      }),
    );
    return JSON.parse(rawResp);
  }

  const isLocalDevServer =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  // On GitHub Pages / static HTTPS hosting: call FiiO directly using browser RSA+AES encryption!
  // (FiiO server returns Access-Control-Allow-Origin for POST + X-Request-ID -> zero HTTP 405!)
  if (!isLocalDevServer) {
    const targetHost = trimmedRelay || 'https://fiiocontrol.fiio.com';
    return await postFiioDirectBrowser(targetHost, endpointPath, payload, settings);
  }

  // On localhost: try local Node curl.exe proxy first, fall back to direct browser RSA+AES if proxy unavailable
  if (trimmedRelay) {
    headers['X-Fiio-Relay'] = trimmedRelay;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);

  try {
    const resp = await fetch(`./api/fiio${endpointPath}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (resp.status === 404 || resp.status === 405) {
      return await postFiioDirectBrowser(trimmedRelay || 'https://fiiocontrol.fiio.com', endpointPath, payload, settings);
    }
    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      throw new Error(errJson?.msg || `HTTP ${resp.status}`);
    }
    return await resp.json();
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Queries FiiO's real `equalizer/hand-picked` database:
 * - Browsing (empty query): `/ucenter-api/get-share-peq` with `deviceType: [109]` (814+ JA11 presets!)
 * - Searching by profile name (e.g. "podcast", "phonk", "jd1"): `/ucenter-api/search-peq` with `deviceType: 109`
 *   (and KA15/KA17/BTR13/BTR17 + Official Rec when deviceFilter === 'ALL')!
 */
export async function syncFiioHandPickedPresets(
  searchQuery: string,
  settings: CloudSettings,
  pageNumber = 1,
): Promise<{
  profiles: PeqProfile[];
  totalRows: number;
  fromLiveServer: boolean;
  notice: string;
}> {
  const term = searchQuery.trim();

  try {
    // CASE 1: Keyword / Profile Name Search (e.g., "podcast", "jd1", "phonk", "vocal")
    if (term.length > 0) {
      const targetDeviceTypes =
        settings.deviceFilter === 'JA11'
          ? [FIIO_DEVICE_TYPES.JA11]
          : [
              FIIO_DEVICE_TYPES.JA11,
              FIIO_DEVICE_TYPES.KA15,
              FIIO_DEVICE_TYPES.KA17,
              FIIO_DEVICE_TYPES.BTR13,
              FIIO_DEVICE_TYPES.BTR17,
            ];

      const calls = [
        ...targetDeviceTypes.map((dt) =>
          postFiioEndpoint('/ucenter-api/search-peq', { searchValue: term, deviceType: dt }, settings).catch(
            () => null,
          ),
        ),
        postFiioEndpoint(
          '/ucenter-api/search-peq-official',
          { searchValue: term, deviceType: settings.deviceFilter === 'JA11' ? FIIO_DEVICE_TYPES.JA11 : -1 },
          settings,
        ).catch(() => null),
      ];

      const responses = await Promise.all(calls);
      const collected: PeqProfile[] = [];
      const seenIds = new Set<string>();

      responses.forEach((raw) => {
        const res = raw as { code?: number; data?: RawFiioRecord[] | { records?: RawFiioRecord[] } } | null;
        if (!res || res.code !== 200) return;
        const arr = Array.isArray(res.data) ? res.data : res.data?.records || [];
        arr.forEach((rec, idx) => {
          const prof = mapFiioRecordToProfile(rec, idx);
          if (prof && !seenIds.has(prof.id)) {
            seenIds.add(prof.id);
            collected.push(prof);
          }
        });
      });

      if (collected.length > 0) {
        const prevCache = loadCachedHandPicked();
        saveCachedHandPicked([...collected, ...prevCache.filter((p) => !seenIds.has(p.id))]);
      }

      return {
        profiles: collected,
        totalRows: collected.length,
        fromLiveServer: true,
        notice:
          collected.length > 0
            ? `Tìm thấy ${collected.length} profile khớp tên "${term}" trực tiếp từ trang FiiO Hand-Picked!`
            : `Không có profile nào tên "${term}" trên FiiO (${settings.deviceFilter === 'JA11' ? 'thử chuyển bộ lọc sang Mọi DAC FiiO' : 'thử từ khóa khác'}).`,
      };
    }

    // CASE 2: Paginated Browsing of FiiO Hand-Picked (`/ucenter-api/get-share-peq`)
    const deviceTypes =
      settings.deviceFilter === 'JA11'
        ? [FIIO_DEVICE_TYPES.JA11]
        : [FIIO_DEVICE_TYPES.JA11, FIIO_DEVICE_TYPES.KA15, FIIO_DEVICE_TYPES.KA17];

    const shareRes = (await postFiioEndpoint(
      '/ucenter-api/get-share-peq',
      {
        deviceType: deviceTypes,
        pageNumber,
        pageSize: 18,
        totalRow: -1,
      },
      settings,
    )) as {
      code?: number;
      msg?: string;
      data?: { totalRow?: number; records?: RawFiioRecord[] };
    };

    const records = shareRes?.data?.records || [];
    const totalRows = Number(shareRes?.data?.totalRow ?? records.length);

    if (shareRes?.code === 200 && records.length > 0) {
      const mapped = records
        .map((r, idx) => mapFiioRecordToProfile(r, idx))
        .filter((x): x is PeqProfile => x !== null);

      if (pageNumber === 1 && mapped.length > 0) {
        const ids = new Set(mapped.map((m) => m.id));
        const prev = loadCachedHandPicked();
        saveCachedHandPicked([...mapped, ...prev.filter((p) => !ids.has(p.id))]);
      }

      return {
        profiles: mapped,
        totalRows,
        fromLiveServer: true,
        notice: `Đang xem trang ${pageNumber} (tổng ${totalRows} preset trên FiiO Hand-Picked) — đã lưu đệm Offline!`,
      };
    }

    const cached = loadCachedHandPicked();
    return {
      profiles: cached,
      totalRows: cached.length,
      fromLiveServer: false,
      notice: 'Đang hiển thị danh sách Preset trong bộ nhớ đệm Offline.',
    };
  } catch (err) {
    const cached = loadCachedHandPicked();
    const localFiltered = term
      ? cached.filter(
          (p) =>
            p.name.toLowerCase().includes(term.toLowerCase()) ||
            p.description.toLowerCase().includes(term.toLowerCase()) ||
            (p.author && p.author.toLowerCase().includes(term.toLowerCase())),
        )
      : cached;

    return {
      profiles: localFiltered,
      totalRows: localFiltered.length,
      fromLiveServer: false,
      notice:
        err instanceof Error && err.message.includes('404')
          ? `Đang chạy bản Web tĩnh (GitHub Pages) — hiển thị ${localFiltered.length} preset lưu sẵn (bấm "Đo AutoEQ 5000+" để tìm trực tuyến hoặc điền Cloudflare Relay URL).`
          : `Không kết nối được FiiO (${err instanceof Error ? err.message : 'offline'}) — đang tìm trong ${cached.length} preset đã lưu Offline.`,
    };
  }
}
