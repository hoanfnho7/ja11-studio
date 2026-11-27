export type Lang = 'en' | 'vi';

const LANG_STORAGE_KEY = 'ja11_studio_lang_v1';

export function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    // ignore storage errors
  }
  if (typeof navigator !== 'undefined') {
    const navLang = (navigator.language || '').toLowerCase();
    if (navLang.startsWith('vi')) return 'vi';
  }
  return 'en';
}

export function saveLang(lang: Lang): void {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

export function tr(lang: Lang, vi: string, en: string): string {
  return lang === 'vi' ? vi : en;
}
