/**
 * Regression: YouTube's timedtext endpoint answers 200 with an EMPTY body
 * (no proof-of-origin token). fetchTranscript() used `res.json()`, which threw
 * "Unexpected end of JSON input" and reported it to Sentry on every watch page.
 *
 * Runs the real fetchTranscript source out of content.js (a classic script,
 * not importable) in a vm sandbox with the bridge and fetch stubbed.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../extension/src/content/content.js', import.meta.url), 'utf8');
const start = source.indexOf('async function fetchTranscript()');
const end = source.indexOf('\n}\n', start) + 3;
const fnSource = source.slice(start, end);

function run(body) {
  const reported = [];
  const sandbox = {
    URLSearchParams,
    window: { location: { search: '?v=aircAruvnKk' } },
    getCaptionTracksFromPage: async () => [{ languageCode: 'en', kind: 'asr', baseUrl: 'https://yt.test/api/timedtext?v=aircAruvnKk' }],
    fetch: async () => new Response(body, { status: 200 }),
    debugLog: () => {},
    clipmarkReportError: (error) => reported.push(error),
  };
  vm.createContext(sandbox);
  vm.runInContext(
    `var cachedTranscript = null, transcriptFetchPromise = null, cachedTranscriptVideoId = null;\n${fnSource}`,
    sandbox,
  );
  return vm.runInContext('fetchTranscript()', sandbox).then(segments => ({ segments, reported }));
}

describe('fetchTranscript', () => {
  it('treats an empty timedtext body as no transcript, without reporting', async () => {
    const { segments, reported } = await run('');
    assert.equal(segments.length, 0);
    assert.equal(reported.length, 0);
  });

  it('still reports a non-empty body that is not JSON', async () => {
    const { segments, reported } = await run('<html>');
    assert.equal(segments.length, 0);
    assert.equal(reported.length, 1);
  });

  it('parses a real json3 body', async () => {
    const { segments } = await run(JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 500, segs: [{ utf8: 'hello' }] }] }));
    assert.equal(segments.length, 1);
    assert.equal(segments[0].text, 'hello');
  });
});
