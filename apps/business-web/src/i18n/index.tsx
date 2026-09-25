import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './en';
import { ar } from './ar';
import { setErrorLocale } from '../api';

export type Locale = 'en' | 'ar';
export type TFunc = (key: string, vars?: Record<string, string | number>) => string;

const STORAGE_KEY = 'bsf-locale';
const dictionaries: Record<Locale, Record<string, string>> = { en, ar };

interface I18nContextValue {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readInitialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'en' || stored === 'ar') return stored;
  } catch {
    // localStorage unavailable; default below.
  }
  return 'ar';
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);
  const dir: 'ltr' | 'rtl' = locale === 'ar' ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.setAttribute('lang', locale);
    document.documentElement.setAttribute('dir', dir);
    setErrorLocale(locale);
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Best-effort persistence only.
    }
  }, [locale, dir]);

  const value = useMemo<I18nContextValue>(() => {
    const dict = dictionaries[locale];
    const fallback = dictionaries.ar;
    const t = (key: string, vars?: Record<string, string | number>) => interpolate(dict[key] ?? fallback[key] ?? key, vars);
    return {
      locale,
      dir,
      setLocale: setLocaleState,
      toggleLocale: () => setLocaleState((l) => (l === 'ar' ? 'en' : 'ar')),
      t,
    };
  }, [locale, dir]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
