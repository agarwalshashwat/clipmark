/**
 * Anki export cap parity — webapp twin vs. extension original.
 *
 * `webapp/app/dashboard/_utils/usage-caps.ts` deliberately duplicates the
 * Anki-export slice of `extension/src/usage-caps.module.js` (the extension
 * module sits outside the Next.js project root, so importing it into the app
 * build would need the experimental externalDir flag). This test imports BOTH
 * implementations and asserts identical behavior, so the twins cannot
 * silently drift.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  FREE_ANKI_EXPORTS_PER_MONTH as webappCap,
  usagePeriodKey as webappPeriodKey,
  normalizeMonthlyCounter as webappNormalize,
  isMonthlyAnkiExportCapReached as webappCapReached,
} from '../../app/dashboard/_utils/usage-caps';
// The shipped extension module (plain ESM .js) — the source of truth.
import {
  FREE_ANKI_EXPORTS_PER_MONTH as extensionCap,
  usagePeriodKey as extensionPeriodKey,
  normalizeMonthlyCounter as extensionNormalize,
  isMonthlyAnkiExportCapReached as extensionCapReached,
} from '../../../extension/src/usage-caps.module.js';

const NOW = new Date('2026-07-31T12:00:00.000Z').getTime();
const LAST_MONTH = new Date('2026-06-15T12:00:00.000Z').getTime();

const COUNTERS: (Record<string, unknown> | null | undefined)[] = [
  null,
  undefined,
  { periodStart: '2026-07', count: 0 },
  { periodStart: '2026-07', count: 1 },
  { periodStart: '2026-06', count: 5 }, // stale period — should reset
];

describe('Anki export cap: webapp twin matches the extension implementation', () => {
  it('the free-export cap constant is identical', () => {
    assert.equal(webappCap, extensionCap);
    assert.equal(webappCap, 10);
  });

  it('usagePeriodKey agrees for the same instant', () => {
    for (const t of [NOW, LAST_MONTH]) {
      assert.equal(webappPeriodKey(t), extensionPeriodKey(t));
    }
  });

  for (const stored of COUNTERS) {
    it(`normalizeMonthlyCounter agrees for ${JSON.stringify(stored)}`, () => {
      assert.deepEqual(webappNormalize(stored as any, NOW), extensionNormalize(stored as any, NOW));
    });

    it(`isMonthlyAnkiExportCapReached agrees for ${JSON.stringify(stored)}`, () => {
      assert.equal(webappCapReached(stored as any, NOW), extensionCapReached(stored as any, NOW));
    });
  }

  it('a stale period resets the count, so the cap is not reached', () => {
    const stale = { periodStart: '2026-06', count: 99 };
    assert.equal(webappCapReached(stale, NOW), false);
    assert.equal(extensionCapReached(stale, NOW), false);
  });

  it('both twins agree on the cap boundary (10/month)', () => {
    const under = { periodStart: webappPeriodKey(NOW), count: extensionCap - 1 };
    assert.equal(webappCapReached(under, NOW), false);
    assert.equal(extensionCapReached(under, NOW), false);

    const used = { periodStart: webappPeriodKey(NOW), count: extensionCap };
    assert.equal(webappCapReached(used, NOW), true);
    assert.equal(extensionCapReached(used, NOW), true);
  });
});
