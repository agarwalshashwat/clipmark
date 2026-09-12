'use client';

/**
 * Segment-level error boundary UI.
 *
 * app/global-error.tsx only catches failures in (or above) the root layout, and
 * it replaces the whole document to do it. Anything thrown inside a route
 * segment — most realistically a Supabase read for a shared collection or a
 * profile timing out — had no closer boundary, so it unmounted the entire page
 * chrome to show a document-level error.
 *
 * This is the in-place version: it keeps the surrounding layout, reports to
 * Sentry, and offers reset(), which is worth having here precisely because the
 * likely cause is transient. Rendered by the thin error.tsx files that Next
 * requires per segment.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export function RouteError({
  error,
  reset,
  title,
  message,
  /** Compact variant for /embed, which renders inside a third-party iframe. */
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
        padding: compact ? '24px 16px' : '80px 24px',
        color: 'var(--text)',
        fontFamily: 'var(--font)',
      }}
    >
      <div style={{ maxWidth: 460, textAlign: 'center' }}>
        {!compact && (
          <div
            style={{
              width: 56,
              height: 56,
              margin: '0 auto 20px',
              borderRadius: 14,
              background: 'var(--accent-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--brand-ink)',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 26 }}>
              cloud_off
            </span>
          </div>
        )}

        <h1
          style={{
            fontSize: compact ? 16 : 24,
            fontWeight: 800,
            letterSpacing: '-0.5px',
            margin: '0 0 10px',
          }}
        >
          {title}
        </h1>

        <p
          style={{
            fontSize: compact ? 13 : 15,
            lineHeight: 1.6,
            color: 'var(--text-sub)',
            margin: '0 0 24px',
          }}
        >
          {message}
        </p>

        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center',
          }}
        >
          <button
            type="button"
            onClick={reset}
            style={{
              padding: compact ? '10px 20px' : '12px 26px',
              borderRadius: 12,
              border: 'none',
              cursor: 'pointer',
              background: 'var(--accent-strong)',
              color: '#ffffff',
              fontSize: compact ? 13 : 15,
              fontWeight: 700,
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>

          {!compact && (
            <a
              href="/"
              style={{
                padding: '12px 26px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 15,
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              Back to home
            </a>
          )}
        </div>

        {error.digest && (
          <p style={{ marginTop: 24, fontSize: 12, color: 'var(--text-muted)' }}>
            Reference: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
