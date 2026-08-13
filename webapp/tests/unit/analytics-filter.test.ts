/**
 * Website-analytics event filtering (app/lib/analytics-filter.ts).
 *
 * The rule worth guarding: /embed/* impressions are third-party iframe renders,
 * not site visits, and must not reach Vercel Web Analytics. If that filter ever
 * inverts or stops matching, nothing breaks visibly — the visitor numbers are
 * just quietly wrong, which is worse than an outage for a metric you act on.
 *
 * The negative cases matter as much as the positive ones: over-matching would
 * silently discard real marketing traffic, which is the same failure in the
 * opposite direction.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isEmbedView } from '../../app/lib/analytics-filter';

describe('isEmbedView', () => {
  it('drops embed pageviews', () => {
    for (const url of [
      'https://clipmark.mithahara.com/embed/abc123',
      'https://clipmark.mithahara.com/embed/abc123?theme=dark',
      'http://localhost:3000/embed/abc123',
      '/embed/abc123',
    ]) {
      assert.equal(isEmbedView(url), true, `expected ${url} to be treated as an embed view`);
    }
  });

  it('keeps every other surface', () => {
    for (const url of [
      'https://clipmark.mithahara.com/',
      'https://clipmark.mithahara.com/upgrade',
      'https://clipmark.mithahara.com/v/abc123',
      'https://clipmark.mithahara.com/u/someone',
      'https://clipmark.mithahara.com/privacy',
      '/',
      '/dashboard',
    ]) {
      assert.equal(isEmbedView(url), false, `expected ${url} to be counted as a visit`);
    }
  });

  it('does not over-match paths that merely start with the word', () => {
    // /embedded-something is a real page we would want counted, not an iframe.
    assert.equal(isEmbedView('https://clipmark.mithahara.com/embedded-guide'), false);
    assert.equal(isEmbedView('https://clipmark.mithahara.com/embed'), false);
  });

  it('counts the pageview rather than dropping it when the URL is unparseable', () => {
    // Failing open: losing a real visit is worse than admitting one bad event.
    assert.equal(isEmbedView('::::not a url::::'), false);
    assert.equal(isEmbedView(''), false);
  });
});
