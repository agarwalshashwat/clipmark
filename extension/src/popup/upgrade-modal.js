/**
 * Branded upsell modal for Pro feature gates (replaces red error toasts).
 *
 * Single shared modal used by side-panel.js and dashboard.js (both ES modules).
 * Self-contained: injects its own markup + styles on first use, so no HTML/CSS
 * edits are needed in either page. Visual style mirrors the existing overlay
 * panels (summary/social) in side-panel.html.
 *
 * Usage:
 *   import { showUpgradeModal } from './upgrade-modal.js';
 *   showUpgradeModal({ feature: 'Revisit Mode', benefit: '…why it is great…' });
 *
 * The guarantee line is intentionally number-free until the refund window is
 * decided (plan decision D1). No specific price is shown here — pricing lives on
 * /upgrade — so this modal never drifts from the source of truth.
 */

const API_BASE =
  (typeof globalThis !== 'undefined' && globalThis.API_BASE) || 'https://clipmark.mithahara.com';

const STYLE_ID = 'cm-upgrade-modal-style';
const OVERLAY_ID = 'cm-upgrade-overlay';

function injectStyleOnce() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${OVERLAY_ID} {
      position: fixed; inset: 0; z-index: 2147483000;
      display: flex; align-items: center; justify-content: center;
      background: rgba(15, 23, 42, 0.55); backdrop-filter: blur(4px);
      -webkit-backdrop-filter: blur(4px); padding: 20px;
    }
    #${OVERLAY_ID}[hidden] { display: none; }
    #${OVERLAY_ID} .cm-upgrade-card {
      position: relative; width: 100%; max-width: 360px;
      background: #ffffff; color: #0f172a; border-radius: 20px;
      padding: 28px 24px 20px; text-align: center;
      box-shadow: 0 24px 70px rgba(0,0,0,0.35); border: 1px solid rgba(0,0,0,0.06);
      font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }
    #${OVERLAY_ID} .cm-upgrade-close {
      position: absolute; top: 10px; right: 12px; border: none; background: none;
      font-size: 26px; line-height: 1; color: #94a3b8; cursor: pointer;
    }
    #${OVERLAY_ID} .cm-upgrade-spark {
      width: 52px; height: 52px; margin: 4px auto 16px; border-radius: 9999px;
      display: flex; align-items: center; justify-content: center; font-size: 24px;
      background: rgba(20,184,166,0.12); color: #0D9488;
    }
    #${OVERLAY_ID} .cm-upgrade-title { font-size: 18px; font-weight: 800; margin: 0 0 8px; }
    #${OVERLAY_ID} .cm-upgrade-benefit { font-size: 14px; line-height: 1.55; color: #475569; margin: 0 0 20px; }
    #${OVERLAY_ID} .cm-upgrade-cta {
      display: block; width: 100%; padding: 13px 20px; border: none; cursor: pointer;
      background: linear-gradient(135deg, #14B8A6 0%, #0D9488 100%); color: #fff;
      border-radius: 12px; font-size: 15px; font-weight: 800;
      box-shadow: 0 8px 22px rgba(13,148,136,0.28);
    }
    #${OVERLAY_ID} .cm-upgrade-dismiss {
      display: block; width: 100%; margin-top: 8px; padding: 8px; border: none; background: none;
      color: #64748b; font-size: 13px; font-weight: 600; cursor: pointer;
    }
    #${OVERLAY_ID} .cm-upgrade-guarantee {
      display: flex; align-items: center; justify-content: center; gap: 5px;
      font-size: 11px; color: #94a3b8; margin: 12px 0 0;
    }
  `;
  document.head.appendChild(style);
}

let overlayEl = null;
let keyHandler = null;

function ensureOverlay() {
  if (overlayEl && document.body.contains(overlayEl)) return overlayEl;
  injectStyleOnce();
  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'cm-upgrade-title');
  overlay.hidden = true;
  overlay.innerHTML = `
    <div class="cm-upgrade-card">
      <button class="cm-upgrade-close" aria-label="Close">&times;</button>
      <div class="cm-upgrade-spark">✦</div>
      <h2 class="cm-upgrade-title" id="cm-upgrade-title"></h2>
      <p class="cm-upgrade-benefit"></p>
      <button class="cm-upgrade-cta">Upgrade to Pro →</button>
      <button class="cm-upgrade-dismiss">Maybe later</button>
      <p class="cm-upgrade-guarantee">Money-back guarantee · cancel anytime</p>
    </div>`;

  overlay.querySelector('.cm-upgrade-close').addEventListener('click', hideUpgradeModal);
  overlay.querySelector('.cm-upgrade-dismiss').addEventListener('click', hideUpgradeModal);
  overlay.querySelector('.cm-upgrade-cta').addEventListener('click', () => {
    openUpgrade();
    hideUpgradeModal();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideUpgradeModal();
  });

  document.body.appendChild(overlay);
  overlayEl = overlay;
  return overlay;
}

function openUpgrade() {
  const url = `${API_BASE}/upgrade`;
  try {
    if (typeof chrome !== 'undefined' && chrome?.tabs?.create) {
      chrome.tabs.create({ url });
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(url, '_blank', 'noopener');
}

export function hideUpgradeModal() {
  if (overlayEl) overlayEl.hidden = true;
  if (keyHandler) {
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
}

/**
 * @param {{ feature: string, benefit?: string }} opts
 */
export function showUpgradeModal({ feature, benefit } = {}) {
  const overlay = ensureOverlay();
  overlay.querySelector('.cm-upgrade-title').textContent = `Unlock ${feature || 'this feature'} with Pro`;
  overlay.querySelector('.cm-upgrade-benefit').textContent =
    benefit || 'Upgrade to Clipmark Pro to unlock this and every Pro feature.';
  overlay.hidden = false;

  keyHandler = (e) => {
    if (e.key === 'Escape') hideUpgradeModal();
  };
  document.addEventListener('keydown', keyHandler);
}
