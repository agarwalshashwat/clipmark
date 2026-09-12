/**
 * Tests for the extension build guard (audit gap #7).
 *
 * Guards the pure logic that fails a production build when config.js points at
 * a local dev server. Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertProdApiBase,
  assertNoHardcodedApiUrls,
  findHardcodedApiUrls,
} from '../../extension/scripts/api-base-guard.mjs';

describe('assertProdApiBase', () => {
  it('accepts the production URL and returns it', () => {
    const src = "const API_BASE = 'https://clipmark.mithahara.com';";
    assert.equal(assertProdApiBase(src), 'https://clipmark.mithahara.com');
  });

  it('rejects a localhost API_BASE', () => {
    const src = "const API_BASE = 'http://localhost:3000';";
    assert.throws(() => assertProdApiBase(src), /local dev server/);
  });

  it('rejects a 127.0.0.1 API_BASE', () => {
    const src = "const API_BASE = 'http://127.0.0.1:3000';";
    assert.throws(() => assertProdApiBase(src), /local dev server/);
  });

  it('is case-insensitive about LOCALHOST', () => {
    const src = "const API_BASE = 'http://LOCALHOST:3000';";
    assert.throws(() => assertProdApiBase(src), /local dev server/);
  });

  it('throws when API_BASE is absent', () => {
    assert.throws(() => assertProdApiBase('const SOMETHING_ELSE = 1;'), /Could not find API_BASE/);
  });

  it('matches the actual committed config.js (double-quoted or single)', () => {
    // Sanity: the real production config must pass the guard.
    const src = "const API_BASE = 'https://clipmark.mithahara.com';\nglobalThis.API_BASE = API_BASE;";
    assert.doesNotThrow(() => assertProdApiBase(src));
  });
});

describe('findHardcodedApiUrls', () => {
  const apiBase = 'https://clipmark.mithahara.com';

  it('flags a literal endpoint URL — the exact bug fixed for REMINDERS_API', () => {
    const files = [
      {
        path: 'background/background.js',
        source: "const REMINDERS_API = 'https://clipmark.mithahara.com/api/reminders';",
      },
    ];
    assert.deepEqual(findHardcodedApiUrls(apiBase, files), ['background/background.js']);
  });

  it('flags a literal endpoint URL built with a template literal too', () => {
    const files = [
      {
        path: 'background/background.js',
        source: 'await fetch(`https://clipmark.mithahara.com/api/reminders/${id}/done`);',
      },
    ];
    assert.deepEqual(findHardcodedApiUrls(apiBase, files), ['background/background.js']);
  });

  it('allows the bare-origin API_BASE fallback pattern (path appended separately)', () => {
    const files = [
      {
        path: 'popup/dashboard.js',
        source:
          "const API_BASE = globalThis.API_BASE || 'https://clipmark.mithahara.com';\n" +
          'await fetch(`${API_BASE}/api/reminders`);',
      },
    ];
    assert.deepEqual(findHardcodedApiUrls(apiBase, files), []);
  });

  it('allows a bare-origin literal with no /api/ path (e.g. a marketing link)', () => {
    const files = [
      {
        path: 'popup/dashboard.js',
        source: "el.href = 'https://clipmark.mithahara.com/upgrade';",
      },
    ];
    assert.deepEqual(findHardcodedApiUrls(apiBase, files), []);
  });

  it('allows an unrelated hardcoded origin used for a non-API purpose', () => {
    // e.g. external-messaging.module.js's APP_ORIGIN allowlist constant.
    const files = [
      {
        path: 'external-messaging.module.js',
        source: "export const APP_ORIGIN = 'https://clipmark.mithahara.com';",
      },
    ];
    assert.deepEqual(findHardcodedApiUrls(apiBase, files), []);
  });

  it('reports every offending file, not just the first', () => {
    const files = [
      { path: 'a.js', source: "'https://clipmark.mithahara.com/api/a'" },
      { path: 'b.js', source: "const b = 1;" },
      { path: 'c.js', source: "'https://clipmark.mithahara.com/api/c'" },
    ];
    assert.deepEqual(findHardcodedApiUrls(apiBase, files), ['a.js', 'c.js']);
  });
});

describe('assertNoHardcodedApiUrls', () => {
  it('does not throw when nothing is offending', () => {
    assert.doesNotThrow(() =>
      assertNoHardcodedApiUrls('https://clipmark.mithahara.com', [
        { path: 'popup/dashboard.js', source: "globalThis.API_BASE || 'https://clipmark.mithahara.com'" },
      ]),
    );
  });

  it('throws, naming the offending file, when a literal endpoint URL is found', () => {
    assert.throws(
      () =>
        assertNoHardcodedApiUrls('https://clipmark.mithahara.com', [
          { path: 'background/background.js', source: "'https://clipmark.mithahara.com/api/reminders'" },
        ]),
      /background\/background\.js/,
    );
  });
});
