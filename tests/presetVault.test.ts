import { beforeEach, describe, expect, it } from 'vitest';
import { BUILTIN_PROFILES } from '../src/core/defaultPresets';
import { deleteVaultProfile, loadVaultProfiles, resetVaultDefaults } from '../src/services/presetVault';

describe('Offline Preset Vault deletion persistence', () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => store.set(k, String(v)),
        removeItem: (k: string) => store.delete(k),
        clear: () => store.clear(),
      },
      configurable: true,
    });
  });

  it('permanently deletes built-in profiles and keeps them deleted across reloads even when vault becomes empty', () => {
    const initial = loadVaultProfiles();
    expect(initial.length).toBe(BUILTIN_PROFILES.length);

    // Delete first built-in profile -> reload -> must stay deleted
    deleteVaultProfile(initial[0].id);
    const afterOne = loadVaultProfiles();
    expect(afterOne.length).toBe(BUILTIN_PROFILES.length - 1);
    expect(afterOne.some((p) => p.id === initial[0].id)).toBe(false);

    // Delete EVERY remaining built-in profile -> reload -> must remain empty []
    for (const p of afterOne) {
      deleteVaultProfile(p.id);
    }
    expect(loadVaultProfiles()).toEqual([]);

    // Explicit Reset restores defaults cleanly
    expect(resetVaultDefaults().length).toBe(BUILTIN_PROFILES.length);
    expect(loadVaultProfiles().length).toBe(BUILTIN_PROFILES.length);
  });
});
