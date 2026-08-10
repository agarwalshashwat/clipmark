/**
 * constants.js ↔ constants.module.js twin parity.
 *
 * `src/constants.js` is a classic content script (injected into youtube.com
 * only, registers its names on globalThis); `src/constants.module.js` is the
 * ESM twin the extension *pages* (dashboard, side panel) and the unit tests
 * import. CLAUDE.md's twin-file convention says to edit both together, and
 * until now nothing enforced that for this pair — which is how the dashboard
 * ended up reading a bare `TITLE_TRUNCATE_LENGTH` that only the content-script
 * twin defines.
 *
 * This runs the classic twin in a VM sandbox (it is pure — no chrome/DOM at
 * top level), then diffs every value it registers on globalThis against the
 * module twin's exports.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import * as moduleTwin from '../../extension/src/constants.module.js';

const classicSource = readFileSync(
  fileURLToPath(new URL('../../extension/src/constants.js', import.meta.url)),
  'utf8',
);

/** Names the classic twin registers on globalThis, with their values. */
function loadClassicTwin() {
  const sandbox = {};
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(classicSource, sandbox, { filename: 'constants.js' });
  const { globalThis: _self, ...registered } = sandbox;
  return registered;
}

const classic = loadClassicTwin();

describe('constants twins', () => {
  it('the classic twin registers its names on globalThis', () => {
    // Guards the registration block itself: if it were dropped, the packaged
    // content.js would ReferenceError (which is what content-globals-guard.mjs
    // catches at build time — this catches it in the source, far earlier).
    assert.ok(Object.keys(classic).length > 10, 'expected constants.js to register globals');
  });

  it('every name the module twin exports also exists in the classic twin', () => {
    // constants.module.js may legitimately export page-only helpers the content
    // script has no use for, so only names present in BOTH are compared for
    // equality below. This assertion covers the reverse direction that matters:
    // a *shared* constant must not be classic-only.
    const missing = ['TITLE_TRUNCATE_LENGTH', 'TRANSCRIPT_TRUNCATE_LENGTH', 'APP_EXPORT_PREFIX']
      .filter((name) => !(name in classic));
    assert.deepEqual(missing, [], 'string limits must be defined in the classic twin');
  });

  it('primitive constants defined in both twins hold identical values', () => {
    const drifted = [];
    for (const [name, moduleValue] of Object.entries(moduleTwin)) {
      if (!(name in classic)) continue;
      if (typeof moduleValue === 'function') continue; // behaviour is covered by logic.test.mjs
      const classicValue = classic[name];
      if (typeof moduleValue === 'object' && moduleValue !== null) {
        try {
          assert.deepEqual(classicValue, moduleValue);
        } catch {
          drifted.push(name);
        }
        continue;
      }
      if (classicValue !== moduleValue) drifted.push(`${name} (${classicValue} vs ${moduleValue})`);
    }
    assert.deepEqual(drifted, [], 'constants.js and constants.module.js have drifted');
  });

  it('TITLE_TRUNCATE_LENGTH specifically agrees across the twins', () => {
    // Called out on its own because the dashboard page now imports it from the
    // module twin while content.js still reads the classic global; a silent
    // drift here would truncate titles differently on the two surfaces.
    assert.equal(moduleTwin.TITLE_TRUNCATE_LENGTH, 60);
    assert.equal(classic.TITLE_TRUNCATE_LENGTH, moduleTwin.TITLE_TRUNCATE_LENGTH);
  });
});
