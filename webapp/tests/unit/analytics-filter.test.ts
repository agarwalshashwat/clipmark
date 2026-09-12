/**
 * Website-analytics event filtering (app/lib/analytics-filter.ts).
 *
 * The rule worth guarding: /embed/* impressions are third-party iframe renders,
 * not site visits, and must not reach Vercel Web Analytics. If that filter ever
 * inverts or stops matching, nothing breaks visibly — the visitor numbers just
 * go quietly wrong, which is worse than an outage for a metric you act on.
 *
 * The negative cases matter as much as the positive ones: over-matching would
 * silently discard real marketing traffic, the same failure in the other
 * direction. Note /embedded-not-embed, which shares a prefix with /embed but is
 * a different route — the same trap tests/unit/headers.test.ts guards for.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isEmbedView } from '../../app/lib/analytics-filter';

const SITE = 'https://clipmark.mithahara.com';

describe('isEmbedView: excluded (third-party iframe renders)', () => {
  const excluded = [
    `${SITE}/embed/abc123`,
    `${SITE}/embed/abc123/deep`,
    `${SITE}/embed/abc123?utm_source=x`,
    '/embed/abc123',
    'http://localhost:3000/embed/abc123',
  ];

  for (const url of excluded) {
    it(`drops ${url}`, () => assert.equal(isEmbedView(url), true));
  }
});

describe('isEmbedView: counted (real site visits)', () => {
  const counted = [
    `${SITE}/`,
    `${SITE}/upgrade`,
    `${SITE}/v/abc123`,          // the shared-collection PAGE is a real visit
    `${SITE}/u/someone`,
    `${SITE}/embedded-not-embed`, // shares a prefix, different route
    `${SITE}/dashboard`,
    '/',
    '/v/abc123',
  ];

  for (const url of counted) {
    it(`keeps ${url}`, () => assert.equal(isEmbedView(url), false));
  }
});

describe('isEmbedView: malformed input', () => {
  it('fails open — an unparseable URL is not a reason to drop a real pageview', () => {
    for (const bad of ['', 'not a url', '://///', 'javascript:void(0)']) {
      assert.equal(isEmbedView(bad), false, `${JSON.stringify(bad)} should not be dropped`);
    }
  });
});
