/**
 * Shared Sentry options for all three Next.js runtimes (browser, Node, edge).
 *
 * Imported by instrumentation.ts and instrumentation-client.ts so the three
 * inits can't drift. Everything here is safe to inline into the client bundle —
 * the DSN is public by design (it only permits writing events, never reading).
 */

/**
 * Public DSN. Absent → the SDK stays completely dormant.
 *
 * IMPORTANT: Next inlines NEXT_PUBLIC_* at BUILD time, in server bundles too —
 * changing it in Vercel requires a redeploy, not just a restart. SENTRY_DSN (no
 * NEXT_PUBLIC_ prefix) is read at runtime and takes precedence, so the server
 * can be repointed without rebuilding. On the client it resolves to undefined
 * and the public var is used, which is the only option there anyway.
 */
export const SENTRY_DSN = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

/**
 * Reporting is off unless a DSN is present AND we're in a real deployment.
 *
 * Local `next dev` would burn the 5k errors/month free quota on hot-reload
 * noise and mix development stack traces into production issues. Set
 * NEXT_PUBLIC_SENTRY_DEV=1 to opt in when you deliberately want to test.
 */
export const SENTRY_ENABLED =
  Boolean(SENTRY_DSN) &&
  (process.env.NODE_ENV === 'production' || process.env.NEXT_PUBLIC_SENTRY_DEV === '1');

/**
 * NEXT_PUBLIC_VERCEL_ENV is injected automatically by Vercel ('production' |
 * 'preview' | 'development'), which keeps preview-deploy noise out of the
 * production environment filter without any manual config.
 */
const environment =
  process.env.NEXT_PUBLIC_SENTRY_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development';

/** Vercel injects the commit SHA; lets Sentry tie an issue to a deploy. */
const release = process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA;

export const sentryBaseOptions = {
  dsn: SENTRY_DSN,
  enabled: SENTRY_ENABLED,
  environment,
  ...(release ? { release } : {}),

  // Logs "[Sentry] Sending envelope..." to the console. Useful for confirming a
  // deploy is really reporting; noisy, so keep it off unless you're verifying.
  debug: process.env.NEXT_PUBLIC_SENTRY_DEBUG === '1',

  // Errors only. Tracing/replay/profiling are deliberately off: the free plan's
  // span budget disappears fast and we have no performance question to answer
  // yet. Turn tracing on with a low sample rate if that changes.
  tracesSampleRate: 0,

  /**
   * Never attach IP addresses, cookies, or request bodies. Clipmark handles
   * user emails and private bookmark titles; an error report is not a reason to
   * ship any of that to a third party. Leave this false.
   */
  sendDefaultPii: false,

  // Browser-extension and network noise that isn't actionable and isn't ours.
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    'Non-Error promise rejection captured',
    /^Failed to fetch$/,
    /^NetworkError/,
    /^Load failed$/,
    // Next.js aborts in-flight RSC requests on navigation; not a real fault.
    'AbortError',
  ] as (string | RegExp)[],
};
