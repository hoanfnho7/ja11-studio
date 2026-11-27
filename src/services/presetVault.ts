import { BUILTIN_PROFILES } from '../core/defaultPresets';
import { serializeFiioXml } from '../core/fiioXml';
import { PeqProfile, PeqSnapshot, cloneSnapshot } from '../core/ja11Protocol';
import { isRunningInsideAndroidApk } from '../transports/androidUsbTransport';

const VAULT_STORAGE_KEY = 'ja11_studio_vault_v1';

export function loadVaultProfiles(): PeqProfile[] {
  try {
    const raw = localStorage.getItem(VAULT_STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(BUILTIN_PROFILES));
      return [...BUILTIN_PROFILES];
    }
    const parsed = JSON.parse(raw) as PeqProfile[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return [...BUILTIN_PROFILES];
    }
    return parsed;
  } catch {
    return [...BUILTIN_PROFILES];
  }
}

export function saveVaultProfiles(profiles: PeqProfile[]): void {
  try {
    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(profiles));
  } catch {
    // ignore quota error
  }
}

export function upsertVaultProfile(
  snapshot: PeqSnapshot,
  meta: { id?: string; name: string; description?: string; category?: PeqProfile['category']; author?: string },
): PeqProfile[] {
  const current = loadVaultProfiles();
  const cleanSnap = cloneSnapshot(snapshot);
  const id = meta.id || `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const nextItem: PeqProfile = {
    id,
    name: meta.name.trim() || 'Custom Profile',
    description: meta.description?.trim() ?? '',
    category: meta.category || 'personal',
    deviceModel: 'JadeAudio JA11',
    author: meta.author || 'User',
    masterGain: cleanSnap.masterGain,
    bands: cleanSnap.bands,
    updatedAt: Date.now(),
  };

  const idx = current.findIndex((p) => p.id === id);
  const updated = idx >= 0
    ? current.map((p, i) => (i === idx ? nextItem : p))
    : [nextItem, ...current];

  saveVaultProfiles(updated);
  return updated;
}

export function deleteVaultProfile(id: string): PeqProfile[] {
  const updated = loadVaultProfiles().filter((p) => p.id !== id);
  saveVaultProfiles(updated);
  return updated;
}

export function resetVaultDefaults(): PeqProfile[] {
  saveVaultProfiles(BUILTIN_PROFILES);
  return [...BUILTIN_PROFILES];
}

export function downloadProfileAsFiioXml(profile: Pick<PeqProfile, 'name' | 'description' | 'masterGain' | 'bands'>) {
  const xml = serializeFiioXml(profile);
  const safeFile = `${(profile.name || 'JA11_Custom').replace(/[<>:"/\\|?*]+/g, '_')}.xml`;

  if (isRunningInsideAndroidApk() && window.Ja11AndroidBridge?.saveExportFile) {
    const ok = window.Ja11AndroidBridge.saveExportFile(safeFile, xml, 'application/xml');
    if (ok) return;
  }

  const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safeFile;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
