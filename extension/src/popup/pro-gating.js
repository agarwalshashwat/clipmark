/**
 * Persistent "PRO" badges on gated controls (free-tier only).
 *
 * Free users see which features are Pro *before* clicking (the branded upsell
 * modal then fires on click — see upgrade-modal.js). Mechanism: add the
 * `cm-pro-gated` class to any gated control (static HTML or dynamic template),
 * then call applyProGating(isPro) once. When the user is not Pro we set
 * `body.cm-free-tier`, which reveals an absolutely-positioned corner pill via
 * CSS `::after`. Absolute positioning means the badge never changes a button's
 * box size, so it can't break dense icon rows.
 */

const STYLE_ID = 'cm-pro-gating-style';

function injectStyleOnce() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    body.cm-free-tier .cm-pro-gated { position: relative; }
    body.cm-free-tier .cm-pro-gated::after {
      content: 'PRO';
      position: absolute; top: -6px; right: -6px;
      padding: 1px 5px; border-radius: 9999px;
      background: #0f766e;
      color: #fff; font-size: 11px; font-weight: 800; letter-spacing: 0.05em;
      line-height: 1.5; pointer-events: none; z-index: 3;
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }
  `;
  document.head.appendChild(style);
}

/**
 * @param {boolean} isPro - toggles the free-tier badge state on <body>.
 */
export function applyProGating(isPro) {
  injectStyleOnce();
  document.body.classList.toggle('cm-free-tier', !isPro);
}
