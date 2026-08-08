/**
 * A–B multi-segment loop engine unit tests — no browser, no Chrome APIs.
 *
 * Imported from the shipped source module (extension/src/loop.module.js) so
 * these tests guard the real code.
 *
 * IMPORTANT: extension/src/loop.js is the classic content-script twin of
 * loop.module.js — keep both in sync (only the module twin is tested here;
 * tests/unit/logic.test.mjs asserts the twins don't drift).
 *
 * The interesting cases are the ones competitors are criticised for:
 *   - looping at 1.5x / 2x (a fixed trigger window overshoots B and never wraps)
 *   - fullscreen transitions (dropped frames = one very long tick)
 *   - YouTube swapping the <video> element out from under the watchdog
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  advanceLoop,
  buildLoopBookmark,
  formatLoopClock,
  insertLoopSegment,
  isDuplicateLoop,
  isLoopBookmark,
  isSameLoopSegment,
  isValidLoopSegment,
  loopEndForBookmark,
  loopSegmentsFromBookmarks,
  loopWrapEpsilon,
  needsOverlayRemount,
  normalizeLoopSegment,
  removeLoopSegment,
  sanitizeLoopName,
  shouldRebindVideo,
  LOOP_CONSTANTS,
} from '../../extension/src/loop.module.js';

const FRAME = LOOP_CONSTANTS.LOOP_DEFAULT_TICK; // 1/60s

/**
 * Minimal player stand-in: advances currentTime by rate × tick each step and
 * applies whatever seek the reducer asks for, exactly like the content script.
 *
 * Returns the trace of every position observed, so a test can assert the
 * playhead never escaped the segment rather than just checking a wrap happened.
 */
function runLoop(state, { rate = 1, tick = FRAME, ticks = 600, startAt = null } = {}) {
  let currentTime = startAt ?? state.segments[state.index].start;
  const observed = [currentTime];
  const seeks = [];
  let current = state;

  for (let i = 0; i < ticks; i++) {
    const result = advanceLoop(current, { currentTime, playbackRate: rate, tickSeconds: tick });
    current = result.state;
    if (result.seek !== null) {
      seeks.push({ at: currentTime, to: result.seek, reason: result.reason, index: current.index });
      currentTime = result.seek;
    } else {
      currentTime += rate * tick;
    }
    observed.push(currentTime);
  }
  return { state: current, observed, seeks, currentTime };
}

const session = (segments, overrides = {}) => ({
  segments,
  index: 0,
  mode: 'chain',
  pendingSeek: null,
  ...overrides,
});

// ─── Segment normalization ───────────────────────────────────────────────────
describe('normalizeLoopSegment', () => {
  it('orders A/B whichever way they were marked', () => {
    assert.deepEqual(normalizeLoopSegment({ a: 30, b: 10 }), { start: 10, end: 30 });
    assert.deepEqual(normalizeLoopSegment({ a: 10, b: 30 }), { start: 10, end: 30 });
  });

  it('clamps to the video duration when one is known', () => {
    assert.deepEqual(normalizeLoopSegment({ a: -5, b: 500 }, 120), { start: 0, end: 120 });
  });

  it('rejects a pair shorter than the minimum loop length', () => {
    assert.equal(normalizeLoopSegment({ a: 10, b: 10.1 }), null);
    assert.equal(isValidLoopSegment({ a: 10, b: 10.1 }), false);
  });

  it('rejects non-finite input', () => {
    assert.equal(normalizeLoopSegment({ a: NaN, b: 10 }), null);
    assert.equal(normalizeLoopSegment(null), null);
  });
});

describe('insertLoopSegment / removeLoopSegment', () => {
  it('keeps segments sorted by start', () => {
    let segs = [];
    segs = insertLoopSegment(segs, { a: 60, b: 70 });
    segs = insertLoopSegment(segs, { a: 10, b: 20 });
    segs = insertLoopSegment(segs, { a: 30, b: 40 });
    assert.deepEqual(segs.map(s => s.start), [10, 30, 60]);
  });

  it('is multi-segment: distinct ranges all persist', () => {
    let segs = [];
    for (const [a, b] of [[0, 5], [10, 15], [20, 25], [30, 35]]) {
      segs = insertLoopSegment(segs, { a, b });
    }
    assert.equal(segs.length, 4, 'every A–B pair is stored, not just the last one');
  });

  it('allows deliberately overlapping practice loops', () => {
    let segs = insertLoopSegment([], { a: 10, b: 40 });
    segs = insertLoopSegment(segs, { a: 20, b: 25 });
    assert.equal(segs.length, 2);
  });

  it('de-duplicates a range that is already armed', () => {
    let segs = insertLoopSegment([], { a: 10, b: 20 });
    segs = insertLoopSegment(segs, { a: 10.01, b: 20.02 });
    assert.equal(segs.length, 1);
  });

  it('never mutates its input', () => {
    const original = insertLoopSegment([], { a: 10, b: 20 });
    const next = insertLoopSegment(original, { a: 30, b: 40 });
    assert.equal(original.length, 1);
    assert.equal(next.length, 2);
    assert.equal(removeLoopSegment(next, 0).length, 1);
    assert.equal(next.length, 2);
  });

  it('ignores an out-of-range remove', () => {
    const segs = insertLoopSegment([], { a: 10, b: 20 });
    assert.equal(removeLoopSegment(segs, 9).length, 1);
    assert.equal(removeLoopSegment(segs, -1).length, 1);
  });
});

// ─── The 2x problem ──────────────────────────────────────────────────────────
describe('loopWrapEpsilon (playback-rate scaling)', () => {
  it('grows with playback rate — a fixed window is what breaks loops at 2x', () => {
    const slowTick = 0.25; // a timeupdate-driven watchdog
    assert.ok(loopWrapEpsilon(2, slowTick) > loopWrapEpsilon(1, slowTick));
    assert.ok(loopWrapEpsilon(1, slowTick) > loopWrapEpsilon(0.5, slowTick));
  });

  it('covers at least one tick of media time at 2x', () => {
    const tick = 0.25;
    assert.ok(loopWrapEpsilon(2, tick) >= 2 * tick, 'window must span the distance travelled per tick');
  });

  it('stays inside sane bounds for absurd input', () => {
    assert.equal(loopWrapEpsilon(16, 10), LOOP_CONSTANTS.LOOP_MAX_EPSILON);
    assert.equal(loopWrapEpsilon(0.01, 0.0001), LOOP_CONSTANTS.LOOP_MIN_EPSILON);
    assert.ok(Number.isFinite(loopWrapEpsilon(NaN, NaN)));
  });
});

describe('advanceLoop at speed', () => {
  for (const rate of [0.5, 1, 1.25, 1.5, 1.75, 2]) {
    it(`stays inside the segment at ${rate}x`, () => {
      const segs = [{ start: 30, end: 34 }];
      const { observed, seeks } = runLoop(session(segs), { rate, ticks: 900 });
      assert.ok(seeks.length > 0, 'the loop wrapped at least once');
      const escaped = observed.filter(t => t > segs[0].end + 0.05 || t < segs[0].start - 0.05);
      assert.equal(escaped.length, 0, `playhead escaped the loop at ${rate}x: ${escaped.slice(0, 3)}`);
    });
  }

  it('wraps a SHORT segment at 2x — the classic "loop breaks at 2x" report', () => {
    const segs = [{ start: 12, end: 13 }]; // 1s of video = 0.5s wall clock at 2x
    const { seeks } = runLoop(session(segs), { rate: 2, ticks: 400 });
    assert.ok(seeks.length >= 5, `expected repeated wraps, got ${seeks.length}`);
    assert.ok(seeks.every(s => s.to === 12));
  });

  it('wraps even when a single tick overshoots B entirely', () => {
    // A 0.5s wall-clock stall at 2x = 1s of media, past the end of a 0.6s segment.
    const state = session([{ start: 10, end: 10.6 }]);
    const { seek, reason } = advanceLoop(state, { currentTime: 11.4, playbackRate: 2, tickSeconds: 0.5 });
    assert.equal(seek, 10);
    assert.equal(reason, 'wrap');
  });

  it('does not spin when the trigger window is wider than the segment', () => {
    // epsilon at 2x/0.5s tick is 0.75s — wider than this 0.3s segment. Clamping
    // it to half the segment is what stops an instant re-wrap every tick.
    const segs = [{ start: 5, end: 5.3 }];
    const { seeks } = runLoop(session(segs), { rate: 2, tick: 0.5, ticks: 20 });
    assert.ok(seeks.length < 20, 'a wrap on literally every tick means the segment never plays');
  });
});

// ─── Seek settling ───────────────────────────────────────────────────────────
describe('advanceLoop seek settling', () => {
  it('does not re-issue a wrap while the seek is still in flight', () => {
    const state = session([{ start: 10, end: 20 }]);
    const first = advanceLoop(state, { currentTime: 20, playbackRate: 1, tickSeconds: FRAME });
    assert.equal(first.seek, 10);
    assert.equal(first.state.pendingSeek, 10);

    // Chrome keeps reporting the pre-seek position for a tick or two.
    const stillStale = advanceLoop(first.state, { currentTime: 19.99, playbackRate: 1, tickSeconds: FRAME });
    assert.equal(stillStale.seek, null, 'a second wrap here is what makes the video judder');
    assert.equal(stillStale.state.pendingSeek, 10);
  });

  it('clears the gate once the playhead arrives', () => {
    const state = session([{ start: 10, end: 20 }], { pendingSeek: 10 });
    const arrived = advanceLoop(state, { currentTime: 10.02, playbackRate: 1, tickSeconds: FRAME });
    assert.equal(arrived.seek, null);
    assert.equal(arrived.state.pendingSeek, null);
  });
});

// ─── Multi-segment chaining ──────────────────────────────────────────────────
describe('advanceLoop multi-segment behaviour', () => {
  const segs = () => [
    { start: 10, end: 14 },
    { start: 40, end: 44 },
    { start: 70, end: 74 },
  ];

  it('chain mode walks every segment and wraps back to the first', () => {
    const { seeks } = runLoop(session(segs()), { rate: 1, ticks: 1000 });
    const visited = seeks.map(s => s.index);
    assert.deepEqual(visited.slice(0, 4), [1, 2, 0, 1], 'segments play in order and cycle');
    assert.ok(seeks.slice(0, 4).every(s => s.reason === 'advance'));
  });

  it('single mode repeats only the armed segment', () => {
    const { seeks } = runLoop(session(segs(), { mode: 'single', index: 1 }), { rate: 1, ticks: 600 });
    assert.ok(seeks.length > 0);
    assert.ok(seeks.every(s => s.index === 1 && s.to === 40 && s.reason === 'wrap'));
  });

  it('single mode is the fallback when there is only one segment', () => {
    const { seeks } = runLoop(session([{ start: 10, end: 14 }]), { rate: 1, ticks: 400 });
    assert.ok(seeks.every(s => s.reason === 'wrap'));
  });

  it('pulls the user back in after scrubbing well before A', () => {
    const state = session(segs(), { index: 1 });
    const { seek, reason } = advanceLoop(state, { currentTime: 5, playbackRate: 1, tickSeconds: FRAME });
    assert.equal(seek, 40);
    assert.equal(reason, 'enter');
  });

  it('tolerates a small nudge just before A without fighting the user', () => {
    const state = session(segs(), { index: 1 });
    const { seek } = advanceLoop(state, { currentTime: 39.8, playbackRate: 1, tickSeconds: FRAME });
    assert.equal(seek, null);
  });
});

// ─── Degenerate input ────────────────────────────────────────────────────────
describe('advanceLoop robustness', () => {
  it('no-ops with no segments', () => {
    const { seek, state } = advanceLoop(session([]), { currentTime: 5, playbackRate: 1 });
    assert.equal(seek, null);
    assert.deepEqual(state.segments, []);
  });

  it('no-ops when currentTime is not readable yet (metadata still loading)', () => {
    const state = session([{ start: 10, end: 20 }]);
    assert.equal(advanceLoop(state, { currentTime: NaN, playbackRate: 1 }).seek, null);
    assert.equal(advanceLoop(state, {}).seek, null);
  });

  it('no-ops when the index points past the end of the list', () => {
    const state = session([{ start: 10, end: 20 }], { index: 7 });
    assert.equal(advanceLoop(state, { currentTime: 15, playbackRate: 1 }).seek, null);
  });

  it('never mutates the state it was handed', () => {
    const state = session([{ start: 10, end: 20 }]);
    const frozen = JSON.stringify(state);
    advanceLoop(state, { currentTime: 20, playbackRate: 2, tickSeconds: FRAME });
    assert.equal(JSON.stringify(state), frozen);
  });
});

// ─── Fullscreen ──────────────────────────────────────────────────────────────
describe('fullscreen handling', () => {
  const body = { tag: 'body' };
  const player = { tag: 'player' };

  it('wants a remount when entering fullscreen', () => {
    assert.equal(needsOverlayRemount(body, player, body), true);
  });

  it('wants a remount when leaving fullscreen', () => {
    assert.equal(needsOverlayRemount(player, null, body), true);
  });

  it('leaves the overlay alone when it is already in the painted subtree', () => {
    assert.equal(needsOverlayRemount(player, player, body), false);
    assert.equal(needsOverlayRemount(body, null, body), false);
  });

  it('does nothing when there is no host to mount into', () => {
    assert.equal(needsOverlayRemount(null, null, null), false);
  });

  it('keeps looping across a frame-dropping fullscreen transition', () => {
    // Entering fullscreen stalls rendering: one ~400ms tick instead of ~16ms.
    // The window is sized from the OBSERVED tick, so the wrap still fires.
    const state = session([{ start: 100, end: 103 }]);
    const beforeStall = advanceLoop(state, { currentTime: 102.5, playbackRate: 2, tickSeconds: FRAME });
    assert.equal(beforeStall.seek, null, 'nothing to do yet at 60fps');

    const afterStall = advanceLoop(state, { currentTime: 102.5, playbackRate: 2, tickSeconds: 0.4 });
    assert.equal(afterStall.seek, 100, 'the widened window catches B despite the stall');
  });

  it('re-binds when YouTube swaps the media element', () => {
    const oldVideo = { id: 'a' };
    const newVideo = { id: 'b' };
    assert.equal(shouldRebindVideo(oldVideo, newVideo), true);
    assert.equal(shouldRebindVideo(oldVideo, oldVideo), false);
    assert.equal(shouldRebindVideo(oldVideo, null), false, 'no live element yet — keep waiting');
  });
});

// ─── Loop ⇄ bookmark records (storage + recall integration) ──────────────────
describe('loop bookmark records', () => {
  const NOW = Date.parse('2026-08-08T10:00:00.000Z');
  const make = (overrides = {}) => buildLoopBookmark({
    videoId: 'dQw4w9WgXcQ',
    segment: { start: 42, end: 75 },
    name: 'Chorus',
    videoTitle: 'A video',
    reviewSchedule: [1, 3, 7],
    nowMs: NOW,
    ...overrides,
  });

  it('is an ordinary bookmark plus a loop range — no parallel store', () => {
    const bm = make();
    assert.equal(bm.videoId, 'dQw4w9WgXcQ');
    assert.equal(bm.timestamp, 42, 'A point doubles as the bookmark timestamp');
    assert.equal(bm.loop.end, 75);
    assert.equal(bm.description, 'Chorus');
    assert.equal(bm.createdAt, new Date(NOW).toISOString());
    assert.deepEqual(bm.reviewSchedule, [1, 3, 7]);
    assert.equal(bm.lastReviewed, null);
    // The fields the rest of the pipeline (sync, markers, Anki) already expects.
    for (const field of ['id', 'tags', 'color', 'videoTitle']) {
      assert.ok(field in bm, `missing ${field}`);
    }
  });

  it('falls back to the timecode range when no name is typed', () => {
    assert.equal(make({ name: '  ' }).description, 'Loop 0:42–1:15');
    assert.equal(sanitizeLoopName('', { start: 0, end: 5 }), 'Loop 0:00–0:05');
  });

  it('collapses whitespace and caps the name length', () => {
    assert.equal(sanitizeLoopName('  hard   bit  '), 'hard bit');
    assert.equal(sanitizeLoopName('x'.repeat(200)).length, LOOP_CONSTANTS.LOOP_NAME_MAX);
  });

  it('refuses to build from an invalid range', () => {
    assert.equal(make({ segment: { start: 10, end: 10 } }), null);
    assert.equal(make({ videoId: '' }), null);
  });

  it('recognises loop bookmarks and ignores plain ones', () => {
    assert.equal(isLoopBookmark(make()), true);
    assert.equal(isLoopBookmark({ timestamp: 10 }), false);
    assert.equal(isLoopBookmark({ timestamp: 10, loop: { end: 5 } }), false, 'end must be after start');
    assert.equal(isLoopBookmark(null), false);
  });

  it('exposes the B point for the recall/revisit player', () => {
    assert.equal(loopEndForBookmark(make()), 75);
    assert.equal(loopEndForBookmark({ timestamp: 10, description: 'plain' }), null);
  });

  it('extracts sorted segments from a mixed bookmark list', () => {
    const list = [
      make({ segment: { start: 90, end: 100 }, name: 'Late' }),
      { id: 2, timestamp: 5, description: 'a plain bookmark' },
      make({ segment: { start: 10, end: 20 }, name: 'Early' }),
    ];
    assert.deepEqual(
      loopSegmentsFromBookmarks(list).map(s => [s.start, s.end, s.name]),
      [[10, 20, 'Early'], [90, 100, 'Late']],
    );
  });

  it('detects a duplicate save of the same range', () => {
    const list = [make()];
    assert.equal(isDuplicateLoop(list, { start: 42, end: 75 }), true);
    assert.equal(isDuplicateLoop(list, { start: 42, end: 90 }), false);
    assert.equal(isDuplicateLoop([], { start: 42, end: 75 }), false);
  });
});

describe('formatLoopClock', () => {
  it('matches the player timecode style', () => {
    assert.equal(formatLoopClock(0), '0:00');
    assert.equal(formatLoopClock(75), '1:15');
    assert.equal(formatLoopClock(3725), '1:02:05');
  });

  it('is defensive about junk input', () => {
    assert.equal(formatLoopClock(-5), '0:00');
    assert.equal(formatLoopClock(NaN), '0:00');
    assert.equal(formatLoopClock(undefined), '0:00');
  });
});

describe('isSameLoopSegment', () => {
  it('treats sub-frame differences as the same range', () => {
    assert.equal(isSameLoopSegment({ start: 10, end: 20 }, { start: 10.02, end: 19.98 }), true);
    assert.equal(isSameLoopSegment({ start: 10, end: 20 }, { start: 11, end: 20 }), false);
    assert.equal(isSameLoopSegment(null, { start: 1, end: 2 }), false);
  });
});

// ─── Twin-file drift ─────────────────────────────────────────────────────────
// The classic content-script twin (loop.js) and the ESM twin (loop.module.js)
// must not diverge: only the module twin is exercised by the tests above, but
// only the classic twin ships inside the content script. The two differ by
// exactly the `export ` keyword and the trailing globalThis registration block,
// so anything else is drift.
describe('loop.js / loop.module.js twins', () => {
  const read = name =>
    readFileSync(fileURLToPath(new URL(`../../extension/src/${name}`, import.meta.url)), 'utf8');

  const stripHeaderAndRegistration = source =>
    source
      .split('\n')
      .filter(line => !/^globalThis\.\w+ = \w+;$/.test(line))
      .join('\n')
      // The two files describe each other in their header comment.
      .replace(/^\/\/ (ESM|Classic content-script) twin of.*$/m, '// TWIN')
      .replace(/^\/\/ KEEP IN SYNC:.*$/m, '// KEEP IN SYNC')
      .replace(/^\/\/ Register on globalThis[\s\S]*$/m, '')
      .replace(/^export /gm, '')
      .trimEnd();

  it('have identical logic', () => {
    assert.equal(
      stripHeaderAndRegistration(read('loop.js')),
      stripHeaderAndRegistration(read('loop.module.js')),
      'loop.js and loop.module.js have drifted — edit both twins together',
    );
  });

  it('register every exported name on globalThis in the classic twin', () => {
    const classic = read('loop.js');
    const exported = [...read('loop.module.js').matchAll(/^export (?:function|const) (\w+)/gm)]
      .map(m => m[1]);
    assert.ok(exported.length > 0);
    for (const name of exported) {
      assert.ok(
        classic.includes(`globalThis.${name} = ${name};`),
        `loop.js never exposes ${name} — the built content script would ReferenceError`,
      );
    }
  });
});
