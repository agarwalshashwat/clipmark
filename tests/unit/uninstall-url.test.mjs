/**
 * Unit tests for the uninstall-feedback URL (v1.0.6).
 *
 * Chrome opens the URL registered with chrome.runtime.setUninstallURL() when the
 * extension is removed. By then there is nothing left to run — no popup, no
 * content script, the worker is gone — so a URL that is wrong is not
 * recoverable and not observable: nobody complains that an uninstall survey
 * didn't load. That is the whole reason this logic is pulled out of
 * background.js and asserted here.
 *
 * The property that matters most is the privacy one: ?v= carries the extension
 * version and NOTHING else, and only when it really looks like a version.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  UNINSTALL_PATH,
  buildUninstallUrl,
  normaliseVersion,
  registerUninstallUrl,
} from '../../extension/src/background/uninstall-url.js';

const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../extension/manifest.json', import.meta.url)), 'utf8'),
);

describe('normaliseVersion', () => {
  it('accepts the shapes a Chrome manifest version can take', () => {
    for (const v of ['1', '1.0', '1.0.6', '1.0.6.2']) {
      assert.equal(normaliseVersion(v), v);
    }
    assert.equal(normaliseVersion('  1.0.6  '), '1.0.6');
  });

  it('rejects everything else rather than passing it through', () => {
    for (const v of [
      'user@example.com',
      '1.0.6-beta',
      'abc',
      '<script>',
      '1.0.6&id=42',
      'a'.repeat(40),
      '',
      '   ',
      null,
      undefined,
      42,
      {},
      [],
    ]) {
      assert.equal(normaliseVersion(v), null, `${JSON.stringify(v)} should be rejected`);
    }
  });
});

describe('buildUninstallUrl', () => {
  it('points at the hosted survey on the configured origin', () => {
    assert.equal(
      buildUninstallUrl({ apiBase: 'https://clipmark.mithahara.com', version: '1.0.6' }),
      'https://clipmark.mithahara.com/uninstall?v=1.0.6',
    );
  });

  it('falls back to the production origin when API_BASE is unset', () => {
    assert.equal(
      buildUninstallUrl({ version: '1.0.6' }),
      'https://clipmark.mithahara.com/uninstall?v=1.0.6',
    );
  });

  it('follows API_BASE so a dev build does not point at production', () => {
    assert.equal(
      buildUninstallUrl({ apiBase: 'http://localhost:3000', version: '1.0.6' }),
      'http://localhost:3000/uninstall?v=1.0.6',
    );
  });

  it('strips a trailing slash instead of emitting //uninstall', () => {
    // A `//uninstall` 308-redirects rather than resolving directly — the same
    // trap app/lib/constants.ts documents for APP_URL.
    assert.equal(
      buildUninstallUrl({ apiBase: 'https://clipmark.mithahara.com/', version: '1.0.6' }),
      'https://clipmark.mithahara.com/uninstall?v=1.0.6',
    );
  });

  it('omits ?v= entirely rather than attaching a junk value', () => {
    for (const version of ['nope', '', null, undefined, 'user@example.com']) {
      assert.equal(
        buildUninstallUrl({ apiBase: 'https://clipmark.mithahara.com', version }),
        'https://clipmark.mithahara.com/uninstall',
        `version ${JSON.stringify(version)} should be dropped, not appended`,
      );
    }
  });

  // The privacy claim, asserted rather than asserted-in-a-comment.
  it('never carries anything but the version in the query string', () => {
    const url = new URL(buildUninstallUrl({ version: '1.0.6' }));
    assert.deepEqual([...url.searchParams.keys()], ['v']);
    assert.equal(url.pathname, UNINSTALL_PATH);
  });
});

describe('registerUninstallUrl', () => {
  /** Minimal chrome.runtime double. */
  function fakeRuntime({ version = '1.0.6', fail = false, missing = false } = {}) {
    const calls = [];
    const runtime = {
      getManifest: () => ({ version }),
      ...(missing
        ? {}
        : {
            setUninstallURL: async (url) => {
              if (fail) throw new Error('nope');
              calls.push(url);
            },
          }),
    };
    return { runtime, calls };
  }

  it('registers the built URL', async () => {
    const { runtime, calls } = fakeRuntime();
    const result = await registerUninstallUrl({ runtime, apiBase: 'https://clipmark.mithahara.com' });

    assert.equal(result, 'https://clipmark.mithahara.com/uninstall?v=1.0.6');
    assert.deepEqual(calls, ['https://clipmark.mithahara.com/uninstall?v=1.0.6']);
  });

  it('reads the version from the manifest rather than a hardcoded constant', async () => {
    const { runtime, calls } = fakeRuntime({ version: '9.9.9' });
    await registerUninstallUrl({ runtime, apiBase: 'https://clipmark.mithahara.com' });
    assert.match(calls[0], /\?v=9\.9\.9$/);
  });

  // Failing to register a survey URL must never break startup for someone who
  // is not uninstalling anything.
  it('never throws when the API is missing or the call fails', async () => {
    assert.equal(await registerUninstallUrl({ runtime: fakeRuntime({ missing: true }).runtime }), null);
    assert.equal(await registerUninstallUrl({ runtime: fakeRuntime({ fail: true }).runtime }), null);
    assert.equal(await registerUninstallUrl({ runtime: undefined }), null);
  });
});

describe('wiring', () => {
  const background = readFileSync(
    fileURLToPath(new URL('../../extension/src/background/background.js', import.meta.url)),
    'utf8',
  );

  it('registers on install AND on startup', () => {
    // onInstalled alone would mean a browser restart never re-registers, so the
    // URL would only ever be set by the update that first shipped it.
    assert.match(background, /import \{ registerUninstallUrl \}/);
    assert.match(background, /chrome\.runtime\.onStartup\.addListener/);

    const calls = background.match(/registerUninstallUrl\(\)/g) ?? [];
    assert.ok(calls.length >= 2, `expected install + startup registration, saw ${calls.length}`);
  });

  it('builds the real production URL from the shipped manifest', () => {
    assert.equal(
      buildUninstallUrl({ apiBase: 'https://clipmark.mithahara.com', version: manifest.version }),
      `https://clipmark.mithahara.com/uninstall?v=${manifest.version}`,
    );
  });
});
