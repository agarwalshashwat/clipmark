'use client';

/**
 * Shared body for the per-segment error boundaries on the public share surfaces
 * (/v/[shareId], /u/[username], /embed/[shareId]).
 *
 * Without a segment-level error.tsx, a throw inside any of these pages bubbles
 * to app/global-error.tsx — which replaces the *entire* document, nav and footer
 * included. A collection that fails to load would blank the whole site rather
 * than degrade in place. These boundaries keep the surrounding shell intact and
 * scope the failure to the segment that actually broke.
 *
 * reset() is offered here, unlike in global-error.tsx: there the root layout
 * itself failed, so re-rendering the same tree usually fails identically. Here
 * the shell rendered fine and the fault is typically a transient fetch, which is
 * exactly the case retrying fixes.
 */

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export function SegmentError({
  error,
  reset,
  title,
  message,
  /** Compact chrome for /embed, which renders inside someone else's iframe. */
  compact = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  title: string;
  message: string;
  compact?: boolean;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: compact ? '100%' : '60vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '24px 16px' : '64px 24px',
        background: 'var(--bg)',
        color: 'var(--text)',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 420 }}>
        <div
          style={{
            width: compact ? 44 : 56,
            height: compact ? 44 : 56,
            margin: '0 auto 20px',
            borderRadius: 14,
            background: 'var(--accent-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--brand-ink)',
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden="true"
            style={{ fontSize: compact ? 22 : 26 }}
          >
            cloud_off
          </span>
        </div>

        <h2
          style={{
            fontSize: compact ? 17 : 22,
            fontWeight: 800,
            letterSpacing: '-0.3px',
            margin: '0 0 10px',
          }}
        >
          {title}
        </h2>

        <p
          style={{
            fontSize: compact ? 13 : 15,
            lineHeight: 1.6,
            color: 'var(--text-muted)',
            margin: '0 0 24px',
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              padding: compact ? '10px 18px' : '12px 24px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--accent-strong)',
              color: '#ffffff',
              fontSize: compact ? 13 : 14,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>

          {/* target="_top" so the link escapes the iframe on /embed instead of
              loading the marketing site inside someone else's page. */}
          <a
            href="/"
            target={compact ? '_top' : undefined}
            style={{
              padding: compact ? '10px 18px' : '12px 24px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: compact ? 13 : 14,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Go to ClipMark
          </a>
        </div>

        {error.digest && (
          <p style={{ marginTop: 22, fontSize: 12, color: 'var(--text-muted)' }}>
            Reference: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
