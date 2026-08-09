// ─── A–B multi-segment loop engine (pure functions) ─────────────────────────
// ESM twin of extension/src/loop.js (classic content-script globals).
// KEEP IN SYNC: any change here must be mirrored in src/loop.js.
//
// Everything that decides *when to seek* lives here so it can be unit-tested
// without a browser — the content script only owns DOM/player plumbing. The two
// failure modes competitors are criticised for are both decided in this file:
//
//   1. "loop breaks at 2x" — a watchdog that compares `currentTime >= end`
//      overshoots by one tick of media time, which scales with playbackRate.
//      At 2x a 250ms `timeupdate` tick is 0.5s of video, enough to sail past a
//      short B point and never wrap. `loopWrapEpsilon()` sizes the trigger
//      window from rate × tick, and `advanceLoop()` also treats an already
//      overshot position as "wrap now" instead of waiting for a fresh crossing.
//
//   2. "loop fights the user" — after we seek, `currentTime` reports the OLD
//      position for a few ticks. Without a settle gate that re-triggers a wrap
//      every tick and the video judders. `pendingSeek` holds the gate until the
//      playhead actually arrives.
//
// Loops are stored as ordinary bookmarks carrying a `loop: { end }` field, so
// they ride the existing chrome.storage.sync → /api/bookmarks → Supabase path
// and are already Active-Recall items. There is deliberately no parallel store.

const LOOP_MIN_DURATION = 0.25;   // seconds — reject A–B pairs tighter than this
const LOOP_DEFAULT_TICK = 1 / 60; // seconds of wall clock per watchdog tick (rVFC/rAF)
const LOOP_MIN_EPSILON  = 0.04;   // never trigger tighter than this
const LOOP_MAX_EPSILON  = 0.75;   // …nor looser, however slow the tick source is
const LOOP_ENTER_TOLERANCE = 0.5; // seconds before A the user may sit without being pulled in
const LOOP_SEEK_SETTLE  = 0.35;   // how close to the seek target counts as "arrived"
const LOOP_SEEK_TIMEOUT = 0.4;    // wall seconds before a never-landing seek stops blocking
const LOOP_NAME_MAX     = 80;
const LOOP_COLOR        = '#8b5cf6'; // violet — distinct from the default bookmark blue

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function finite(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Size of the "close enough to B" window, in media seconds.
 *
 * The watchdog samples the playhead every `tickSeconds` of wall clock, which is
 * `rate * tickSeconds` of MEDIA time — so the window has to grow with playback
 * rate or a fast-playing segment steps straight over B. 1.5 ticks of slack
 * absorbs a single dropped frame (fullscreen transitions drop several).
 *
 * @param {number} playbackRate
 * @param {number} [tickSeconds] wall-clock seconds between watchdog samples
 * @returns {number} seconds
 */
export function loopWrapEpsilon(playbackRate = 1, tickSeconds = LOOP_DEFAULT_TICK) {
  const rate = finite(playbackRate) && playbackRate > 0 ? playbackRate : 1;
  const tick = finite(tickSeconds) && tickSeconds > 0 ? tickSeconds : LOOP_DEFAULT_TICK;
  return clampNumber(rate * tick * 1.5, LOOP_MIN_EPSILON, LOOP_MAX_EPSILON);
}

/**
 * Normalizes a raw A/B pair into a `{ start, end }` segment.
 *
 * A and B may be marked in either order (users routinely mark B first), so the
 * pair is sorted rather than rejected. Returns null when the pair can't make a
 * loop: non-finite input, or shorter than LOOP_MIN_DURATION after clamping.
 *
 * @param {{a?: number, b?: number, start?: number, end?: number}} pair
 * @param {number} [duration] video duration; 0/unknown skips the upper clamp
 * @returns {{start: number, end: number}|null}
 */
export function normalizeLoopSegment(pair, duration = 0) {
  if (!pair) return null;
  const rawA = finite(pair.a) ? pair.a : pair.start;
  const rawB = finite(pair.b) ? pair.b : pair.end;
  if (!finite(rawA) || !finite(rawB)) return null;

  const upper = finite(duration) && duration > 0 ? duration : Infinity;
  const start = clampNumber(Math.min(rawA, rawB), 0, upper);
  const end   = clampNumber(Math.max(rawA, rawB), 0, upper);
  if (end - start < LOOP_MIN_DURATION) return null;
  return { start, end };
}

/** True when the pair survives normalizeLoopSegment. */
export function isValidLoopSegment(pair, duration = 0) {
  return normalizeLoopSegment(pair, duration) !== null;
}

/** True when two segments describe (near enough) the same range. */
export function isSameLoopSegment(a, b, tolerance = 0.05) {
  if (!a || !b) return false;
  return Math.abs(a.start - b.start) <= tolerance && Math.abs(a.end - b.end) <= tolerance;
}

/**
 * Adds a segment to the in-session list: normalized, sorted by start, and
 * de-duplicated against a segment that already covers the same range.
 *
 * Overlapping-but-distinct segments are allowed on purpose — "drill bars 4–8"
 * and "drill bars 1–16" are both legitimate practice loops over the same audio.
 *
 * @returns {Array<{start: number, end: number}>} a NEW array (input untouched)
 */
export function insertLoopSegment(segments, pair, duration = 0) {
  const list = Array.isArray(segments) ? segments : [];
  const seg = normalizeLoopSegment(pair, duration);
  if (!seg) return [...list];
  if (list.some(existing => isSameLoopSegment(existing, seg))) return [...list];
  const next = [...list, { ...pair, ...seg }];
  next.sort((x, y) => x.start - y.start || x.end - y.end);
  return next;
}

/**
 * Re-anchors one bound of an existing segment to `time` (i.e. "make A/B here").
 *
 * The result is re-normalized and re-sorted, so dragging A past B just flips the
 * pair rather than producing an inverted range. Returns the list UNCHANGED when
 * the edit would make an invalid segment — the caller can compare identity to
 * tell whether it applied.
 *
 * Any extra fields on the segment (a saved loop's `id`/`name`) are preserved so
 * the caller can persist the edit against the right stored record.
 *
 * @param {Array} segments
 * @param {number} index
 * @param {'start'|'end'} which
 * @param {number} time
 * @param {number} [duration]
 * @returns {Array} a NEW array (input untouched)
 */
export function updateLoopSegmentBound(segments, index, which, time, duration = 0) {
  const list = Array.isArray(segments) ? segments : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return [...list];
  if (which !== 'start' && which !== 'end') return [...list];

  const current = list[index];
  const edited = normalizeLoopSegment(
    which === 'start' ? { a: time, b: current.end } : { a: current.start, b: time },
    duration,
  );
  if (!edited) return [...list];

  const next = [...list];
  next[index] = { ...current, ...edited };
  next.sort((x, y) => x.start - y.start || x.end - y.end);
  return next;
}

/** Removes the segment at `index`, returning a NEW array. */
export function removeLoopSegment(segments, index) {
  const list = Array.isArray(segments) ? segments : [];
  if (!Number.isInteger(index) || index < 0 || index >= list.length) return [...list];
  return list.filter((_, i) => i !== index);
}

/**
 * The whole loop runtime, as a pure reducer. One call per watchdog tick.
 *
 * `state.mode`:
 *   'single' — wrap A→B→A forever (classic Looper behaviour)
 *   'chain'  — play each saved segment in turn and wrap round to the first;
 *              this is the multi-segment differentiator, and it is the default.
 *
 * @param {{segments: Array, index: number, mode?: string, pendingSeek?: number|null,
 *          pendingSeekSeconds?: number}} state
 * @param {{currentTime: number, playbackRate?: number, tickSeconds?: number}} tick
 * @returns {{state: object, seek: number|null, reason: string|null}}
 *          `seek` is the position the caller must write to video.currentTime
 *          (null = do nothing this tick). `state` is always a new object.
 */
export function advanceLoop(state, tick) {
  const segments = Array.isArray(state?.segments) ? state.segments : [];
  const index    = Number.isInteger(state?.index) ? state.index : 0;
  const mode     = state?.mode === 'single' ? 'single' : 'chain';
  const base     = { ...state, segments, index, mode };
  const noop     = (patch = {}) => ({ state: { ...base, ...patch }, seek: null, reason: null });

  const seg = segments[index];
  const currentTime = tick?.currentTime;
  // No segment, or the player has no usable clock yet (metadata still loading).
  if (!seg || !finite(seg.start) || !finite(seg.end) || !finite(currentTime)) {
    return noop({ pendingSeek: null });
  }

  // A seek is in flight: currentTime still reports the pre-seek position for a
  // tick or two. Re-issuing a wrap here is what makes competitors' loops judder.
  //
  // Arrival is proximity ONLY. "currentTime has passed the target" is not a
  // valid arrival test: a wrap seeks BACKWARD, so the stale pre-seek position is
  // always past it. The wait is bounded in seconds (not ticks) so it behaves the
  // same whether the caller is ticking per frame or per 200ms safety interval —
  // if the seek never lands (unseekable range, element swapped mid-seek) the
  // gate opens instead of freezing the loop forever.
  if (finite(state?.pendingSeek)) {
    base.pendingSeekSeconds = 0;
    if (Math.abs(currentTime - state.pendingSeek) > LOOP_SEEK_SETTLE) {
      const step = finite(tick?.tickSeconds) && tick.tickSeconds > 0
        ? tick.tickSeconds
        : LOOP_DEFAULT_TICK;
      const waited = (finite(state.pendingSeekSeconds) ? state.pendingSeekSeconds : 0) + step;
      if (waited < LOOP_SEEK_TIMEOUT) return noop({ pendingSeekSeconds: waited });
    }
    base.pendingSeek = null;
  } else {
    base.pendingSeek = null;
    base.pendingSeekSeconds = 0;
  }

  // Never let the trigger window swallow more than half the segment, or a short
  // loop would wrap the instant it starts and spin forever.
  const epsilon = Math.min(
    loopWrapEpsilon(tick?.playbackRate, tick?.tickSeconds),
    (seg.end - seg.start) / 2,
  );

  // At/past B — `>=` (not `>`) means an overshoot from a big tick still wraps.
  if (currentTime >= seg.end - epsilon) {
    const nextIndex = mode === 'chain' && segments.length > 1
      ? (index + 1) % segments.length
      : index;
    const target = segments[nextIndex].start;
    return {
      state: { ...base, index: nextIndex, pendingSeek: target, pendingSeekSeconds: 0 },
      seek: target,
      reason: nextIndex === index ? 'wrap' : 'advance',
    };
  }

  // The user scrubbed well before A while a loop is armed — pull them back in.
  if (currentTime < seg.start - LOOP_ENTER_TOLERANCE) {
    return {
      state: { ...base, pendingSeek: seg.start, pendingSeekSeconds: 0 },
      seek: seg.start,
      reason: 'enter',
    };
  }

  return noop();
}

/**
 * True when the loop overlay has drifted out of the subtree that is actually
 * being painted. Entering fullscreen makes the browser render ONLY the
 * fullscreen element's subtree, so an overlay parented to <body> silently
 * vanishes — the single most common "loop broke in fullscreen" report.
 *
 * @param {Node|null} overlayParent current parentNode of the overlay
 * @param {Node|null} fullscreenElement document.fullscreenElement
 * @param {Node|null} body document.body
 */
export function needsOverlayRemount(overlayParent, fullscreenElement, body) {
  const desired = fullscreenElement || body;
  if (!desired) return false;
  return overlayParent !== desired;
}

/**
 * True when the cached <video> is stale and the caller must re-bind listeners.
 * YouTube swaps the media element on SPA navigation and on some player
 * re-inits; a watchdog holding the old element never fires again.
 */
export function shouldRebindVideo(cached, live) {
  return !!live && cached !== live;
}

// ─── Loop ⇄ bookmark record helpers ─────────────────────────────────────────
// A saved loop IS a bookmark with a `loop: { end }` field. Nothing else about
// the bookmark pipeline changes — sync, markers, Active Recall and the webapp
// all keep working on the records they already understand.

/** True when a bookmark record carries a valid A–B range. */
export function isLoopBookmark(bookmark) {
  return !!bookmark &&
    finite(bookmark.timestamp) &&
    finite(bookmark?.loop?.end) &&
    bookmark.loop.end > bookmark.timestamp;
}

/** The B point of a loop bookmark, or null for a plain bookmark. */
export function loopEndForBookmark(bookmark) {
  return isLoopBookmark(bookmark) ? bookmark.loop.end : null;
}

/** Every saved loop for a video, as segments sorted by start. */
export function loopSegmentsFromBookmarks(bookmarks) {
  return (bookmarks || [])
    .filter(isLoopBookmark)
    .map(b => ({ start: b.timestamp, end: b.loop.end, name: b.description || '', id: b.id }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Trims/limits a user-supplied loop name; falls back to the timecode range. */
export function sanitizeLoopName(name, segment) {
  const trimmed = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, LOOP_NAME_MAX);
  if (trimmed) return trimmed;
  return segment ? `Loop ${formatLoopClock(segment.start)}–${formatLoopClock(segment.end)}` : 'Loop';
}

/** m:ss (or h:mm:ss past an hour) — matches the player's own timecode style. */
export function formatLoopClock(seconds) {
  const total = Math.max(0, Math.floor(finite(seconds) ? seconds : 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Builds the bookmark record for a saved loop.
 *
 * `reviewSchedule` is resolved by the CALLER using the existing Active-Recall
 * enrollment rules (Pro → always enrolled, free → only under the standing card
 * cap), so loops enter recall through exactly the same gate as bookmarks.
 *
 * @param {{videoId: string, segment: {start: number, end: number}, name?: string,
 *          videoTitle?: string|null, reviewSchedule?: number[], nowMs?: number}} input
 * @returns {object|null} a bookmark record, or null if the segment is invalid
 */
export function buildLoopBookmark({ videoId, segment, name, videoTitle = null, reviewSchedule = [], nowMs = 0 }) {
  const seg = normalizeLoopSegment(segment);
  if (!seg || !videoId) return null;
  const now = finite(nowMs) && nowMs > 0 ? nowMs : 0;
  return {
    id: now,
    videoId,
    timestamp: seg.start,
    description: sanitizeLoopName(name, seg),
    tags: [],
    color: LOOP_COLOR,
    createdAt: new Date(now).toISOString(),
    videoTitle,
    reviewSchedule,
    lastReviewed: null,
    loop: { end: seg.end },
  };
}

/**
 * True when this exact A–B range is already saved for the video — the same
 * duplicate rule bookmarks use (floor-second match), widened to both ends.
 */
export function isDuplicateLoop(bookmarks, segment) {
  const seg = normalizeLoopSegment(segment);
  if (!seg) return false;
  return loopSegmentsFromBookmarks(bookmarks).some(existing => isSameLoopSegment(existing, seg));
}

export const LOOP_CONSTANTS = {
  LOOP_MIN_DURATION,
  LOOP_DEFAULT_TICK,
  LOOP_MIN_EPSILON,
  LOOP_MAX_EPSILON,
  LOOP_ENTER_TOLERANCE,
  LOOP_SEEK_SETTLE,
  LOOP_SEEK_TIMEOUT,
  LOOP_NAME_MAX,
  LOOP_COLOR,
};
