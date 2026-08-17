/**
 * The cookie-consent record (app/lib/consent.ts).
 *
 * This module decides whether a non-essential cookie may be set, and every
 * failure mode is silent: an over-permissive bug sets a marketing cookie on
 * someone who declined (a PECR problem you only find out about via a complaint),
 * an over-strict one quietly stops crediting affiliates. Neither shows up in the
 * UI, so the rules are asserted here rather than trusted.
 *
 * The cases that matter most are the DEFAULTS — everything unknown, malformed,
 * stale or absent has to read as "no".
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CONSENT_VERSION,
  PRESENTED_CATEGORIES,
  consentAllows,
  makeConsentRecord,
  needsPrompt,
  parseConsent,
  rawConsentAllows,
  serializeConsent,
  type ConsentRecord,
} from '../../app/lib/consent';

const NOW = 1_760_000_000_000;

describe('makeConsentRecord', () => {
  it('grants every presented category on accept', () => {
    const rec = makeConsentRecord(true, NOW);
    assert.equal(rec.v, CONSENT_VERSION);
    assert.equal(rec.ts, NOW);
    for (const c of PRESENTED_CATEGORIES) assert.equal(rec.cats[c], true);
  });

  it('denies every presented category on reject', () => {
    const rec = makeConsentRecord(false, NOW);
    for (const c of PRESENTED_CATEGORIES) assert.equal(rec.cats[c], false);
  });

  // The whole point of the category record: a category we have not yet told
  // users about is not covered by an answer they gave about something else.
  it('does not grant a category that was never presented', () => {
    const rec = makeConsentRecord(true, NOW);
    assert.equal(consentAllows(rec, 'product_analytics'), false);
  });
});

describe('serializeConsent / parseConsent round-trip', () => {
  it('survives a round-trip', () => {
    const rec = makeConsentRecord(true, NOW);
    assert.deepEqual(parseConsent(serializeConsent(rec)), rec);
  });

  // The value is written by document.cookie (encoded) and read back through
  // several APIs that disagree about whether they decode for you. Both forms
  // have to parse or consent silently evaporates on one of the read paths.
  it('parses the already-decoded form too', () => {
    const rec = makeConsentRecord(true, NOW);
    assert.deepEqual(parseConsent(JSON.stringify(rec)), rec);
  });
});

describe('parseConsent: anything that is not an answer is not an answer', () => {
  const rejected: [string, string | undefined | null][] = [
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['not JSON', 'yes-please'],
    ['a stray percent (breaks decodeURIComponent)', '%'],
    ['JSON that is not an object', '"true"'],
    ['an array', '[]'],
    ['missing version', JSON.stringify({ ts: NOW, cats: { attribution: true } })],
    ['missing timestamp', JSON.stringify({ v: CONSENT_VERSION, cats: { attribution: true } })],
    ['missing cats', JSON.stringify({ v: CONSENT_VERSION, ts: NOW })],
  ];

  for (const [label, raw] of rejected) {
    it(`returns null for ${label}`, () => assert.equal(parseConsent(raw), null));
  }

  it('drops non-boolean category values rather than trusting them', () => {
    const raw = JSON.stringify({
      v: CONSENT_VERSION,
      ts: NOW,
      cats: { attribution: 'yes', product_analytics: 1 },
    });
    const rec = parseConsent(raw);
    assert.deepEqual(rec?.cats, {});
    assert.equal(consentAllows(rec, 'attribution'), false);
  });
});

describe('consentAllows: closed by default', () => {
  it('is false with no record at all', () => {
    assert.equal(consentAllows(null, 'attribution'), false);
    assert.equal(consentAllows(undefined, 'attribution'), false);
  });

  it('is false for a record from an older consent version', () => {
    const stale: ConsentRecord = { v: CONSENT_VERSION - 1, ts: NOW, cats: { attribution: true } };
    assert.equal(consentAllows(stale, 'attribution'), false);
  });

  it('is false for a record from a NEWER version (a rolled-back deploy)', () => {
    const future: ConsentRecord = { v: CONSENT_VERSION + 1, ts: NOW, cats: { attribution: true } };
    assert.equal(consentAllows(future, 'attribution'), false);
  });

  it('is true only for an explicit grant at the current version', () => {
    assert.equal(consentAllows(makeConsentRecord(true, NOW), 'attribution'), true);
    assert.equal(consentAllows(makeConsentRecord(false, NOW), 'attribution'), false);
  });
});

describe('rawConsentAllows: the form route handlers call', () => {
  it('matches consentAllows through the cookie encoding', () => {
    assert.equal(rawConsentAllows(serializeConsent(makeConsentRecord(true, NOW)), 'attribution'), true);
    assert.equal(rawConsentAllows(serializeConsent(makeConsentRecord(false, NOW)), 'attribution'), false);
  });

  // The case the /r/[code] route hits on a first-ever visit.
  it('is false when no consent cookie was sent', () => {
    assert.equal(rawConsentAllows(undefined, 'attribution'), false);
  });
});

describe('needsPrompt', () => {
  it('prompts when there is no record', () => assert.equal(needsPrompt(null), true));

  it('does not re-prompt a current answer, accepted or rejected', () => {
    assert.equal(needsPrompt(makeConsentRecord(true, NOW)), false);
    assert.equal(needsPrompt(makeConsentRecord(false, NOW)), false);
  });

  it('re-prompts when the version has moved on', () => {
    assert.equal(needsPrompt({ v: CONSENT_VERSION - 1, ts: NOW, cats: { attribution: true } }), true);
  });

  // Backstop for adding a category and forgetting to bump CONSENT_VERSION: a
  // record that does not cover everything currently presented is not an answer
  // to the question we are now asking.
  it('re-prompts when a presented category is missing from the record', () => {
    assert.equal(needsPrompt({ v: CONSENT_VERSION, ts: NOW, cats: {} }), true);
  });
});
