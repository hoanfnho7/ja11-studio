import {
  FILTER_TYPE_TO_CODE,
  PeqBand,
  PeqProfile,
  adaptBandsToJa11,
  normalizeFilterType,
  normalizeMasterGain,
} from './ja11Protocol';

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2)));
}

/**
 * Parses official FiiO DSP XML configuration files (`<FiiO_DSP model="JadeAudio JA11" ...>`).
 * Also accepts XML exported from other FiiO devices (KA15, KA17, BTR17) and auto-adapts >5 bands.
 */
export function parseFiioXml(xmlContent: string, fallbackName = 'Imported FiiO XML'): PeqProfile {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlContent.trim(), 'text/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    throw new Error('File XML không hợp lệ hoặc bị lỗi cú pháp.');
  }

  const root = doc.querySelector('FiiO_DSP, FiiO_PEQ, FiiO_PEQ_Profile');
  if (!root) {
    throw new Error('Không tìm thấy thẻ gốc <FiiO_DSP> hoặc <FiiO_PEQ> hợp lệ.');
  }

  // Support alternate <FiiO_PEQ> / <FiiO_PEQ_Profile> mockup format as well
  if (root.tagName === 'FiiO_PEQ' || root.tagName === 'FiiO_PEQ_Profile') {
    const profEl = doc.querySelector('Profile') || root;
    const altName =
      profEl.getAttribute('name') ||
      doc.querySelector('Name')?.textContent?.trim() ||
      fallbackName;
    const altDesc = doc.querySelector('Description')?.textContent?.trim() || '';
    const preampAttr = doc.querySelector('Preamp')?.getAttribute('gain') ?? '0';
    const altBands: Partial<PeqBand>[] = Array.from(doc.querySelectorAll('Bands > Band')).map((b) => ({
      type: normalizeFilterType(b.getAttribute('type') ?? 'PK'),
      freq: Number(b.getAttribute('freq') ?? 1000),
      gain: Number(b.getAttribute('gain') ?? 0),
      q: Number(b.getAttribute('q') ?? 1),
    }));
    const { bands, compressedFrom } = adaptBandsToJa11(altBands);
    return {
      id: `xml-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: altName,
      description: altDesc,
      deviceModel: 'JadeAudio JA11',
      category: 'personal',
      masterGain: normalizeMasterGain(Number(preampAttr)),
      bands,
      updatedAt: Date.now(),
      ...(compressedFrom ? { compressedFromBands: compressedFrom } : {}),
    };
  }

  const deviceModel = root.getAttribute('model') || 'JadeAudio JA11';
  const styleName = doc.querySelector('styleName')?.textContent?.trim() || fallbackName;
  const description = doc.querySelector('description')?.textContent?.trim() || '';

  let masterGain = 0;
  const groupParams = doc.querySelectorAll('eqGroup > param');
  groupParams.forEach((p) => {
    if (p.getAttribute('name') === 'masterGain') {
      masterGain = normalizeMasterGain(Number(p.textContent?.trim() ?? 0));
    }
  });

  const eqNodes = Array.from(doc.querySelectorAll('eqList > eq'));
  eqNodes.sort((a, b) => Number(a.getAttribute('index') ?? 0) - Number(b.getAttribute('index') ?? 0));

  const parsedBands: Partial<PeqBand>[] = eqNodes.map((eqEl) => {
    const map: Record<string, string> = {};
    eqEl.querySelectorAll('param').forEach((p) => {
      const k = p.getAttribute('name');
      if (k) map[k] = p.textContent?.trim() ?? '';
    });
    return {
      type: normalizeFilterType(Number(map.type ?? 0)),
      freq: Number(map.freq ?? 1000),
      gain: Number(map.gain ?? 0),
      q: Number(map.q ?? 1),
    };
  });

  const { bands, compressedFrom } = adaptBandsToJa11(parsedBands);

  return {
    id: `xml-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: styleName,
    description,
    deviceModel,
    category: 'personal',
    masterGain,
    bands,
    updatedAt: Date.now(),
    ...(compressedFrom ? { compressedFromBands: compressedFrom } : {}),
  };
}

/**
 * Exports a PeqProfile into an exact FiiO Control compatible XML file (`JadeAudio JA11`).
 */
export function serializeFiioXml(profile: Pick<PeqProfile, 'name' | 'description' | 'masterGain' | 'bands'>): string {
  const bandsXml = profile.bands
    .map((band, index) => {
      const typeCode = FILTER_TYPE_TO_CODE[band.type];
      return [
        `        <eq index="${index}">`,
        `          <param name="type">${typeCode}</param>`,
        `          <param name="freq">${Math.round(band.freq)}</param>`,
        `          <param name="gain">${formatNum(band.gain)}</param>`,
        `          <param name="q">${formatNum(band.q)}</param>`,
        `        </eq>`,
      ].join('\n');
    })
    .join('\n');

  const descTag = profile.description
    ? `<description>${escapeXml(profile.description)}</description>`
    : `<description/>`;

  return [
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`,
    `<FiiO_DSP model="JadeAudio JA11" version="0.0.1">`,
    `  <module name="EQ">`,
    `    <eqGroup>`,
    `      <param name="masterGain">${formatNum(normalizeMasterGain(profile.masterGain))}</param>`,
    `      <eqList>`,
    bandsXml,
    `      </eqList>`,
    `    </eqGroup>`,
    `  </module>`,
    `  <styleName>${escapeXml(profile.name || 'JA11 Custom')}</styleName>`,
    `  ${descTag}`,
    `</FiiO_DSP>`,
  ].join('\n');
}

/**
 * Parses Equalizer APO / AutoEQ / Squig.link `.txt` files for instant use on JA11.
 */
export function parseAutoEqTxt(txt: string, fallbackName = 'AutoEQ Import'): PeqProfile {
  let masterGain = 0;
  const rawBands: Partial<PeqBand>[] = [];

  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const preampMatch = line.match(/^Preamp:\s*([+-]?\d+(?:\.\d+)?)\s*dB/i);
    if (preampMatch) {
      masterGain = normalizeMasterGain(Number(preampMatch[1]));
      continue;
    }

    const filterMatch = line.match(
      /^Filter\s+\d+:\s+ON\s+([A-Z]+)\s+Fc\s+(\d+(?:\.\d+)?)\s*Hz\s+Gain\s+([+-]?\d+(?:\.\d+)?)\s*dB\s+Q\s+(\d+(?:\.\d+)?)/i,
    );
    if (filterMatch) {
      rawBands.push({
        type: normalizeFilterType(filterMatch[1]),
        freq: Number(filterMatch[2]),
        gain: Number(filterMatch[3]),
        q: Number(filterMatch[4]),
      });
    }
  }

  if (rawBands.length === 0) {
    throw new Error('Không tìm thấy băng tần EQ nào trong file .txt.');
  }

  // Note: AutoEQ specifically orders Filters 1..5 as the 5 primary parametric filters
  // for 5-band hardware equalizers, followed by Filters 6..10 for 10-band fine-tuning!
  const primarySlice = rawBands.length > 5 ? rawBands.slice(0, 5) : rawBands;
  primarySlice.sort((a, b) => Number(a.freq ?? 0) - Number(b.freq ?? 0));
  const { bands } = adaptBandsToJa11(primarySlice);
  const compressedFrom = rawBands.length > 5 ? rawBands.length : undefined;
  return {
    id: `autoeq-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: fallbackName.replace(/\.(txt|xml|json)$/i, ''),
    description: 'Imported from AutoEQ / Squig.link text format',
    deviceModel: 'JadeAudio JA11',
    category: 'personal',
    masterGain,
    bands,
    updatedAt: Date.now(),
    ...(compressedFrom ? { compressedFromBands: compressedFrom } : {}),
  };
}

/**
 * Universal file importer (.xml, .json, .txt)
 */
export function parseAnyPresetFile(content: string, filename: string): PeqProfile {
  const trimmed = content.trim();
  const baseName = filename.replace(/\.(xml|json|txt)$/i, '');

  if (trimmed.startsWith('<') || filename.toLowerCase().endsWith('.xml')) {
    return parseFiioXml(trimmed, baseName);
  }
  if (trimmed.startsWith('{')) {
    const obj = JSON.parse(trimmed);
    const { bands, compressedFrom } = adaptBandsToJa11(obj.bands || []);
    return {
      id: `json-${Date.now()}`,
      name: obj.name || obj.styleName || baseName,
      description: obj.description || '',
      deviceModel: obj.deviceModel || 'JadeAudio JA11',
      category: 'personal',
      masterGain: normalizeMasterGain(Number(obj.masterGain ?? 0)),
      bands,
      updatedAt: Date.now(),
      ...(compressedFrom ? { compressedFromBands: compressedFrom } : {}),
    };
  }
  return parseAutoEqTxt(trimmed, baseName);
}
