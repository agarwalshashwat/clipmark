/**
 * Unit tests for the Chrome Web Store review nudge (ships with v1.0.8).
 *
 * Two layers:
 *   1. The pure trigger rules in extension/src/review-nudge.js — milestone
 *      gate, lifetime frequency cap, and the permanent stops after a dismiss
 *      or a click-through.
 *   2. The banner's write-before-render ordering in
 *      extension/src/popup/review-nudge-banner.js, which is what actually
 *      bounds the feature when a chrome.storage write fails. The DOM and
 *      chrome.* stubs below are hand-rolled on purpose — the repo has no
 *      DOM-test dependency and this feature is not worth adding one.
 *
 * Run: npm run test:unit  (or: node --test tests/unit/review-nudge.test.mjs)
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  CHROME_STORE_ITEM_ID,
  MAX_NUDGE_SHOWS,
  MIN_BOOKMARKS_FOR_NUDGE,
  MIN_DAYS_SINCE_FIRST_BOOKMARK,
  NUDGE_RESHOW_AFTER_MS,
  REVIEW_NUDGE_STORAGE_KEY,
  chromeStoreReviewUrl,
  hasCompletedRecallReview,
  hasReachedEngagementMilestone,
  markNudgeClickedThrough,
  markNudgeDismissed,
  markNudgeShown,
  normalizeNudgeState,
  shouldShowReviewNudge,
} from '../../extension/src/review-nudge.js';

const DAY_MS = 86400000;
const NOW = Date.UTC(2026, 7, 17); // fixed clock — these rules are all relative

/**
 * `count` bookmarks created `ageDays` ago; the first `reviewedCount` of them
 * carry a lastReviewed stamp (what a 'got_it' grade writes).
 */
function makeBookmarks({ count, ageDays = 30, reviewedCount = 1, nowMs = NOW } = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: nowMs - i,
    timestamp: 10 + i,
    createdAt: new Date(nowMs - ageDays * DAY_MS).toISOString(),
    reviewSchedule: [1, 3, 7],
    lastReviewed: i < reviewedCount ? new Date(nowMs - DAY_MS).toISOString() : null,
  }));
}

/** The happy path: an engaged user who has never been asked. */
function engagedInput(overrides = {}) {
  return {
    bookmarks: makeBookmarks({ count: MIN_BOOKMARKS_FOR_NUDGE }),
    reviewUsage: null,
    state: null,
    nowMs: NOW,
    sessionShown: false,
    ...overrides,
  };
}

describe('chromeStoreReviewUrl', () => {
  it('points at the listing’s review tab, not the description', () => {
    assert.equal(
      chromeStoreReviewUrl(),
      `https://chromewebstore.google.com/detail/${CHROME_STORE_ITEM_ID}/reviews`,
    );
  });

  it('falls back to the published item id for a blank override', () => {
    assert.equal(chromeStoreReviewUrl(''), chromeStoreReviewUrl());
    assert.equal(chromeStoreReviewUrl(null), chromeStoreReviewUrl());
    assert.equal(chromeStoreReviewUrl('   '), chromeStoreReviewUrl());
  });

  it('keeps the item id in sync with the webapp’s CHROME_STORE_URL', () => {
    // Same drift guard as the recall/anki parity tests: two files, one id.
    const constantsPath = fileURLToPath(
      new URL('../../webapp/app/lib/constants.ts', import.meta.url),
    );
    const source = readFileSync(constantsPath, 'utf8');
    assert.ok(
      source.includes(CHROME_STORE_ITEM_ID),
      'CHROME_STORE_ITEM_ID must match the id in webapp/app/lib/constants.ts',
    );
  });
});

describe('normalizeNudgeState', () => {
  it('treats missing or corrupt records as never-shown, not as retired', () => {
    for (const bad of [null, undefined, {}, 'nope', 42, { shownCount: 'x' }]) {
      assert.deepEqual(normalizeNudgeState(bad), {
        shownCount: 0,
        lastShownAt: 0,
        dismissed: false,
        clickedThrough: false,
      });
    }
  });

  it('rejects nonsense counters rather than trusting them', () => {
    assert.equal(normalizeNudgeState({ shownCount: -3 }).shownCount, 0);
    assert.equal(normalizeNudgeState({ shownCount: 2.7 }).shownCount, 2);
    assert.equal(normalizeNudgeState({ lastShownAt: -1 }).lastShownAt, 0);
    assert.equal(normalizeNudgeState({ lastShownAt: NaN }).lastShownAt, 0);
  });

  it('only accepts a literal true for the retiring flags', () => {
    assert.equal(normalizeNudgeState({ dismissed: 'yes' }).dismissed, false);
    assert.equal(normalizeNudgeState({ dismissed: 1 }).dismissed, false);
    assert.equal(normalizeNudgeState({ dismissed: true }).dismissed, true);
  });
});

describe('hasCompletedRecallReview', () => {
  it('accepts a durable lastReviewed stamp on any bookmark', () => {
    const bookmarks = makeBookmarks({ count: 3, reviewedCount: 1 });
    assert.equal(hasCompletedRecallReview({ bookmarks }), true);
  });

  it('accepts this month’s review counter (covers an "again" grade)', () => {
    // gradeRecall('again') never writes lastReviewed, but the review happened.
    const bookmarks = makeBookmarks({ count: 3, reviewedCount: 0 });
    assert.equal(hasCompletedRecallReview({ bookmarks }), false);
    assert.equal(
      hasCompletedRecallReview({ bookmarks, reviewUsage: { periodStart: '2026-08', count: 2 } }),
      true,
    );
  });

  it('is false for a user who has never reviewed anything', () => {
    assert.equal(hasCompletedRecallReview({ bookmarks: makeBookmarks({ count: 20, reviewedCount: 0 }) }), false);
    assert.equal(hasCompletedRecallReview({ bookmarks: [], reviewUsage: { count: 0 } }), false);
    assert.equal(hasCompletedRecallReview({}), false);
    assert.equal(hasCompletedRecallReview(), false);
  });

  it('ignores an unparseable lastReviewed', () => {
    const bookmarks = [{ createdAt: new Date(NOW).toISOString(), lastReviewed: 'soon' }];
    assert.equal(hasCompletedRecallReview({ bookmarks }), false);
  });
});

describe('hasReachedEngagementMilestone', () => {
  it('passes for a user with enough bookmarks, a review, and some history', () => {
    assert.equal(
      hasReachedEngagementMilestone({
        bookmarks: makeBookmarks({ count: MIN_BOOKMARKS_FOR_NUDGE }),
        nowMs: NOW,
      }),
      true,
    );
  });

  it('never fires on a first run — no bookmarks at all', () => {
    assert.equal(hasReachedEngagementMilestone({ bookmarks: [], nowMs: NOW }), false);
    assert.equal(hasReachedEngagementMilestone({ nowMs: NOW }), false);
    assert.equal(hasReachedEngagementMilestone(), false);
  });

  it('holds off one bookmark short of the milestone', () => {
    assert.equal(
      hasReachedEngagementMilestone({
        bookmarks: makeBookmarks({ count: MIN_BOOKMARKS_FOR_NUDGE - 1 }),
        nowMs: NOW,
      }),
      false,
    );
  });

  it('requires a completed recall review, not just saved bookmarks', () => {
    assert.equal(
      hasReachedEngagementMilestone({
        bookmarks: makeBookmarks({ count: 50, reviewedCount: 0 }),
        nowMs: NOW,
      }),
      false,
    );
  });

  it('holds off a brand-new user who bulk-saved everything today', () => {
    // Enough bookmarks and a review stamp, but no history — the shape a fresh
    // install with a restored sync would present.
    assert.equal(
      hasReachedEngagementMilestone({
        bookmarks: makeBookmarks({ count: 40, ageDays: 0 }),
        nowMs: NOW,
      }),
      false,
    );
    assert.equal(
      hasReachedEngagementMilestone({
        bookmarks: makeBookmarks({ count: 40, ageDays: MIN_DAYS_SINCE_FIRST_BOOKMARK - 1 }),
        nowMs: NOW,
      }),
      false,
    );
    assert.equal(
      hasReachedEngagementMilestone({
        bookmarks: makeBookmarks({ count: 40, ageDays: MIN_DAYS_SINCE_FIRST_BOOKMARK }),
        nowMs: NOW,
      }),
      true,
    );
  });

  it('ignores non-object junk in the bookmark list', () => {
    const bookmarks = [...makeBookmarks({ count: MIN_BOOKMARKS_FOR_NUDGE - 1 }), null, undefined, 'x'];
    assert.equal(hasReachedEngagementMilestone({ bookmarks, nowMs: NOW }), false);
  });

  it('treats undateable bookmarks as no history', () => {
    const bookmarks = Array.from({ length: 30 }, () => ({ lastReviewed: new Date(NOW).toISOString() }));
    assert.equal(hasReachedEngagementMilestone({ bookmarks, nowMs: NOW }), false);
  });
});

describe('shouldShowReviewNudge — frequency cap', () => {
  it('shows to an engaged user who has never been asked', () => {
    assert.equal(shouldShowReviewNudge(engagedInput()), true);
  });

  it('does not ask twice in the same fortnight', () => {
    const state = { shownCount: 1, lastShownAt: NOW - (NUDGE_RESHOW_AFTER_MS - 1000) };
    assert.equal(shouldShowReviewNudge(engagedInput({ state })), false);
  });

  it('allows exactly one more ask after the gap has passed', () => {
    const state = { shownCount: 1, lastShownAt: NOW - NUDGE_RESHOW_AFTER_MS };
    assert.equal(shouldShowReviewNudge(engagedInput({ state })), true);
  });

  it('stops forever at the lifetime cap, however long they wait', () => {
    const state = { shownCount: MAX_NUDGE_SHOWS, lastShownAt: NOW - 5 * 365 * DAY_MS };
    assert.equal(shouldShowReviewNudge(engagedInput({ state })), false);
    assert.equal(
      shouldShowReviewNudge(engagedInput({ state: { shownCount: 99, lastShownAt: 1 } })),
      false,
    );
  });

  it('treats a shown-but-undated record as "just shown", never as due', () => {
    // The safe direction: a missing timestamp must not read as "long ago".
    assert.equal(shouldShowReviewNudge(engagedInput({ state: { shownCount: 1 } })), false);
    assert.equal(
      shouldShowReviewNudge(engagedInput({ state: { shownCount: 1, lastShownAt: 0 } })),
      false,
    );
  });
});

describe('shouldShowReviewNudge — permanent stops', () => {
  it('never asks again after a dismiss', () => {
    assert.equal(shouldShowReviewNudge(engagedInput({ state: { dismissed: true } })), false);
    // ...not even years later, and not even if the counter looks fresh.
    assert.equal(
      shouldShowReviewNudge(
        engagedInput({ state: { dismissed: true, shownCount: 1, lastShownAt: NOW - 5 * 365 * DAY_MS } }),
      ),
      false,
    );
  });

  it('never asks again after the user opens the listing', () => {
    assert.equal(shouldShowReviewNudge(engagedInput({ state: { clickedThrough: true } })), false);
    assert.equal(
      shouldShowReviewNudge(
        engagedInput({ state: { clickedThrough: true, lastShownAt: NOW - 5 * 365 * DAY_MS } }),
      ),
      false,
    );
  });

  it('a dismiss survives a round-trip through the state helpers', () => {
    let state = markNudgeShown(null, NOW);
    assert.equal(state.shownCount, 1);
    assert.equal(state.lastShownAt, NOW);
    assert.equal(shouldShowReviewNudge(engagedInput({ state })), false);

    state = markNudgeDismissed(state);
    assert.equal(state.dismissed, true);
    assert.equal(state.shownCount, 1, 'dismiss must not lose the show counter');
    assert.equal(
      shouldShowReviewNudge(engagedInput({ state, nowMs: NOW + 10 * 365 * DAY_MS })),
      false,
    );
  });

  it('a click-through survives a round-trip through the state helpers', () => {
    const state = markNudgeClickedThrough(markNudgeShown(null, NOW));
    assert.equal(state.clickedThrough, true);
    assert.equal(
      shouldShowReviewNudge(engagedInput({ state, nowMs: NOW + 10 * 365 * DAY_MS })),
      false,
    );
  });

  it('the milestone still gates a user who has never been asked', () => {
    assert.equal(shouldShowReviewNudge(engagedInput({ bookmarks: [] })), false);
  });

  it('sessionShown blocks a second paint regardless of stored state', () => {
    assert.equal(shouldShowReviewNudge(engagedInput({ sessionShown: true })), false);
  });
});

/* ── Banner: write-before-render ─────────────────────────────────────────────
 *
 * The rule under test: the "shown" write must land BEFORE the banner is
 * rendered. A failed write therefore means the user was never asked — which is
 * what makes a storage failure bounded instead of a banner on every open.
 */

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.attributes = new Map();
    this.textContent = '';
    this.id = '';
    this.className = '';
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  append(...nodes) {
    for (const node of nodes) { node.parentNode = this; this.children.push(node); }
  }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(c => c !== this);
    this.parentNode = null;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  dispatch(type) {
    for (const fn of this.listeners.get(type) || []) fn({ preventDefault() {} });
  }
  /** Depth-first search by id, so tests can assert on the rendered tree. */
  find(id) {
    for (const child of this.children) {
      if (child.id === id) return child;
      const hit = child.find(id);
      if (hit) return hit;
    }
    return null;
  }
}

/**
 * @param {{sync?: object, local?: object, failLocalSet?: boolean}} options
 */
function installStubs({ sync = {}, local = {}, failLocalSet = false } = {}) {
  const slot = new FakeElement('div');
  slot.id = 'review-nudge-slot';
  const openedTabs = [];
  const setCalls = [];

  globalThis.document = {
    getElementById: id => (id === 'review-nudge-slot' ? slot : null),
    createElement: tag => new FakeElement(tag),
  };

  const respond = (store, defaults, cb) => {
    const out = {};
    // chrome.storage.get(null) means "everything"; an object means "these keys
    // with these defaults" — the two shapes this feature actually uses.
    if (defaults === null) Object.assign(out, store);
    else for (const [k, d] of Object.entries(defaults)) out[k] = k in store ? store[k] : d;
    cb(out);
  };

  globalThis.chrome = {
    runtime: { lastError: undefined },
    tabs: { create: info => openedTabs.push(info.url) },
    storage: {
      local: {
        get: (defaults, cb) => respond(local, defaults, cb),
        set: (items, cb) => {
          setCalls.push(items);
          if (failLocalSet) {
            globalThis.chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' };
            cb();
            globalThis.chrome.runtime.lastError = undefined;
            return;
          }
          Object.assign(local, items);
          cb();
        },
      },
      sync: { get: (defaults, cb) => respond(sync, defaults, cb) },
    },
  };

  return { slot, openedTabs, setCalls, local };
}

/** storage.sync as it really looks: bookmarks under bm_<videoId> keys. */
function syncStoreWithBookmarks(count) {
  return { bm_abc123: makeBookmarks({ count }), bmUser: { isPro: false }, vgroups: {} };
}

describe('mountReviewNudge', () => {
  let mountReviewNudge;
  let resetSession;

  beforeEach(async () => {
    // Imported after the stubs exist on the first run; the module reads chrome
    // and document lazily (inside functions), so one import is enough.
    if (!mountReviewNudge) {
      installStubs();
      const mod = await import('../../extension/src/popup/review-nudge-banner.js');
      mountReviewNudge = mod.mountReviewNudge;
      resetSession = mod.__resetReviewNudgeSession;
    }
    resetSession();
  });

  it('renders the banner for an engaged user, and records the show first', async () => {
    const { slot, setCalls, local } = installStubs({
      sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE),
    });

    assert.equal(await mountReviewNudge(), true);
    assert.equal(slot.children.length, 1);
    assert.equal(setCalls.length, 1, 'exactly one write, and it precedes the render');
    assert.equal(local[REVIEW_NUDGE_STORAGE_KEY].shownCount, 1);
  });

  it('does not render for a user short of the milestone, and writes nothing', async () => {
    const { slot, setCalls } = installStubs({
      sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE - 1),
    });

    assert.equal(await mountReviewNudge(), false);
    assert.equal(slot.children.length, 0);
    assert.equal(setCalls.length, 0);
  });

  it('a failed "shown" write means no banner at all — so nothing to re-show', async () => {
    const { slot, setCalls } = installStubs({
      sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE),
      failLocalSet: true,
    });

    assert.equal(await mountReviewNudge(), false, 'must not render when the write failed');
    assert.equal(slot.children.length, 0);
    assert.equal(setCalls.length, 1, 'one attempt — not a retry loop');
  });

  it('a failing store does not produce a banner on repeated opens', async () => {
    const stubs = installStubs({
      sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE),
      failLocalSet: true,
    });

    // Every "panel open" starts a fresh session, i.e. the worst case for the
    // in-memory guard. The write-first rule is what has to hold here.
    for (let open = 0; open < 5; open++) {
      resetSession();
      assert.equal(await mountReviewNudge(), false);
    }
    assert.equal(stubs.slot.children.length, 0, 'never rendered, so never nagged');
    assert.equal(stubs.setCalls.length, 5, 'one bounded attempt per open, no inner retries');
  });

  it('renders at most once per panel session', async () => {
    const { slot } = installStubs({ sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE) });

    assert.equal(await mountReviewNudge(), true);
    assert.equal(await mountReviewNudge(), false, 'second mount in the same session is a no-op');
    assert.equal(slot.children.length, 1);
  });

  it('does not render once the stored state says dismissed', async () => {
    const { slot } = installStubs({
      sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE),
      local: { [REVIEW_NUDGE_STORAGE_KEY]: { shownCount: 1, lastShownAt: 1, dismissed: true } },
    });

    assert.equal(await mountReviewNudge(), false);
    assert.equal(slot.children.length, 0);
  });

  it('dismissing removes the banner and retires the nudge', async () => {
    const { slot, local } = installStubs({ sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE) });
    await mountReviewNudge();

    slot.find('review-nudge-dismiss').dispatch('click');
    await new Promise(resolve => setImmediate(resolve)); // let the write settle

    assert.equal(slot.children.length, 0);
    assert.equal(local[REVIEW_NUDGE_STORAGE_KEY].dismissed, true);
  });

  it('clicking through opens the review tab and retires the nudge', async () => {
    const { slot, local, openedTabs } = installStubs({
      sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE),
    });
    await mountReviewNudge();

    slot.find('review-nudge-review').dispatch('click');
    await new Promise(resolve => setImmediate(resolve));

    assert.deepEqual(openedTabs, [chromeStoreReviewUrl()]);
    assert.equal(local[REVIEW_NUDGE_STORAGE_KEY].clickedThrough, true);
    assert.equal(slot.children.length, 0);
  });

  it('gives the dismiss the same weight as the CTA, and labels the region', async () => {
    const { slot } = installStubs({ sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE) });
    await mountReviewNudge();

    const banner = slot.children[0];
    assert.equal(banner.getAttribute('role'), 'region');
    assert.equal(banner.getAttribute('aria-labelledby'), 'review-nudge-title');

    const cta = slot.find('review-nudge-review');
    const dismiss = slot.find('review-nudge-dismiss');
    assert.equal(cta.textContent, 'Leave a review');
    assert.equal(dismiss.textContent, 'No thanks');
    // Both are real, focusable controls sharing the .review-nudge-btn metrics —
    // no tiny "×" and no faint text link.
    assert.ok(cta.className.includes('review-nudge-btn'));
    assert.ok(dismiss.className.includes('review-nudge-btn'));
    assert.equal(dismiss.tagName, 'button');
    assert.equal(dismiss.attributes.get('type') ?? dismiss.type, 'button');
  });

  it('survives a storage read failure without throwing', async () => {
    installStubs({ sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE) });
    globalThis.chrome.storage.sync.get = (_defaults, cb) => {
      globalThis.chrome.runtime.lastError = { message: 'context invalidated' };
      cb({});
      globalThis.chrome.runtime.lastError = undefined;
    };

    assert.equal(await mountReviewNudge(), false);
  });

  it('is a no-op on a page without the slot', async () => {
    installStubs({ sync: syncStoreWithBookmarks(MIN_BOOKMARKS_FOR_NUDGE) });
    globalThis.document.getElementById = () => null;

    assert.equal(await mountReviewNudge(), false);
  });
});
