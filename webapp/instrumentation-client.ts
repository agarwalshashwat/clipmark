/**
 * Browser-side Sentry init.
 *
 * Next.js only loads this file natively from 15.3 onwards, but @sentry/nextjs
 * injects it into the client webpack entry point itself, so it works on our
 * 14.2. Using this filename instead of the older sentry.client.config.ts avoids
 * a build-time deprecation warning and is Turbopack-ready.
 */
import * as Sentry from '@sentry/nextjs';
import { SENTRY_ENABLED, sentryBaseOptions } from './lib/sentry-config';

if (SENTRY_ENABLED) {
  Sentry.init(sentryBaseOptions);
}

/**
 * Reports slow/failed App Router navigations. Harmless with tracesSampleRate: 0
 * — it only emits when tracing is enabled — but wiring it now means turning
 * tracing on later is a one-line change.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
