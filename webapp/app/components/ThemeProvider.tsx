'use client';

/**
 * Theme state for the marketing site and dashboard.
 *
 * The attribute on <html> is set by the inline script in layout.tsx, which runs
 * before first paint. This provider deliberately does NOT decide the theme on
 * mount — it READS what that script already resolved. An earlier version did
 * `localStorage.getItem('theme') ?? 'light'` in an effect, which threw away a
 * system-dark resolution on hydration and snapped the page back to light.
 *
 * Resolution order (same as the inline script, kept in sync by
 * tests/unit/theme-resolution.test.ts):
 *   1. explicit user choice in localStorage — always wins
 *   2. otherwise the OS, via prefers-color-scheme
 *   3. otherwise light
 */

import { createContext, useContext, useEffect, useState, useCallback } from 'react';

export type Theme = 'light' | 'dark';

/** The storage key the inline script in layout.tsx also reads. */
export const THEME_STORAGE_KEY = 'theme';

const ThemeCtx = createContext<{ theme: Theme; toggle: () => void }>({
  theme: 'light',
  toggle: () => {},
});

/** What the inline script already put on <html>; light until it has run. */
function currentDomTheme(): Theme {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Server render is always 'light' so it matches the server-rendered <html>
  // attribute; the effect below syncs to whatever the inline script resolved.
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(currentDomTheme());
  }, []);

  // Follow the OS while the user has expressed no explicit preference. Someone
  // who has chosen a theme keeps it, even if they later flip their OS.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        /* storage blocked — fall through and follow the OS */
      }
      if (stored === 'dark' || stored === 'light') return; // user override wins

      const next: Theme = e.matches ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      setTheme(next);
    };

    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light';
      // Toggling is an explicit choice, so it is persisted and from now on wins
      // over the OS setting.
      try {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* storage blocked — the theme still applies for this page view */
      }
      document.documentElement.setAttribute('data-theme', next);
      return next;
    });
  }, []);

  return <ThemeCtx.Provider value={{ theme, toggle }}>{children}</ThemeCtx.Provider>;
}

export const useTheme = () => useContext(ThemeCtx);
