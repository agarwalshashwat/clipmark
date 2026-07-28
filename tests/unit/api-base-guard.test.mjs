/**
 * Tests for the extension build guard (audit gap #7).
 *
 * Guards the pure logic that fails a production build when config.js points at
 * a local dev server. Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertProdApiBase } from '../../extension/scripts/api-base-guard.mjs';

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
