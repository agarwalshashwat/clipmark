'use client';

/**
 * Error boundary body shared by the public share surfaces — `/v/{shareId}`,
 * `/u/{username}` and `/embed/{shareId}`.
 *
 * Those three pages are the only ones a stranger reaches without an account,
 * and all three do network work (Supabase reads, YouTube metadata) while
 * rendering. Without a segment-level boundary a thrown error unwinds to
 * `global-error.tsx`, which discards the root layout and shows the generic
 * "Something went wrong" — losing the nav and telling a first-time visitor
 * nothing about what they clicked.
 *
 * A `notFound()` is NOT routed here; React treats it as a separate signal that
 * lands on the nearest `not-found.tsx`. So this file only ever sees a real
 * fault, which is why it offers `reset()` (a transient Supabase timeout usually
 * clears on retry) where the 404 page offers navigation instead.
 *
 * `compact` renders the iframe-sized variant for the embed surface.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export function ShareSurfaceError({
  error,
  reset,
  compact = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  compact?: boolean;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? '28px 20px' : '96px 32px',
        minHeight: compact ? '100%' : 420,
        textAlign: 'center',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ maxWidth: compact ? 340 : 460 }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: compact ? 30 : 40, color: 'var(--gray-400)' }}
          aria-hidden="true"
        >
          cloud_off
        </span>
        <h1
          style={{
            fontSize: compact ? 15 : 24,
            fontWeight: compact ? 700 : 800,
            fontFamily: 'var(--font-display)',
            letterSpacing: compact ? undefined : '-0.5px',
            color: 'var(--text)',
            margin: compact ? '10px 0 6px' : '16px 0 10px',
          }}
        >
          This page didn&apos;t load
        </h1>
        <p
          style={{
            fontSize: compact ? 13 : 15.5,
            lineHeight: 1.65,
            color: 'var(--text-muted)',
            margin: compact ? '0 0 16px' : '0 0 26px',
          }}
        >
          Something went wrong on our side, not yours. The error has been reported. Trying
          again usually works.
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
              padding: compact ? '9px 18px' : '12px 24px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'var(--accent-strong)',
              color: '#ffffff',
              fontSize: compact ? 13 : 14.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Try again
          </button>
          {!compact && (
            <a
              href="/"
              style={{
                padding: '12px 24px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--btn-secondary-bg)',
                color: 'var(--btn-secondary-text)',
                border: '1px solid var(--border)',
                fontSize: 14.5,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              Go to ClipMark
            </a>
          )}
        </div>
        {error.digest && (
          <p style={{ marginTop: 22, fontSize: 12, color: 'var(--text-faint)' }}>
            Reference: <code>{error.digest}</code>
          </p>
        )}
      </div>
    </div>
  );
}
