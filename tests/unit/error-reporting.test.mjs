/**
 * Unit tests for the extension's Sentry envelope builder.
 *
 * These matter more than usual: the reporter talks to Sentry's HTTP API by hand
 * (see src/error-reporting.js for why we don't bundle @sentry/browser), so
 * there is no SDK validating our payload shape. A malformed envelope is
 * silently dropped by Sentry's ingest — we'd believe monitoring worked when it
 * didn't. These tests pin the wire format.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  SENTRY_DSN,
  MAX_EVENTS_PER_SESSION,
  parseDsn,
  parseStackFrames,
  isOwnScript,
  buildEvent,
  buildEnvelope,
  buildSession,
  buildSessionEnvelope,
  createReporter,
} from '../../extension/src/error-reporting.js';

/** A reporter wired to a stub transport. No chrome, no network. */
function stubReporter(responses = [{ ok: true, status: 200 }], context = 'test-context') {
  const calls = [];
  const warnings = [];
  let i = 0;
  const reporter = createReporter(context, {
    fetch: async (url, init) => {
      calls.push({ url, ...init });
      return responses[Math.min(i++, responses.length - 1)];
    },
    warn: (msg) => warnings.push(msg),
  });
  return { reporter, calls, warnings };
}

/** The three newline-delimited JSON lines of an envelope. */
const envelopeLines = (body) => body.split('\n').map((l) => JSON.parse(l));

test('parseDsn splits the real DSN into ingest URL and public key', () => {
  const parsed = parseDsn(SENTRY_DSN);
  assert.ok(parsed, 'the committed DSN must be parseable');
  assert.match(parsed.ingestUrl, /^https:\/\/o\d+\.ingest\.us\.sentry\.io\/api\/\d+\/envelope\/$/);
  assert.match(parsed.publicKey, /^[a-f0-9]{32}$/);
});

test('parseDsn returns null for malformed input rather than throwing', () => {
  // A throwing DSN parser inside an error handler would recurse.
  assert.equal(parseDsn(''), null);
  assert.equal(parseDsn('not-a-url'), null);
  assert.equal(parseDsn('https://sentry.io/123'), null, 'missing public key');
  assert.equal(parseDsn('https://key@sentry.io'), null, 'missing project id');
});

test('parseStackFrames handles both V8 shapes and orders oldest-first', () => {
  const stack = [
    'Error: boom',
    '    at saveBookmark (chrome-extension://abc/assets/content.js:120:9)',
    '    at chrome-extension://abc/assets/content.js:44:3',
  ].join('\n');

  const frames = parseStackFrames(stack);
  assert.equal(frames.length, 2);
  // Sentry renders frames oldest-first, i.e. reversed from the stack string.
  assert.equal(frames[0].function, '?');
  assert.equal(frames[0].lineno, 44);
  assert.equal(frames[1].function, 'saveBookmark');
  assert.equal(frames[1].lineno, 120);
  assert.equal(frames[1].colno, 9);
});

test('parseStackFrames tolerates missing or non-string stacks', () => {
  assert.deepEqual(parseStackFrames(undefined), []);
  assert.deepEqual(parseStackFrames(null), []);
  assert.deepEqual(parseStackFrames('Error: no frames here'), []);
});

test('isOwnScript accepts only extension-origin files', () => {
  assert.equal(isOwnScript('chrome-extension://abc/assets/content.js'), true);
  // The whole point: content scripts see YouTube's own exceptions.
  assert.equal(isOwnScript('https://www.youtube.com/s/player/base.js'), false);
  assert.equal(isOwnScript(undefined), false);
  assert.equal(isOwnScript(''), false);
});

test('buildEvent produces a valid Sentry exception event', () => {
  const error = new Error('bookmark save failed');
  error.stack = 'Error: bookmark save failed\n    at save (chrome-extension://abc/x.js:1:1)';

  const event = buildEvent({
    error,
    context: 'extension-background',
    extra: { videoId: 'aircAruvnKk' },
    release: 'clipmark-extension@1.0.0',
    environment: 'production',
    eventId: 'a'.repeat(32),
    timestamp: 1_700_000_000,
  });

  assert.equal(event.event_id.length, 32, 'Sentry requires a 32-char hex event_id');
  assert.equal(event.platform, 'javascript');
  assert.equal(event.level, 'error');
  assert.equal(event.tags.context, 'extension-background');
  assert.equal(event.exception.values[0].type, 'Error');
  assert.equal(event.exception.values[0].value, 'bookmark save failed');
  assert.equal(event.exception.values[0].stacktrace.frames.length, 1);
  assert.equal(event.extra.videoId, 'aircAruvnKk');
});

test('buildEvent survives non-Error throwables', () => {
  // `throw 'string'` and rejected non-Errors are depressingly common.
  const event = buildEvent({ error: 'plain string failure', context: 'c', eventId: 'b'.repeat(32), timestamp: 1 });
  assert.equal(event.exception.values[0].type, 'Error');
  assert.equal(event.exception.values[0].value, 'plain string failure');
  assert.equal(event.exception.values[0].stacktrace, undefined, 'no frames → omit stacktrace');

  const nullEvent = buildEvent({ error: null, context: 'c', eventId: 'c'.repeat(32), timestamp: 1 });
  assert.equal(nullEvent.exception.values[0].value, 'Unknown error');
});

test('buildEvent omits empty optional fields rather than sending nulls', () => {
  const event = buildEvent({ error: new Error('x'), context: 'c', extra: {}, eventId: 'd'.repeat(32), timestamp: 1 });
  assert.ok(!('extra' in event));
  assert.ok(!('release' in event));
  assert.ok(!('environment' in event));
});

test('buildEnvelope emits exactly three newline-delimited JSON lines', () => {
  const event = buildEvent({ error: new Error('x'), context: 'c', eventId: 'e'.repeat(32), timestamp: 1 });
  const sentAt = '2026-07-29T00:00:00.000Z';
  const lines = buildEnvelope(event, sentAt).split('\n');

  assert.equal(lines.length, 3, 'envelope = header, item header, payload');
  assert.deepEqual(JSON.parse(lines[0]), { event_id: 'e'.repeat(32), sent_at: sentAt });
  assert.deepEqual(JSON.parse(lines[1]), { type: 'event' });
  assert.equal(JSON.parse(lines[2]).event_id, 'e'.repeat(32));
});


/* ── Sessions: the denominator ──────────────────────────────────────────────
 *
 * Without these, "0 errors" is unreadable — a healthy week and a week where the
 * worker never started look identical.
 */

test('buildSession marks an initial session with release and environment', () => {
  const session = buildSession({
    sessionId: 'f'.repeat(32),
    started: '2026-09-18T00:00:00.000Z',
    release: 'clipmark-extension@1.0.12',
    environment: 'production',
  });

  assert.equal(session.sid, 'f'.repeat(32));
  assert.equal(session.init, true, 'first transmission of this session id');
  assert.equal(session.status, 'ok');
  assert.equal(session.errors, 0);
  assert.equal(session.started, session.timestamp);
  assert.equal(session.attrs.release, 'clipmark-extension@1.0.12');
  assert.equal(session.attrs.environment, 'production');
});

test('buildSessionEnvelope uses the session item type, not event', () => {
  const session = buildSession({ sessionId: 'a'.repeat(32), started: '2026-09-18T00:00:00.000Z' });
  const lines = buildSessionEnvelope(session, '2026-09-18T00:00:01.000Z').split('\n');

  assert.equal(lines.length, 3);
  assert.deepEqual(JSON.parse(lines[0]), { sent_at: '2026-09-18T00:00:01.000Z' });
  assert.deepEqual(JSON.parse(lines[1]), { type: 'session' }, 'a session envelope is NOT type:event');
  assert.equal(JSON.parse(lines[2]).sid, 'a'.repeat(32));
});

test('reporter.session() POSTs one session envelope to the ingest endpoint', async () => {
  const { reporter, calls } = stubReporter();

  assert.equal(await reporter.session(), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, 'POST');
  assert.match(calls[0].url, /\/envelope\/\?sentry_key=[a-f0-9]{32}&sentry_version=7$/);
  assert.equal(calls[0].headers['Content-Type'], 'application/x-sentry-envelope');

  const [, itemHeader, payload] = envelopeLines(calls[0].body);
  assert.deepEqual(itemHeader, { type: 'session' });
  assert.equal(payload.init, true);
});

test('the session is not rate-limited by the event cap', async () => {
  // The denominator must not be throttled by the numerator: a context that has
  // already burned its event budget still has to report that it ran.
  const { reporter, calls } = stubReporter();
  for (let i = 0; i < MAX_EVENTS_PER_SESSION + 5; i++) {
    await reporter.capture(new Error(`distinct error ${i}`));
  }
  const afterEvents = calls.length;
  assert.equal(afterEvents, MAX_EVENTS_PER_SESSION, 'events are capped');

  assert.equal(await reporter.session(), true, 'the session still sends');
  assert.deepEqual(envelopeLines(calls[calls.length - 1].body)[1], { type: 'session' });
});

/* ── A resolved fetch is not a successful send ──────────────────────────────
 *
 * The regression this pins: the response used to be ignored entirely, so a 429
 * (free tier exhausted) or a 401/403 (DSN rotated) was indistinguishable from
 * success and the dashboard read "0 errors" while every event was discarded.
 */

test('a non-2xx ingest response is reported as a failure, not swallowed', async () => {
  const { reporter, warnings } = stubReporter([{ ok: false, status: 500 }]);

  assert.equal(await reporter.capture(new Error('boom')), false, 'must not claim success');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /HTTP 500/);
});

test('429 pauses reporting instead of hammering an exhausted quota', async () => {
  const { reporter, calls, warnings } = stubReporter([{ ok: false, status: 429 }, { ok: true, status: 200 }]);

  assert.equal(await reporter.capture(new Error('first')), false);
  assert.match(warnings[0], /HTTP 429/);
  assert.match(warnings[0], /paused until reload/);

  const afterFirst = calls.length;
  assert.equal(await reporter.capture(new Error('second')), false, 'stays quiet after a 429');
  assert.equal(await reporter.session(), false, 'sessions stop too');
  assert.equal(calls.length, afterFirst, 'no further POSTs are attempted');
});

test('a dead DSN (401/403) also pauses rather than retrying forever', async () => {
  for (const status of [401, 403]) {
    const { reporter, calls, warnings } = stubReporter([{ ok: false, status }]);
    assert.equal(await reporter.capture(new Error('x')), false);
    assert.match(warnings[0], new RegExp(`HTTP ${status}`));
    const after = calls.length;
    await reporter.capture(new Error('y'));
    assert.equal(calls.length, after, `stopped after ${status}`);
  }
});

test('a 2xx response still counts as success', async () => {
  const { reporter } = stubReporter([{ ok: true, status: 200 }]);
  assert.equal(await reporter.capture(new Error('fine')), true);
});

test('a thrown fetch is still swallowed — reporting must never recurse', async () => {
  const reporter = createReporter('test-context', {
    fetch: async () => { throw new Error('network down'); },
    warn: () => {},
  });
  assert.equal(await reporter.capture(new Error('boom')), false);
});

/* ── The instrumented catch sites ───────────────────────────────────────────
 *
 * Source-scanned rather than executed: these live inside content.js and the
 * panels, which need a browser. The value here is catching a silent REMOVAL —
 * the sites are easy to delete during an unrelated refactor, and nothing else
 * would notice.
 */
test('the silent-failure paths still forward to the reporter', () => {
  const read = (rel) =>
    readFileSync(fileURLToPath(new URL(`../../extension/src/${rel}`, import.meta.url)), 'utf8');

  const content = read('content/content.js');
  assert.match(content, /clipmarkReportError\?\.\(error, \{ where: 'saveSilentBookmark' \}\)/);
  assert.match(content, /clipmarkReportError\?\.\(error, \{ where: 'fetchTranscript' \}\)/);

  const background = read('background/background.js');
  assert.match(background, /where: 'backfillContentScripts'/);
  assert.match(background, /initErrorReporting\('extension-background', \{ session: true \}\)/);

  for (const page of ['popup/side-panel.js', 'popup/dashboard.js']) {
    assert.match(read(page), /errorReporter\.capture\(error, \{ where: 'refreshEntitlement' \}\)/, page);
  }
});

test('only the background announces a session', () => {
  const read = (rel) =>
    readFileSync(fileURLToPath(new URL(`../../extension/src/${rel}`, import.meta.url)), 'utf8');
  // Counting one user per worker start is the point; the panel and the dashboard
  // opening would otherwise inflate the denominator several times per session.
  for (const page of ['popup/side-panel.js', 'popup/dashboard.js']) {
    assert.doesNotMatch(read(page), /session:\s*true/, page);
  }
});
