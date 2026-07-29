/**
 * Server-side Sentry init (Node + edge runtimes).
 *
 * Next 14 requires `experimental.instrumentationHook: true` in next.config.mjs
 * for this file to be loaded at all.
 *
 * Sentry.init deliberately lives inside register() rather than in the older
 * sentry.server.config.ts / sentry.edge.config.ts files — @sentry/nextjs v10
 * prints a deprecation warning on every build if those files exist.
 */
import * as Sentry from '@sentry/nextjs';
import { SENTRY_ENABLED, sentryBaseOptions } from './lib/sentry-config';

export async function register() {
  if (!SENTRY_ENABLED) return;

  // Both runtimes take the same options today; kept separate because the edge
  // runtime has no access to Node APIs, so their integrations may diverge.
  if (process.env.NEXT_RUNTIME === 'nodejs' || process.env.NEXT_RUNTIME === 'edge') {
    Sentry.init(sentryBaseOptions);
  }
}

/**
 * Captures errors thrown in server components, server actions and route
 * handlers — including the Dodo webhook and the Supabase-backed API routes.
 *
 * NOTE: Next.js only calls this hook from 15.0 onwards; on our current 14.2 it
 * is simply never invoked, and server errors are instead captured by the
 * automatic wrapping that withSentryConfig applies at build time. Exporting it
 * now means the hook starts working the moment we upgrade, with no extra step.
 */
export const onRequestError = Sentry.captureRequestError;
