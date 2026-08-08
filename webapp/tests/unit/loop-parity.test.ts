/**
 * Saved A–B loop parity — webapp twin vs. extension engine.
 *
 * `webapp/app/dashboard/_utils/loop.ts` duplicates the read-only helpers from
 * `extension/src/loop.module.js` (the extension module sits outside the Next
 * project root). This test imports BOTH and asserts identical results, so the
 * twins can't drift and a loop can't render one range in the dashboard while
 * the player loops another.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isLoopBookmark as webappIsLoop,
  loopEndForBookmark as webappLoopEnd,
  formatLoopClock as webappClock,
  formatLoopRange,
} from '../../app/dashboard/_utils/loop.js';
import {
  isLoopBookmark as extensionIsLoop,
  loopEndForBookmark as extensionLoopEnd,
  formatLoopClock as extensionClock,
  formatLoopRange as extensionRange,
} from '../../../extension/src/loop.module.js';

const CASES: { name: string; bookmark: any }[] = [
  { name: 'a saved loop', bookmark: { timestamp: 42, loop: { end: 75 } } },
  { name: 'a loop starting at zero', bookmark: { timestamp: 0, loop: { end: 5 } } },
  { name: 'a plain bookmark', bookmark: { timestamp: 42, description: 'note' } },
  { name: 'an inverted range', bookmark: { timestamp: 75, loop: { end: 42 } } },
  { name: 'a zero-length range', bookmark: { timestamp: 42, loop: { end: 42 } } },
  { name: 'loop object without an end', bookmark: { timestamp: 42, loop: {} } },
  { name: 'null loop', bookmark: { timestamp: 42, loop: null } },
  { name: 'no timestamp', bookmark: { loop: { end: 75 } } },
  { name: 'non-numeric end', bookmark: { timestamp: 42, loop: { end: '75' } } },
  { name: 'NaN end', bookmark: { timestamp: 42, loop: { end: NaN } } },
  { name: 'fractional range', bookmark: { timestamp: 42.4, loop: { end: 42.9 } } },
];

describe('loop helpers: webapp twin matches the extension engine', () => {
  for (const { name, bookmark } of CASES) {
    it(name, () => {
      assert.equal(webappIsLoop(bookmark), extensionIsLoop(bookmark), `isLoopBookmark diverged for: ${name}`);
      assert.equal(webappLoopEnd(bookmark), extensionLoopEnd(bookmark), `loopEndForBookmark diverged for: ${name}`);
    });
  }

  it('null/undefined records are handled the same', () => {
    const extIsLoop = extensionIsLoop as (b: unknown) => boolean;
    const extEnd = extensionLoopEnd as (b: unknown) => number | null;
    assert.equal(webappIsLoop(null), extIsLoop(null));
    assert.equal(webappIsLoop(undefined), extIsLoop(undefined));
    assert.equal(webappLoopEnd(null), extEnd(null));
  });
});

describe('formatLoopClock parity', () => {
  const SECONDS = [0, 1, 59, 60, 61, 75, 599, 600, 3599, 3600, 3725, 36000, -5, 42.9];
  for (const s of SECONDS) {
    it(`renders ${s} identically`, () => {
      assert.equal(webappClock(s), (extensionClock as (n: unknown) => string)(s));
    });
  }

  it('handles junk the same way', () => {
    const ext = extensionClock as (n: unknown) => string;
    assert.equal(webappClock(NaN), ext(NaN));
    assert.equal(webappClock(null), ext(null));
    assert.equal(webappClock(undefined), ext(undefined));
  });
});

describe('formatLoopRange parity', () => {
  // No longer webapp-only: the side panel rendered saved loops as POINT
  // bookmarks while the dashboard showed the range, so the same loop looked
  // like two different things depending on which surface you opened. The
  // extension twin now carries the helper too, and these cases diff them.
  it('renders the A → B range for a loop', () => {
    assert.equal(formatLoopRange({ timestamp: 42, loop: { end: 75 } }), '0:42 → 1:15');
  });

  it('returns null for a plain bookmark so the caller falls back', () => {
    assert.equal(formatLoopRange({ timestamp: 42 }), null);
    assert.equal(formatLoopRange(null), null);
  });

  for (const { name, bookmark } of CASES) {
    it(`matches the extension twin for ${name}`, () => {
      const ext = extensionRange as (b: unknown) => string | null;
      assert.equal(formatLoopRange(bookmark), ext(bookmark), `formatLoopRange diverged for: ${name}`);
    });
  }

  it('handles null/undefined identically', () => {
    const ext = extensionRange as (b: unknown) => string | null;
    assert.equal(formatLoopRange(null), ext(null));
    assert.equal(formatLoopRange(undefined), ext(undefined));
  });
});
