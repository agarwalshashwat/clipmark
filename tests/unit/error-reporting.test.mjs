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

import {
  SENTRY_DSN,
  parseDsn,
  parseStackFrames,
  isOwnScript,
  buildEvent,
  buildEnvelope,
} from '../../extension/src/error-reporting.js';

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
