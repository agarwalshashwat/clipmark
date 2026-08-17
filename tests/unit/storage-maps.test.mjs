/**
 * Bounding the chrome.storage.sync co-tenant maps.
 *
 * The bug these guard: `videoTitles` is a SINGLE storage item, subject to
 * QUOTA_BYTES_PER_ITEM (8192), and it grows on every video WATCHED — not every
 * video bookmarked, because scheduleTitleRefresh() writes a title on each SPA
 * navigation. At ~72 bytes per entry it crossed the ceiling after ~113 distinct
 * videos. Because the save path wrote the bookmark array and these maps in one
 * chrome.storage.sync.set(), the oversized cache then failed the BOOKMARK save
 * — the core flow broke for a user who had merely watched enough videos.
 *
 * The write split lives at the call sites (content/content.js,
 * background/background.js); these cover the pure bounding logic.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAP_BYTE_BUDGET,
  pruneMapToBudget,
  pruneVideoMaps,
  storageItemBytes,
} from '../../extension/src/storage-maps.module.js';

/** A realistic titles map for `count` videos, keyed like real YouTube ids. */
function titlesMap(count, prefix = 'vid') {
  const map = {};
  for (let i = 0; i < count; i++) {
    map[`${prefix}${String(i).padStart(8, '0')}`] =
      'But what is a neural network? | Deep learning chapter 1';
  }
  return map;
}

describe('storageItemBytes', () => {
  it('counts key + JSON value, the way the quota does', () => {
    assert.equal(storageItemBytes({}, 'videoTitles'), 'videoTitles'.length + 2);
    assert.ok(storageItemBytes(titlesMap(10), 'videoTitles') > 600);
  });

  it('treats an unserialisable value as over budget rather than throwing', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    assert.equal(storageItemBytes(cyclic, 'videoTitles'), Infinity);
  });
});

describe('pruneMapToBudget', () => {
  it('leaves a map that already fits completely untouched', () => {
    const map = titlesMap(5);
    const { map: out, dropped } = pruneMapToBudget(map, { mapKey: 'videoTitles' });
    assert.deepEqual(out, map);
    assert.deepEqual(dropped, []);
  });

  it('brings an oversized map back under the per-item budget', () => {
    // ~113 videos is where the real ceiling was hit; 400 is comfortably past it.
    const map = titlesMap(400);
    assert.ok(storageItemBytes(map, 'videoTitles') > 8192, 'fixture must exceed QUOTA_BYTES_PER_ITEM');

    const { map: out, dropped } = pruneMapToBudget(map, { mapKey: 'videoTitles' });

    assert.ok(storageItemBytes(out, 'videoTitles') <= MAP_BYTE_BUDGET);
    assert.ok(storageItemBytes(out, 'videoTitles') < 8192, 'must end below the real quota');
    assert.ok(dropped.length > 0);
    assert.equal(Object.keys(out).length + dropped.length, 400, 'every key is either kept or reported dropped');
  });

  it('evicts oldest-inserted first, keeping the most recent videos', () => {
    const map = titlesMap(400);
    const { map: out } = pruneMapToBudget(map, { mapKey: 'videoTitles' });
    const keys = Object.keys(map);
    // The last-inserted key survives; the first-inserted does not.
    assert.ok(keys[keys.length - 1] in out, 'newest entry retained');
    assert.ok(!(keys[0] in out), 'oldest entry evicted');
  });

  it('never drops a key it was told to keep', () => {
    const map = titlesMap(400);
    const oldest = Object.keys(map)[0]; // would normally be first to go
    const { map: out, dropped } = pruneMapToBudget(map, {
      keepKeys: [oldest],
      mapKey: 'videoTitles',
    });
    assert.ok(oldest in out, 'protected key survives');
    assert.ok(!dropped.includes(oldest));
    assert.ok(storageItemBytes(out, 'videoTitles') <= MAP_BYTE_BUDGET);
  });

  it('tolerates a missing or malformed map', () => {
    assert.deepEqual(pruneMapToBudget(undefined).map, {});
    assert.deepEqual(pruneMapToBudget(null).map, {});
    assert.deepEqual(pruneMapToBudget('nonsense').map, {});
  });
});

describe('pruneVideoMaps', () => {
  it('bounds both maps and always preserves the video being saved', () => {
    const videoTitles = titlesMap(400, 'title');
    const videoDurations = {};
    for (const k of Object.keys(videoTitles)) videoDurations[k] = 1234.5678;
    const keepVideoId = Object.keys(videoTitles)[0]; // the oldest — worst case

    const out = pruneVideoMaps({ videoTitles, videoDurations, keepVideoId });

    assert.ok(storageItemBytes(out.videoTitles, 'videoTitles') <= MAP_BYTE_BUDGET);
    assert.ok(storageItemBytes(out.videoDurations, 'videoDurations') <= MAP_BYTE_BUDGET);
    assert.ok(keepVideoId in out.videoTitles, 'the video being saved keeps its title');
    assert.ok(keepVideoId in out.videoDurations);
  });

  it('is a no-op for a realistic small library', () => {
    const videoTitles = titlesMap(20);
    const out = pruneVideoMaps({ videoTitles, videoDurations: {}, keepVideoId: null });
    assert.deepEqual(out.videoTitles, videoTitles);
    assert.deepEqual(out.dropped, []);
  });

  it('handles being called with nothing at all', () => {
    const out = pruneVideoMaps();
    assert.deepEqual(out.videoTitles, {});
    assert.deepEqual(out.videoDurations, {});
  });

  /**
   * The regression, stated as a property: after pruning, the maps a save writes
   * are always small enough that the write cannot be refused for size — so an
   * over-large title cache can no longer be the reason a bookmark fails to save.
   */
  it('guarantees a post-prune write fits the per-item quota, at any library size', () => {
    for (const size of [1, 113, 400, 2000]) {
      const out = pruneVideoMaps({
        videoTitles: titlesMap(size),
        videoDurations: {},
        keepVideoId: null,
      });
      assert.ok(
        storageItemBytes(out.videoTitles, 'videoTitles') < 8192,
        `videoTitles still over QUOTA_BYTES_PER_ITEM at ${size} videos`,
      );
    }
  });
});

describe('twin-file parity: storage-maps.js mirrors storage-maps.module.js', () => {
  // The classic twin is what the content script actually loads. Nothing else
  // enforces that the two stay in step (see .claude/CLAUDE.md), and a drift
  // here would mean the content script prunes differently from the worker.
  it('produces identical results from the classic globals copy', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.promises.readFile(new URL('../../extension/src/storage-maps.js', import.meta.url), 'utf8'));
    const sandbox = {};
    // eslint-disable-next-line no-new-func
    new Function('globalThis', src)(sandbox);

    assert.equal(typeof sandbox.pruneVideoMaps, 'function', 'classic twin must register pruneVideoMaps');
    assert.equal(sandbox.MAP_BYTE_BUDGET, MAP_BYTE_BUDGET, 'budgets must match');

    const videoTitles = titlesMap(400);
    const keepVideoId = Object.keys(videoTitles)[0];
    const fromClassic = sandbox.pruneVideoMaps({ videoTitles, videoDurations: {}, keepVideoId });
    const fromModule = pruneVideoMaps({ videoTitles, videoDurations: {}, keepVideoId });

    assert.deepEqual(fromClassic.videoTitles, fromModule.videoTitles);
    assert.deepEqual(fromClassic.dropped, fromModule.dropped);
  });
});

describe('the save path never writes bookmarks and the caches in one set()', () => {
  /**
   * The actual fix, asserted against the source of both save paths.
   *
   * A behavioural test would be better, but cannot work here: Chrome does NOT
   * enforce chrome.storage.sync QUOTA_BYTES for an unsigned-in test profile
   * (verified while fixing the tour — filling past 102,000 bytes still accepted
   * writes), so a seeded oversized videoTitles simply would not fail in the E2E
   * harness and the test would pass for the wrong reason.
   *
   * What actually protects the user is structural: the bookmark write must not
   * carry the display caches with it. That is what this pins. Re-merge the two
   * writes and these fail.
   */
  const SAVE_PATHS = [
    ['content script', '../../extension/src/content/content.js'],
    ['background worker', '../../extension/src/background/background.js'],
  ];

  /** Every `chrome.storage.sync.set({...})` object literal in a file. */
  function syncSetPayloads(source) {
    return [...source.matchAll(/chrome\.storage\.sync\.set\(\s*(\{[^}]*\})/g)].map((m) => m[1]);
  }

  for (const [label, relPath] of SAVE_PATHS) {
    it(`${label}: no set() writes a bm_ key alongside videoTitles/videoDurations`, async () => {
      const fs = await import('node:fs');
      const source = await fs.promises.readFile(new URL(relPath, import.meta.url), 'utf8');
      const payloads = syncSetPayloads(source);
      assert.ok(payloads.length > 0, 'expected to find sync.set calls to inspect');

      for (const payload of payloads) {
        const writesBookmarks = payload.includes('bmKey(');
        const writesCaches = /videoTitles|videoDurations/.test(payload);
        assert.ok(
          !(writesBookmarks && writesCaches),
          `${label} still writes bookmarks and the caches together — an oversized ` +
          `cache would fail the bookmark save:\n  ${payload}`,
        );
      }
    });

    it(`${label}: prunes the caches before writing them`, async () => {
      const fs = await import('node:fs');
      const source = await fs.promises.readFile(new URL(relPath, import.meta.url), 'utf8');
      assert.ok(
        source.includes('pruneVideoMaps('),
        `${label} must bound videoTitles/videoDurations before writing them`,
      );
    });
  }
});
