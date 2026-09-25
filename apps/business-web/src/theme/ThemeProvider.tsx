import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'bsf-theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

interface ThemeContextValue {
  /** The theme on screen: the user's choice, or the system setting when they have not chosen. */
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readChoice(): Theme | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Storage unavailable (private mode, etc.): follow the system.
  }
  return null;
}

function systemTheme(): Theme {
  return typeof window !== 'undefined' && window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Only an explicit toggle is remembered; until then the app keeps following the operating system.
  const [choice, setChoice] = useState<Theme | null>(readChoice);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const mq = window.matchMedia?.(DARK_QUERY);
    if (!mq) return;
    const onChange = () => setSystem(mq.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (choice) document.documentElement.setAttribute('data-theme', choice);
    else document.documentElement.removeAttribute('data-theme');
  }, [choice]);

  const theme = choice ?? system;
  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      toggleTheme: () => {
        const next: Theme = theme === 'light' ? 'dark' : 'light';
        setChoice(next);
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // Best-effort persistence only.
        }
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
