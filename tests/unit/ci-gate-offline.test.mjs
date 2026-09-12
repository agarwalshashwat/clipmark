/**
 * Guard: nothing in `ci-extension-smoke` may depend on live youtube.com.
 *
 * Issue #84. The gate's specs used to navigate to the real watch page, so the
 * job's pass rate tracked YouTube's uptime, markup and the runner's bandwidth —
 * `.yt-bookmark-player-btn` failing a 40s `waitFor` was the standing symptom.
 * Gating tour-packaged.spec.ts multiplied it: eleven more real page loads, so
 * one bad YouTube window reddened a dozen tests at once.
 *
 * They now run against a local stand-in served at the real origin
 * (tests/fixtures/youtube-watch.ts). That is easy to undo by accident — a new
 * case in an existing spec copies an old `page.goto(TEST_VIDEO_URL)` and the
 * network dependency is quietly back, green until the next YouTube hiccup.
 *
 * Static, not runtime, for the same reason as test-audio-muted.test.mjs: by the
 * time a runtime assertion could observe it, the request has already gone out.
 *
 * NOTE the specs deliberately still USE youtube.com URLs — the origin has to be
 * genuine for Chrome to inject the content scripts from manifest.json. What
 * this checks is that every spec doing so also installs the interception.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The specs `ci-extension-smoke` runs, in job order. Keep in step with
 * .github/workflows/ci-launch-gates.yml — the last test below fails if the
 * workflow gains a Playwright step this list does not know about.
 */
const GATED_SPECS = [
  'tests/auth-bridge.spec.ts',
  'tests/design-consistency.spec.ts',
  'tests/tour-packaged.spec.ts',
  'tests/ci/extension-smoke.spec.ts',
];

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');

test('every CI-gated spec that opens a youtube.com URL also serves it locally', () => {
  const offenders = [];

  for (const spec of GATED_SPECS) {
    const src = read(spec);
    // Comments talk about youtube.com; code that navigates there is what counts.
    const navigates = /(?:goto|watchUrl|openWatchPage)\s*\(/.test(src)
      && /youtube\.com|TEST_VIDEO_URL|watchUrl|openWatchPage/.test(src.replace(/^\s*\*.*$/gm, ''));
    if (!navigates) continue;

    if (!src.includes('serveYouTubeFixture')) {
      offenders.push(spec);
    }
  }

  assert.deepEqual(offenders, [],
    'These CI-gated specs navigate to a watch page without installing the local ' +
    'fixture route, so they hit live youtube.com (issue #84). Call ' +
    "serveYouTubeFixture(context) from './fixtures/youtube-watch':\n  " +
    offenders.join('\n  '));
});

test('the fixture route covers every youtube.com request, not just the document', () => {
  const src = read('tests/fixtures/youtube-watch.ts');

  // A page-scoped route would leave any later page in the spec on the network.
  assert.match(src, /context\.route\(/,
    'the fixture must route on the CONTEXT so pages opened later are covered too');
  assert.match(src, /\*\*:\/\/\*\.youtube\.com\/\*\*/,
    'the route pattern must match every youtube.com request, not only /watch');

  // The catch-all arm is what stops transcript/thumbnail fetches escaping.
  const handler = src.slice(src.indexOf('export async function serveYouTubeFixture'));
  assert.ok(/route\.fulfill\([^)]*\)/s.test(handler.slice(handler.lastIndexOf('await route.fulfill'))),
    'every unmatched youtube.com request must be fulfilled locally, not left to the network');
  assert.ok(!/route\.continue\(\)|route\.fallback\(\)/.test(handler),
    'the fixture must never continue()/fallback() a youtube.com request to the real site');
});

test('the fixture clip is served with range support', () => {
  // Without Accept-Ranges/206 the media element reports seekable.end(0) === 0:
  // `currentTime = 27.5` silently stays 0 and every captured timestamp is zero,
  // which passes a "a bookmark was created" assertion while testing nothing.
  const src = read('tests/fixtures/youtube-watch.ts');
  assert.match(src, /'Accept-Ranges':\s*'bytes'/, 'clip responses must advertise Accept-Ranges');
  assert.match(src, /status:\s*206/, 'a Range request must be answered with 206 Partial Content');
  assert.match(src, /'Content-Range'/, 'a 206 must carry Content-Range');
});

test('the gated-spec list matches what the workflow actually runs', () => {
  const workflow = read('.github/workflows/ci-launch-gates.yml');
  const job = workflow.slice(
    workflow.indexOf('  extension-smoke:'),
    workflow.indexOf('  webapp-build:'),
  );
  assert.ok(job.length > 0, 'could not locate the extension-smoke job in the workflow');

  // Each npm script the job runs, mapped to the spec it executes.
  const scriptToSpec = {
    'test:auth-bridge': 'tests/auth-bridge.spec.ts',
    'test:design:rendered': 'tests/design-consistency.spec.ts',
    'test:yt:tour': 'tests/tour-packaged.spec.ts',
    'test:yt:smoke': 'tests/ci/extension-smoke.spec.ts',
  };

  const pkg = JSON.parse(read('package.json'));
  const ran = [];
  for (const [script, spec] of Object.entries(scriptToSpec)) {
    if (!job.includes(`npm run ${script}`)) continue;
    assert.ok(pkg.scripts[script]?.includes(spec),
      `package.json script "${script}" no longer runs ${spec} — update GATED_SPECS`);
    ran.push(spec);
  }

  assert.deepEqual(ran.sort(), [...GATED_SPECS].sort(),
    'the workflow runs a different set of specs than GATED_SPECS knows about — ' +
    'a newly gated spec must be added to the list above so the offline rule covers it');
});
