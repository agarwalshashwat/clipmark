'use client';

/**
 * Root error boundary.
 *
 * Two jobs: report the crash to Sentry, and show something on-brand instead of
 * Next.js's unstyled default error screen. Without this file, a render error
 * anywhere above a route segment is swallowed — the user sees a blank page and
 * we never hear about it.
 *
 * global-error replaces the root layout entirely, so it must render its own
 * <html>/<body> and cannot rely on the fonts or providers set up there.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#f8fafc',
          fontFamily:
            "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
          color: '#1a1c1d',
        }}
      >
        <div style={{ maxWidth: 420, textAlign: 'center' }}>
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 24px',
              borderRadius: 16,
              background: 'rgba(20, 184, 166, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 28,
              color: '#14B8A6',
            }}
          >
            !
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', margin: '0 0 12px' }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: '#64748b', margin: '0 0 28px' }}>
            The error has been reported and we&apos;re looking into it. Your bookmarks are safe.
          </p>
          {/* A full reload, not reset() — if the root layout failed to render,
              re-rendering the same tree usually fails the same way. */}
          <a
            href="/"
            style={{
              display: 'inline-block',
              padding: '13px 28px',
              borderRadius: 12,
              background: '#14B8A6',
              color: '#ffffff',
              fontSize: 15,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Back to home
          </a>
          {error.digest && (
            <p style={{ marginTop: 28, fontSize: 12, color: '#94a3b8' }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
