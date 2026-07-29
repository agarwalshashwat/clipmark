/**
 * Error reporting for the extension — a direct Sentry envelope sender.
 *
 * WHY NOT @sentry/browser: the E2E suite loads the extension from raw source
 * (tests/fixtures.ts points --load-extension at extension/, not extension/dist),
 * and Chrome cannot resolve a bare npm specifier like '@sentry/browser' in an
 * unpacked load. Bundling the SDK would therefore work only in dist/ and break
 * every source-loaded test. The extension also has zero runtime dependencies
 * today, and Sentry's HTTP envelope API is small and stable enough that talking
 * to it directly costs ~100 lines instead of ~30KB and a build-time coupling.
 *
 * Trade-off accepted: no automatic breadcrumbs, sessions, or integrations. We
 * only want unhandled errors, which we hook explicitly.
 *
 * Contexts: the background service worker and the side panel import this module
 * directly. Content scripts CANNOT (they are classic scripts sharing one global
 * scope) — they forward to the background worker instead, via the classic
 * src/error-report-bridge.js.
 */

/** Public DSN for the `clipmark-extension` Sentry project. Write-only; safe to commit. */
export const SENTRY_DSN =
  'https://c0e75941afbfdfd8cb8b574d540c2c5e@o4511819786747904.ingest.us.sentry.io/4511819851956229';

/** Hard cap per worker/page lifetime. A hot error loop must not burn the 5k/month quota. */
export const MAX_EVENTS_PER_SESSION = 20;

/**
 * Splits a DSN into the pieces the ingest URL needs.
 * @returns {{ingestUrl: string, publicKey: string} | null} null if malformed.
 */
export function parseDsn(dsn) {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, '');
    if (!url.username || !projectId) return null;
    return {
      publicKey: url.username,
      ingestUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    };
  } catch {
    return null;
  }
}

/**
 * Parses a V8 stack string into Sentry frames.
 *
 * Chrome-only environment, so we only handle V8's two shapes:
 *   "    at fnName (url:line:col)"  and  "    at url:line:col"
 * Sentry renders frames oldest-first, which is the reverse of the stack string.
 */
export function parseStackFrames(stack) {
  if (typeof stack !== 'string') return [];
  const frames = [];
  for (const line of stack.split('\n')) {
    const match =
      /^\s*at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/.exec(line) ||
      /^\s*at\s+(.+?):(\d+):(\d+)$/.exec(line);
    if (!match) continue;
    const named = match.length === 5;
    frames.push({
      function: named ? match[1] : '?',
      filename: named ? match[2] : match[1],
      lineno: Number(named ? match[3] : match[2]),
      colno: Number(named ? match[4] : match[3]),
      in_app: true,
    });
  }
  return frames.reverse();
}

/**
 * Is this content-script error ours?
 *
 * Critical filter: content scripts run inside youtube.com, so the window
 * 'error' handler sees YouTube's OWN exceptions too. Reporting those would
 * flood the project with issues we cannot fix and exhaust the free quota in
 * hours. Only frames served from our own chrome-extension:// origin count.
 */
export function isOwnScript(filename) {
  return typeof filename === 'string' && filename.startsWith('chrome-extension://');
}

/** Builds a Sentry event payload from an Error-like value. */
export function buildEvent({ error, context, extra, release, environment, eventId, timestamp }) {
  const name = error?.name || 'Error';
  const message = error?.message ?? String(error ?? 'Unknown error');
  const frames = parseStackFrames(error?.stack);

  return {
    event_id: eventId,
    timestamp,
    platform: 'javascript',
    level: 'error',
    logger: 'clipmark-extension',
    ...(release ? { release } : {}),
    ...(environment ? { environment } : {}),
    tags: { context },
    exception: {
      values: [
        {
          type: name,
          value: message,
          ...(frames.length ? { stacktrace: { frames } } : {}),
        },
      ],
    },
    ...(extra && Object.keys(extra).length ? { extra } : {}),
  };
}

/**
 * Serialises an event into Sentry's newline-delimited envelope format.
 * @returns {string}
 */
export function buildEnvelope(event, sentAt) {
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: sentAt }),
    JSON.stringify({ type: 'event' }),
    JSON.stringify(event),
  ].join('\n');
}

/** True when running an unpacked/dev install (no Chrome Web Store update_url). */
function isUnpacked() {
  try {
    const manifest = chrome?.runtime?.getManifest?.();
    return !!manifest && !manifest.update_url;
  } catch {
    return false;
  }
}

function manifestVersion() {
  try {
    return chrome?.runtime?.getManifest?.()?.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/**
 * Creates a reporter.
 *
 * Off by default on unpacked/dev installs — local development would otherwise
 * spend the free-tier quota on errors we can already see in the console. Set
 * `globalThis.CLIPMARK_SENTRY_DEV = true` before init to opt in while testing.
 *
 * @param {string} context - tag identifying the JS context, e.g. 'extension-background'
 */
export function createReporter(context, options = {}) {
  const dsn = options.dsn ?? SENTRY_DSN;
  const parsed = parseDsn(dsn);
  const dev = isUnpacked();
  const enabled =
    Boolean(parsed) && (!dev || globalThis.CLIPMARK_SENTRY_DEV === true);

  const release = `clipmark-extension@${manifestVersion()}`;
  const environment = dev ? 'development' : 'production';
  const seen = new Set();
  let sent = 0;

  async function capture(error, extra) {
    if (!enabled || sent >= MAX_EVENTS_PER_SESSION) return false;

    // Collapse identical repeats — a broken interval would otherwise send the
    // same error hundreds of times.
    const key = `${error?.name}:${error?.message}`;
    if (seen.has(key)) return false;
    seen.add(key);

    const event = buildEvent({
      error,
      context: extra?.context ?? context,
      extra,
      release,
      environment,
      eventId: crypto.randomUUID().replace(/-/g, ''),
      timestamp: Date.now() / 1000,
    });

    try {
      sent++;
      await fetch(`${parsed.ingestUrl}?sentry_key=${parsed.publicKey}&sentry_version=7`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body: buildEnvelope(event, new Date().toISOString()),
      });
      return true;
    } catch {
      // Never let a failed report surface as a new error — that recurses.
      return false;
    }
  }

  return { capture, enabled };
}

/**
 * Installs global handlers for the current context and returns the reporter.
 *
 * Safe to call at the very top of a service worker: it registers listeners
 * synchronously so errors thrown during the rest of startup are still seen.
 */
export function initErrorReporting(context, options = {}) {
  const reporter = createReporter(context, options);
  if (!reporter.enabled) return reporter;

  globalThis.addEventListener?.('error', (event) => {
    reporter.capture(event?.error ?? new Error(event?.message ?? 'Unknown error'), {
      source: event?.filename,
      line: event?.lineno,
    });
  });

  globalThis.addEventListener?.('unhandledrejection', (event) => {
    const reason = event?.reason;
    reporter.capture(
      reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`),
    );
  });

  return reporter;
}
