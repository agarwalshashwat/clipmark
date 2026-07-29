/**
 * Manifest permission-posture tests (audit gap #6).
 *
 * These lock in the launch-hardening changes so a future edit can't silently
 * re-widen the extension's permissions. Pure static assertions against the
 * source manifest + package.json — no browser, no deps.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repoRoot = new URL('../../', import.meta.url);
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('extension/manifest.json', repoRoot)), 'utf8'),
);
const extPkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('extension/package.json', repoRoot)), 'utf8'),
);

describe('manifest permission posture', () => {
  it('does not request the broad "tabs" permission', () => {
    assert.ok(
      !(manifest.permissions ?? []).includes('tabs'),
      'the "tabs" permission was removed during launch hardening; host_permissions + activeTab cover the needed reads',
    );
  });

  it('does not expose web_accessible_resources to <all_urls>', () => {
    for (const entry of manifest.web_accessible_resources ?? []) {
      assert.ok(
        !(entry.matches ?? []).includes('<all_urls>'),
        `web_accessible_resources must be scoped to specific origins, found <all_urls> in ${JSON.stringify(entry.resources)}`,
      );
    }
  });

  it('scopes web_accessible_resources to the youtube + app origins only', () => {
    const allMatches = (manifest.web_accessible_resources ?? []).flatMap((e) => e.matches ?? []);
    assert.ok(allMatches.length > 0, 'expected at least one web_accessible_resources match entry');
    for (const m of allMatches) {
      assert.ok(
        /youtube\.com|clipmark\.mithahara\.com/.test(m),
        `unexpected web_accessible_resources origin: ${m}`,
      );
    }
  });

  it('does not allow localhost in externally_connectable', () => {
    const matches = manifest.externally_connectable?.matches ?? [];
    for (const m of matches) {
      assert.ok(
        !/localhost|127\.0\.0\.1/.test(m),
        `externally_connectable must not include a localhost origin, found: ${m}`,
      );
    }
  });

  it('externally_connectable is limited to the production app origin', () => {
    assert.deepEqual(manifest.externally_connectable?.matches, [
      'https://clipmark.mithahara.com/*',
    ]);
  });

  it('host_permissions are the expected minimal set', () => {
    assert.deepEqual(manifest.host_permissions, [
      '*://www.youtube.com/*',
      'https://clipmark.mithahara.com/*',
    ]);
  });

  it('manifest version matches extension/package.json version', () => {
    assert.equal(
      manifest.version,
      extPkg.version,
      `manifest.json (${manifest.version}) and package.json (${extPkg.version}) versions drifted`,
    );
  });
});

describe('error-reporting wiring', () => {
  it('declares the service worker as a module', () => {
    // background.js imports ../error-reporting.js. Chrome cannot resolve an
    // import in a CLASSIC worker, and the E2E suite loads extension/ from raw
    // source (tests/fixtures.ts), so dropping this breaks the worker outright.
    assert.equal(
      manifest.background.type,
      'module',
      'background.js uses ES imports — the worker must be declared type: module',
    );
  });

  it('injects the error bridge before the scripts that use it', () => {
    const js = manifest.content_scripts[0].js;
    const bridge = js.indexOf('src/error-report-bridge.js');
    assert.notEqual(bridge, -1, 'src/error-report-bridge.js must be a content script');
    // It registers globalThis.clipmarkReportError; content.js may call it during
    // its own initialisation, so the bridge has to run first.
    assert.equal(bridge, 0, 'the bridge must be the first content script');
    assert.ok(bridge < js.indexOf('src/content/content.js'));
  });
});
