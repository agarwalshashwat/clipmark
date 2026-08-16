/**
 * Unit tests for the guided-tour state rules (v1.0.2).
 *
 * Regression cover for the v1.0.1 first-run bug: the tour's one-shot "seen" flag
 * was set from driver.js's onDestroyed unconditionally, so a teardown the user
 * never asked for — a YouTube SPA navigation mid-tour — burned it permanently
 * and the tour could never play again.
 *
 * See docs/guided-tour-spec.md and extension/src/tour-state.js.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  didYoutubeTourComplete,
  isYoutubeWatchUrl,
  shouldAutoRunSidePanelTour,
  shouldMarkTourSeen,
  shouldStartYoutubeTour,
  hasSeenYoutubeTour,
} from '../../extension/src/tour-state.js';

describe('shouldStartYoutubeTour', () => {
  it('starts for a genuine first-time user', () => {
    assert.equal(shouldStartYoutubeTour({}), true);
    assert.equal(shouldStartYoutubeTour(undefined), true);
    // A user who has seen only the side-panel coach-mark still gets Sub-tour A.
    assert.equal(shouldStartYoutubeTour({ sidePanelTour: true }), true);
  });

  it('does not start once the tour has genuinely been seen', () => {
    assert.equal(shouldStartYoutubeTour({ youtubeTour: true }), false);
  });
});

describe('shouldMarkTourSeen', () => {
  it('marks seen when the user finished or dismissed a rendered tour', () => {
    assert.equal(shouldMarkTourSeen({ stepShown: true }), true);
    assert.equal(shouldMarkTourSeen({ stepShown: true, abandonedForNavigation: false }), true);
  });

  it('does not mark seen when no step ever rendered', () => {
    // The whole point: a tour the user never saw must not consume its one shot.
    assert.equal(shouldMarkTourSeen({ stepShown: false }), false);
    assert.equal(shouldMarkTourSeen({}), false);
    assert.equal(shouldMarkTourSeen(), false);
  });

  it('does not mark seen when a YouTube SPA navigation tore the tour down', () => {
    // v1.0.1 regression: navigating to the next video mid-tour marked it seen
    // for good, even though the user neither completed nor dismissed it.
    assert.equal(shouldMarkTourSeen({ stepShown: true, abandonedForNavigation: true }), false);
  });
});

describe('isYoutubeWatchUrl', () => {
  it('recognises watch pages on youtube.com and its subdomains', () => {
    assert.equal(isYoutubeWatchUrl('https://www.youtube.com/watch?v=abc'), true);
    assert.equal(isYoutubeWatchUrl('https://m.youtube.com/watch?v=abc&t=30s'), true);
    assert.equal(isYoutubeWatchUrl('https://youtube.com/watch?v=abc'), true);
  });

  it('rejects everything else', () => {
    assert.equal(isYoutubeWatchUrl('https://www.youtube.com/'), false);
    assert.equal(isYoutubeWatchUrl('https://www.youtube.com/watch'), false, 'no video id');
    assert.equal(isYoutubeWatchUrl('https://youtube.com.evil.test/watch?v=abc'), false);
    assert.equal(isYoutubeWatchUrl('https://clipmark.mithahara.com/watch?v=abc'), false);
    assert.equal(isYoutubeWatchUrl('not a url'), false);
    assert.equal(isYoutubeWatchUrl(null), false);
  });
});

describe('shouldAutoRunSidePanelTour (Sub-tour A → B handoff)', () => {
  it('runs on a first-ever panel open away from a watch page', () => {
    assert.equal(
      shouldAutoRunSidePanelTour({ tourState: {}, activeTabUrl: 'https://www.youtube.com/' }),
      true,
    );
    assert.equal(shouldAutoRunSidePanelTour({ tourState: {}, activeTabUrl: null }), true);
  });

  it('defers while Sub-tour A is still pending on the watch page in front of the user', () => {
    // Otherwise two coach-marks are live at once and A's "open the ClipMark
    // icon in your toolbar" handoff is spoiled by B having already fired.
    assert.equal(
      shouldAutoRunSidePanelTour({
        tourState: {},
        activeTabUrl: 'https://www.youtube.com/watch?v=abc',
      }),
      false,
    );
  });

  it('runs on a watch page once Sub-tour A is done', () => {
    assert.equal(
      shouldAutoRunSidePanelTour({
        tourState: { youtubeTour: true },
        activeTabUrl: 'https://www.youtube.com/watch?v=abc',
      }),
      true,
    );
  });

  it('never re-runs once the coach-mark has been seen', () => {
    assert.equal(
      shouldAutoRunSidePanelTour({
        tourState: { sidePanelTour: true, youtubeTour: true },
        activeTabUrl: 'https://www.youtube.com/watch?v=abc',
      }),
      false,
    );
  });
});

describe('didYoutubeTourComplete', () => {
  it('fires on the false → true transition', () => {
    assert.equal(didYoutubeTourComplete({ oldValue: {}, newValue: { youtubeTour: true } }), true);
    assert.equal(didYoutubeTourComplete({ newValue: { youtubeTour: true } }), true);
  });

  it('ignores unrelated tourState writes', () => {
    assert.equal(
      didYoutubeTourComplete({
        oldValue: { youtubeTour: true },
        newValue: { youtubeTour: true, sidePanelTour: true },
      }),
      false,
    );
    assert.equal(didYoutubeTourComplete({ oldValue: {}, newValue: {} }), false);
    // The replay button clears the flag — that must not trigger the handoff.
    assert.equal(
      didYoutubeTourComplete({ oldValue: { youtubeTour: true }, newValue: { youtubeTour: false } }),
      false,
    );
    assert.equal(didYoutubeTourComplete(undefined), false);
  });
});

describe('hasSeenYoutubeTour — the flag survives a storage area that refuses writes', () => {
  // The reported v1.0.6 symptom was the tour returning on EVERY video. The path
  // that produces exactly that: chrome.storage.sync.set fails (QUOTA_BYTES
  // exhausted by saved bm_{videoId} bookmarks, the per-minute write cap, or sync
  // disabled on the profile), so the one-shot flag is never stored and every new
  // watch page starts the tour again — with no action the user can take to stop
  // it. tour.js now mirrors to chrome.storage.local when sync refuses, and reads
  // both areas through this predicate.

  it('is seen when sync holds the flag (the normal path)', () => {
    assert.equal(hasSeenYoutubeTour({ syncState: { youtubeTour: true }, localState: {} }), true);
  });

  it('is seen from the local mirror alone when sync could not be written', () => {
    // Without this the tour is undismissable: sync refuses every write, so the
    // flag never lands and the tour re-shows on every single video.
    assert.equal(hasSeenYoutubeTour({ syncState: {}, localState: { youtubeTour: true } }), true);
  });

  it('is seen when a sync value arrives later from another machine', () => {
    assert.equal(
      hasSeenYoutubeTour({ syncState: { youtubeTour: true }, localState: { youtubeTour: true } }),
      true,
    );
  });

  it('is NOT seen for a genuine first-time user, however the areas are shaped', () => {
    assert.equal(hasSeenYoutubeTour({ syncState: {}, localState: {} }), false);
    assert.equal(hasSeenYoutubeTour({}), false);
    assert.equal(hasSeenYoutubeTour(), false);
    // A neighbouring flag must not be mistaken for this one.
    assert.equal(hasSeenYoutubeTour({ syncState: { sidePanelTour: true }, localState: {} }), false);
    // The replay button clears it — that has to re-offer the tour.
    assert.equal(
      hasSeenYoutubeTour({ syncState: { youtubeTour: false }, localState: { youtubeTour: false } }),
      false,
    );
  });

  it('drives shouldStartYoutubeTour, so the tour runs at most once', () => {
    // The contract end to end: whatever area stored it, the next video must not
    // start the tour again.
    const seen = hasSeenYoutubeTour({ syncState: {}, localState: { youtubeTour: true } });
    assert.equal(shouldStartYoutubeTour({ youtubeTour: seen }), false);

    const unseen = hasSeenYoutubeTour({ syncState: {}, localState: {} });
    assert.equal(shouldStartYoutubeTour({ youtubeTour: unseen }), true);
  });

  it('a fast dismiss still counts as seen, then never starts again', () => {
    // #97's failure: a dismiss faster than driver.js's ~400ms highlight
    // transition. onPopoverRender sets stepShown, so the outcome is markable...
    assert.equal(shouldMarkTourSeen({ stepShown: true, abandonedForNavigation: false }), true);
    // ...and once stored in either area, the tour is over for good.
    assert.equal(
      shouldStartYoutubeTour({ youtubeTour: hasSeenYoutubeTour({ localState: { youtubeTour: true } }) }),
      false,
    );
  });
});
