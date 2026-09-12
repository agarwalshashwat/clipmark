/**
 * The pre-paint theme resolver, as a string.
 *
 * It lives here rather than inline in layout.tsx so tests/unit/theme-resolution
 * can evaluate the exact source that ships — a copy of the rules would be free
 * to drift from the real thing, which is the failure this guards against.
 *
 * It must stay a string: it has to run synchronously in <head>, before React
 * hydrates and before first paint, which no component can do. Everything it
 * touches (localStorage, matchMedia) is synchronous for the same reason — an
 * async resolution would paint the wrong theme first and correct it visibly.
 *
 * Resolution order:
 *   1. An explicit choice in localStorage wins, always. Someone who picked
 *      light on a dark-OS machine keeps light.
 *   2. Otherwise follow the OS via prefers-color-scheme.
 *   3. No stored choice and no OS preference (or no matchMedia) → light, which
 *      is exactly the behaviour before this understood the OS, so nothing
 *      changes for those users.
 *
 * Wrapped in try/catch because localStorage throws outright in some privacy
 * modes; a theme is never worth breaking the page over.
 */
export const THEME_SCRIPT = `
  try {
    var stored = localStorage.getItem('theme');
    var theme = (stored === 'dark' || stored === 'light')
      ? stored
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
`;
