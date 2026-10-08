import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  THEME_STORAGE_KEY,
  ThemeContext,
  type ResolvedTheme,
  type ThemeMode,
} from './theme-context';

const MODES: ThemeMode[] = ['light', 'dark', 'system'];

function systemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function storedMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    // Private browsing / storage disabled, fall through to the default.
  }
  return 'system';
}

/**
 * Applies the theme to <html data-theme="..."> and keeps it in sync with the
 * OS setting while the user is on "system".
 *
 * The very first paint is handled by a tiny inline script in index.html, not by
 * this component, otherwise React would mount, then flip the theme, and the
 * user would see a white flash on a dark page. This provider takes over after
 * hydration and must agree with that script (same storage key, same logic).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>(storedMode);
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);

  // Track the OS preference for as long as the app is open.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystem(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme = mode === 'system' ? system : mode;

  // Paint the resolved theme onto the document.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolved;

    // Keep the mobile browser chrome in step with the page. Missing this is a
    // classic light/dark mismatch: dark page, white status bar.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolved === 'dark' ? '#14141c' : '#f7f7fb');
  }, [resolved]);

  // Stay consistent across tabs: changing the theme in one tab updates the rest.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY) setModeState(storedMode());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Not fatal, the choice just won't survive a reload.
    }
  }, []);

  const cycle = useCallback(() => {
    setModeState((current) => {
      const next = MODES[(MODES.indexOf(current) + 1) % MODES.length]!;
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ mode, resolved, setMode, cycle }),
    [mode, resolved, setMode, cycle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
