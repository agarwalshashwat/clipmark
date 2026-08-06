/**
 * Unit tests for the install-time content-script backfill (v1.0.2).
 *
 * Regression cover for the v1.0.1 first-install bug: Chrome injects declared
 * content_scripts on navigation only, so a YouTube tab that was already open
 * when the extension installed had none, and everything that messages it failed
 * with "Content script not available" until the user reloaded by hand.
 *
 * The Chrome API calls live in src/background/background.js; every decision the
 * backfill makes lives in src/background/install-injection.js so it can be
 * tested without a browser. These tests drive that logic off the REAL manifest,
 * so a manifest edit that widens the match patterns shows up here.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  BACKFILL_REASONS,
  CONTENT_SCRIPT_MARKER,
  contentScriptMatchPatterns,
  isInjectableTab,
  matchPatternToRegExp,
  planInjections,
  shouldBackfillOnInstalled,
  shouldInjectIntoTab,
  urlMatchesAnyPattern,
} from '../../extension/src/background/install-injection.js';

const repoRoot = new URL('../../', import.meta.url);
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('extension/manifest.json', repoRoot)), 'utf8'),
);

describe('matchPatternToRegExp', () => {
  it('expands the scheme wildcard to http and https only', () => {
    const re = matchPatternToRegExp('*://www.youtube.com/*');
    assert.ok(re.test('https://www.youtube.com/watch?v=abc'));
    assert.ok(re.test('http://www.youtube.com/'));
    assert.ok(!re.test('ftp://www.youtube.com/'));
  });

  it('matches the bare domain and any subdomain for a *. host', () => {
    const re = matchPatternToRegExp('*://*.youtube.com/*');
    assert.ok(re.test('https://www.youtube.com/watch?v=abc'));
    assert.ok(re.test('https://m.youtube.com/watch?v=abc'));
    assert.ok(re.test('https://youtube.com/'));
    assert.ok(!re.test('https://youtube.com.evil.test/'));
    assert.ok(!re.test('https://notyoutube.com/'));
  });

  it('does not let a wildcard path escape the host', () => {
    const re = matchPatternToRegExp('*://www.youtube.com/*');
    assert.ok(!re.test('https://evil.test/?x=https://www.youtube.com/'));
  });

  it('returns null for patterns it cannot parse, so they match nothing', () => {
    assert.equal(matchPatternToRegExp('not a pattern'), null);
    assert.equal(matchPatternToRegExp('*://you*tube.com/*'), null);
    assert.equal(matchPatternToRegExp(''), null);
    assert.equal(matchPatternToRegExp(undefined), null);
    assert.equal(urlMatchesAnyPattern('https://www.youtube.com/', ['garbage']), false);
  });
});

describe('isInjectableTab', () => {
  it('accepts an ordinary http(s) tab', () => {
    assert.equal(isInjectableTab({ id: 7, url: 'https://www.youtube.com/watch?v=a' }), true);
  });

  it('rejects tabs that can never be scripted', () => {
    // No document to inject into / privileged pages / no tab id at all.
    assert.equal(isInjectableTab({ id: 7, url: 'https://www.youtube.com/', discarded: true }), false);
    assert.equal(isInjectableTab({ id: 7, url: 'chrome://extensions' }), false);
    assert.equal(isInjectableTab({ id: 7, url: 'about:blank' }), false);
    assert.equal(isInjectableTab({ id: -1, url: 'https://www.youtube.com/' }), false);
    assert.equal(isInjectableTab({ url: 'https://www.youtube.com/' }), false);
    // A tab we hold no host permission for comes back with no url at all.
    assert.equal(isInjectableTab({ id: 7 }), false);
    assert.equal(isInjectableTab(null), false);
  });
});

describe('planInjections', () => {
  const contentScripts = [
    { matches: ['*://*.youtube.com/*'], js: ['a.js', 'b.js'], css: ['a.css'] },
  ];

  it('plans the manifest\'s files for a matching tab', () => {
    const plans = planInjections({
      contentScripts,
      tabs: [{ id: 3, url: 'https://www.youtube.com/watch?v=abc' }],
    });
    assert.deepEqual(plans, [
      { tabId: 3, url: 'https://www.youtube.com/watch?v=abc', js: ['a.js', 'b.js'], css: ['a.css'] },
    ]);
  });

  it('skips non-matching and non-injectable tabs', () => {
    const plans = planInjections({
      contentScripts,
      tabs: [
        { id: 1, url: 'https://example.com/' },
        { id: 2, url: 'chrome://extensions' },
        { id: 3, url: 'https://www.youtube.com/', discarded: true },
        { id: 4 },
      ],
    });
    assert.deepEqual(plans, []);
  });

  it('honours exclude_matches', () => {
    const plans = planInjections({
      contentScripts: [{ ...contentScripts[0], exclude_matches: ['*://music.youtube.com/*'] }],
      tabs: [{ id: 5, url: 'https://music.youtube.com/watch?v=abc' }],
    });
    assert.deepEqual(plans, []);
  });

  it('unions overlapping entries in declaration order, without duplicates', () => {
    // Load order is load-bearing — the error bridge and constants.js must run
    // before content.js (see manifest.test.mjs).
    const plans = planInjections({
      contentScripts: [
        { matches: ['*://*.youtube.com/*'], js: ['bridge.js', 'content.js'] },
        { matches: ['*://www.youtube.com/*'], js: ['content.js', 'extra.js'] },
      ],
      tabs: [{ id: 9, url: 'https://www.youtube.com/watch?v=abc' }],
    });
    assert.deepEqual(plans[0].js, ['bridge.js', 'content.js', 'extra.js']);
  });

  it('tolerates a manifest with no content scripts', () => {
    assert.deepEqual(planInjections({}), []);
    assert.deepEqual(planInjections(), []);
  });
});

describe('shouldInjectIntoTab (double-injection guard)', () => {
  it('injects when the page carries no marker', () => {
    assert.equal(shouldInjectIntoTab(null, '1.0.2'), true);
    assert.equal(shouldInjectIntoTab(undefined, '1.0.2'), true);
    assert.equal(shouldInjectIntoTab('', '1.0.2'), true);
  });

  it('skips a tab that already ran this version\'s content scripts', () => {
    // The freshly-loaded-tab case: Chrome injected them itself, and a second
    // copy would double up every listener in the page.
    assert.equal(shouldInjectIntoTab('1.0.2', '1.0.2'), false);
  });

  it('replaces an orphaned script left behind by a previous version', () => {
    // After an update the old scripts are still in the page but their
    // chrome.runtime is invalidated — stale, not "already injected".
    assert.equal(shouldInjectIntoTab('1.0.1', '1.0.2'), true);
  });
});

describe('shouldBackfillOnInstalled', () => {
  it('runs for install and update', () => {
    assert.equal(shouldBackfillOnInstalled('install'), true);
    assert.equal(shouldBackfillOnInstalled('update'), true);
  });

  it('does not run for a browser update or an unknown reason', () => {
    assert.equal(shouldBackfillOnInstalled('chrome_update'), false);
    assert.equal(shouldBackfillOnInstalled('shared_module_update'), false);
    assert.equal(shouldBackfillOnInstalled(undefined), false);
  });

  it('BACKFILL_REASONS is the documented set', () => {
    assert.deepEqual(BACKFILL_REASONS, ['install', 'update']);
  });
});

describe('against the real manifest', () => {
  it('the query patterns are exactly the manifest\'s content-script matches', () => {
    assert.deepEqual(contentScriptMatchPatterns(manifest.content_scripts), ['*://*.youtube.com/*']);
  });

  it('plans every declared content-script file for an already-open watch tab', () => {
    const [plan] = planInjections({
      contentScripts: manifest.content_scripts,
      tabs: [{ id: 1, url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }],
    });
    assert.ok(plan, 'a YouTube watch tab must be planned for injection');
    assert.deepEqual(plan.js, manifest.content_scripts[0].js);
    // tour.js is Sub-tour A. It rides along on this injection — the first-run
    // tour not playing on install (bug 2) was downstream of it never arriving.
    assert.ok(plan.js.includes('src/content/tour.js'));
  });

  it('plans nothing for a non-YouTube tab', () => {
    assert.deepEqual(
      planInjections({
        contentScripts: manifest.content_scripts,
        tabs: [{ id: 1, url: 'https://clipmark.mithahara.com/dashboard' }],
      }),
      [],
    );
  });

  it('declares the "scripting" permission the backfill needs', () => {
    assert.ok(
      manifest.permissions.includes('scripting'),
      'chrome.scripting.executeScript requires the "scripting" permission',
    );
  });

  it('still does not request the broad "tabs" permission', () => {
    // The backfill falls back to filtering an unfiltered tabs.query itself
    // precisely so this stays out — see backfillContentScripts.
    assert.ok(!manifest.permissions.includes('tabs'));
  });

  it('adds no host permissions beyond the launch-hardened set', () => {
    assert.deepEqual(manifest.host_permissions, [
      '*://www.youtube.com/*',
      'https://clipmark.mithahara.com/*',
    ]);
  });

  it('the error bridge stamps the marker the guard reads', () => {
    const bridge = readFileSync(
      fileURLToPath(new URL('extension/src/error-report-bridge.js', repoRoot)),
      'utf8',
    );
    assert.ok(
      bridge.includes(`globalThis.${CONTENT_SCRIPT_MARKER} =`),
      `src/error-report-bridge.js must set globalThis.${CONTENT_SCRIPT_MARKER} — without it the backfill re-injects on every install`,
    );
    assert.equal(
      manifest.content_scripts[0].js[0],
      'src/error-report-bridge.js',
      'the marker only covers every injection route while the bridge runs first',
    );
  });
});
