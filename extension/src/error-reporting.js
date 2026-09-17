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

/**
 * Serialises a SESSION envelope.
 *
 * Why sessions at all: without them "0 errors" has no denominator, so a healthy
 * week and a week where the worker never started look identical on the
 * dashboard. One session per service-worker start gives Sentry's Release Health
 * a population to divide by, which is the whole point of this addition.
 *
 * Shape per Sentry's session protocol. `init: true` marks the first (and, for
 * us, only) transmission of this session id — we never send a follow-up "exited"
 * update, because an MV3 worker is torn down without warning and there is no
 * reliable moment to send one from. A session that is never updated is counted
 * as-is, which is exactly the denominator we want.
 *
 * @returns {string}
 */
export function buildSessionEnvelope(session, sentAt) {
  return [
    JSON.stringify({ sent_at: sentAt }),
    JSON.stringify({ type: 'session' }),
    JSON.stringify(session),
  ].join('\n');
}

/** Builds the session payload for one worker start. */
export function buildSession({ sessionId, started, release, environment }) {
  return {
    sid: sessionId,
    init: true,
    started,
    timestamp: started,
    status: 'ok',
    errors: 0,
    attrs: {
      ...(release ? { release } : {}),
      ...(environment ? { environment } : {}),
    },
  };
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

  // Injectable so the non-2xx handling below is asserted by a test rather than
  // by a comment. Defaults to the real thing.
  const doFetch = options.fetch ?? ((...args) => fetch(...args));
  const warn = options.warn ?? ((...args) => console.warn(...args));

  const release = `clipmark-extension@${manifestVersion()}`;
  const environment = dev ? 'development' : 'production';
  const seen = new Set();
  let sent = 0;
  /**
   * Set when ingest tells us to stop. Until this existed, a 429 (the 5k/month
   * free tier exhausted) or a 401/403 (DSN rotated, project deleted) was
   * indistinguishable from success: the response was never inspected, so the
   * dashboard read "0 errors" while every event was being thrown away. That is
   * the exact failure this whole module exists to rule out.
   */
  let stopped = false;

  /** The one place anything is POSTed, so the response check cannot be skipped. */
  async function send(body, kind) {
    try {
      const res = await doFetch(`${parsed.ingestUrl}?sentry_key=${parsed.publicKey}&sentry_version=7`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-sentry-envelope' },
        body,
      });
      // A fetch that resolves is not a fetch that succeeded.
      if (res && res.ok === false) {
        // 429 is a deliberate "stop", and 401/403 mean the credential is dead.
        // Retrying either just burns battery, so go quiet until the next reload.
        if (res.status === 429 || res.status === 401 || res.status === 403) stopped = true;
        warn(`[clipmark] Sentry rejected a ${kind}: HTTP ${res.status}${stopped ? ' — reporting paused until reload' : ''}`);
        return false;
      }
      return true;
    } catch {
      // Never let a failed report surface as a new error — that recurses.
      return false;
    }
  }

  async function capture(error, extra) {
    if (!enabled || stopped || sent >= MAX_EVENTS_PER_SESSION) return false;

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

    sent++;
    return send(buildEnvelope(event, new Date().toISOString()), 'event');
  }

  /**
   * Announce one session. Deliberately NOT subject to MAX_EVENTS_PER_SESSION or
   * the dedupe set: the denominator must not be rate-limited by the numerator.
   */
  async function session() {
    if (!enabled || stopped) return false;
    const payload = buildSession({
      sessionId: crypto.randomUUID(),
      started: new Date().toISOString(),
      release,
      environment,
    });
    return send(buildSessionEnvelope(payload, new Date().toISOString()), 'session');
  }

  return { capture, session, enabled };
}

/* ── Early capture ───────────────────────────────────────────────────────────
 *
 * These listeners attach when this MODULE is evaluated, not when
 * initErrorReporting() is called. That distinction is load-bearing: ESM
 * evaluates every import of a file before the file's own first statement, so a
 * handler installed inside init() cannot see anything thrown at the top level of
 * a sibling module. Each entry point imports this module FIRST, so attaching at
 * module scope closes that window.
 *
 * Anything arriving before a reporter exists is buffered and drained by init.
 * The buffer is capped: a context that imports this module only for its pure
 * helpers (the unit tests) never calls init, and an uncapped array there would
 * be a slow leak.
 */
const EARLY_BUFFER_MAX = 10;
const earlyEvents = [];
let liveReporter = null;

function handleGlobalError(error, extra) {
  if (liveReporter) {
    liveReporter.capture(error, extra);
    return;
  }
  if (earlyEvents.length < EARLY_BUFFER_MAX) earlyEvents.push([error, extra]);
}

globalThis.addEventListener?.('error', (event) => {
  handleGlobalError(event?.error ?? new Error(event?.message ?? 'Unknown error'), {
    source: event?.filename,
    line: event?.lineno,
  });
});

globalThis.addEventListener?.('unhandledrejection', (event) => {
  const reason = event?.reason;
  handleGlobalError(
    reason instanceof Error ? reason : new Error(`Unhandled rejection: ${String(reason)}`),
  );
});

/**
 * Binds the global handlers above to a reporter and returns it.
 *
 * @param {string} context - tag identifying the JS context
 * @param {{session?: boolean}} [options] - `session: true` announces one session
 *   for this context's lifetime. Only the background worker sets it; see
 *   buildSessionEnvelope for why one-per-worker-start is the right granularity.
 */
export function initErrorReporting(context, options = {}) {
  const reporter = createReporter(context, options);
  liveReporter = reporter;

  if (!reporter.enabled) {
    earlyEvents.length = 0; // nothing will ever send these; don't hold the refs
    return reporter;
  }

  for (const [error, extra] of earlyEvents.splice(0)) reporter.capture(error, extra);
  if (options.session) reporter.session();

  return reporter;
}

/** Test-only: drops the module-scope reporter binding and any buffered events. */
export function __resetErrorReporting() {
  liveReporter = null;
  earlyEvents.length = 0;
}
