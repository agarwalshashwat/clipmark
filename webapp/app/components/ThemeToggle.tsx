'use client';

import { useTheme } from './ThemeProvider';

/**
 * Light/dark switch for the marketing nav and the dashboard top bar.
 *
 * The glyphs are Material Symbols — the same self-hosted set every other icon on
 * the site uses — rather than the ☀️/🌙 emoji this shipped with. Emoji are drawn
 * from the platform's COLOUR font, so the toggle came out gold while the rest of
 * the chrome is monochrome and brand-themed; it was the only coloured thing in
 * the nav. As a font glyph the icon paints in `currentColor`, so it inherits
 * --text-sub and flips with the theme for free: near-black on the light canvas,
 * light grey on the dark one. No new icon dependency — Material Symbols is
 * already self-hosted in /public/fonts.
 *
 * The icon shows the DESTINATION, not the current state: a moon while you are in
 * light mode means "go dark", which is what the label and title say too.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const goingDark = theme === 'light';
  const label = goingDark ? 'Switch to dark mode' : 'Switch to light mode';

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 8,
        // 44px square: the emoji version was ~28px tall, under the minimum
        // comfortable touch target on a phone.
        width: 44,
        height: 44,
        // The nav is a flex row, which was shrinking the button to 38px wide on a
        // phone — under the 44px target in one axis.
        minWidth: 44,
        flexShrink: 0,
        padding: 0,
        cursor: 'pointer',
        color: 'var(--text-sub)',
        lineHeight: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color 0.15s, color 0.15s',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 20 }}>
        {goingDark ? 'dark_mode' : 'light_mode'}
      </span>
    </button>
  );
}
