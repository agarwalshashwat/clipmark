'use client';

/**
 * The consent banner itself. State and persistence live in ConsentProvider;
 * this file is presentation plus the focus handling.
 *
 * ── Choices that are compliance, not taste ───────────────────────────────────
 * • Accept and Reject are the same size, sit side by side, and are both real
 *   buttons. "Reject must be as easy as accept" is the part of the EDPB /ICO
 *   guidance most banners fail, usually by demoting reject to a text link.
 * • Nothing is pre-ticked and there is no way to dismiss an UNANSWERED banner —
 *   no X, no Escape, no click-outside. Silence is not consent, so a banner that
 *   could be waved away would leave us acting on an answer nobody gave.
 * • It does not block the page. A wall would be a dark pattern and is not
 *   required; the visitor can read the site while deciding, and until they
 *   decide we simply set nothing.
 * • Reopened from the footer or /privacy, it IS dismissible (Escape, close
 *   button) — an existing answer stands if you change your mind about changing
 *   your mind.
 *
 * Styles: `.cc-*` in app/globals.css, all theme tokens, so it follows dark mode
 * like every other surface (tests/ci/webapp-smoke.spec.ts sweeps for panels
 * that stay light).
 */

import { useCallback, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

import { useConsent } from './ConsentProvider';

export function CookieConsent() {
  const { promptOpen, hasAnswer, accept, reject, closePreferences, record } = useConsent();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);

  // Move focus to the banner when it appears. It is position:fixed, so this
  // scrolls nothing; without it a keyboard or screen-reader user would have to
  // tab past the entire page to reach a decision the page is asking them for.
  useEffect(() => {
    if (promptOpen) panelRef.current?.focus();
  }, [promptOpen]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && hasAnswer) closePreferences();
    },
    [hasAnswer, closePreferences],
  );

  // /embed/* is our player rendered inside somebody else's page. We set no
  // non-essential cookie on that route, and a consent bar inside a third-party
  // iframe would be both wrong and unusable.
  if (pathname?.startsWith('/embed/')) return null;
  if (!promptOpen) return null;

  const answeredOn = record ? new Date(record.ts).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  }) : null;

  return (
    <div
      className="cc-root"
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-labelledby="cc-title"
      aria-describedby="cc-body"
      onKeyDown={onKeyDown}
    >
      <div className="cc-panel">
        <div className="cc-copy">
          <h2 id="cc-title" className="cc-title">Cookies on ClipMark</h2>
          <p id="cc-body" className="cc-body">
            Sign-in and security cookies are always on — the site cannot work without
            them. We&apos;d also like <strong>one optional cookie</strong>: if you arrived
            through a referral or affiliate link, it credits whoever sent you, for 30 days.
            Never for advertising, and nothing is set until you choose. Our visitor
            statistics are anonymous and cookieless, so there is nothing to opt into
            there.{' '}
            <a className="cc-link" href="/privacy#cookies">Cookies &amp; privacy</a>
          </p>
          {answeredOn && (
            <p className="cc-meta">You last answered this on {answeredOn}.</p>
          )}
        </div>

        <div className="cc-actions">
          <button type="button" className="cc-btn cc-btn-reject" onClick={reject}>
            Reject optional
          </button>
          <button type="button" className="cc-btn cc-btn-accept" onClick={accept}>
            Accept optional
          </button>
        </div>

        {hasAnswer && (
          <button
            type="button"
            className="cc-close"
            onClick={closePreferences}
            aria-label="Close without changing your choice"
          >
            <span className="material-symbols-outlined" aria-hidden="true">close</span>
          </button>
        )}
      </div>
    </div>
  );
}
