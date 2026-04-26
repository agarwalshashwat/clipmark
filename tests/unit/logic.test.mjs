/**
 * Pure-logic unit tests — no browser, no Chrome APIs required.
 *
 * Functions are inlined from their source files verbatim so that tests run
 * in a plain Node.js context without VM realm-mismatch issues.
 *
 * Source file locations:
 *   parseTags, getTagColor, stringToColor, ytWatchUrl, ytThumbnailUrl
 *     → extension/src/constants.js
 *   formatTimestamp, bmKey
 *     → extension/src/background/background.js  (also in content.js)
 *   clusterBookmarks, cleanTranscriptText, getTextAtTimestamp
 *     → extension/src/content/content.js
 *
 * IMPORTANT: Keep these copies in sync with their source files.
 * The Playwright E2E specs exercise the real source in a live browser.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert'; // non-strict: deepEqual handles plain-value comparison

// ─── Inlined from extension/src/constants.js ──────────────────────────────

const TAG_COLORS = {
  important: '#ef4444',
  review:    '#f97316',
  note:      '#3b82f6',
  question:  '#22c55e',
  todo:      '#a855f7',
  key:       '#ec4899',
};

const TRANSCRIPT_TRUNCATE_LENGTH = 120;

function parseTags(description) {
  if (!description) return [];
  const matches = description.match(/#(\w+)/g);
  return matches ? matches.map(t => t.slice(1).toLowerCase()) : [];
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}

function getTagColor(tags) {
  if (!tags || tags.length === 0) return '#4da1ee';
  return TAG_COLORS[tags[0]] || stringToColor(tags[0]);
}

function ytWatchUrl(videoId, t = 0) {
  return `https://www.youtube.com/watch?v=${videoId}${t ? `&t=${Math.floor(t)}s` : ''}`;
}

function ytThumbnailUrl(videoId, quality = 'mqdefault') {
  return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
}

// ─── Inlined from extension/src/background/background.js ──────────────────

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function bmKey(videoId) { return `bm_${videoId}`; }

// ─── Inlined from extension/src/content/content.js ────────────────────────

function clusterBookmarks(bookmarks, duration) {
  if (bookmarks.length <= 8 || !duration) return bookmarks.map(b => ({ ...b, isCluster: false }));

  const sorted    = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);
  const threshold = duration * 0.008;
  const result    = [];
  let i = 0;

  while (i < sorted.length) {
    const group = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && sorted[j].timestamp - sorted[i].timestamp < threshold) {
      group.push(sorted[j]);
      j++;
    }
    if (group.length === 1) {
      result.push({ ...group[0], isCluster: false });
    } else {
      const mid = group[Math.floor(group.length / 2)];
      result.push({
        ...mid,
        isCluster: true,
        clusterCount: group.length,
        clusterItems: group.map(b => ({
          timestamp: b.timestamp,
          description: b.description || 'No description',
          tags: b.tags || [],
          color: b.color || getTagColor(b.tags || []),
        })),
      });
    }
    i = j;
  }
  return result;
}

function cleanTranscriptText(text) {
  if (!text) return null;
  let t = text.trim();
  t = t.charAt(0).toUpperCase() + t.slice(1);
  if (t.length > TRANSCRIPT_TRUNCATE_LENGTH) {
    t = t.substring(0, TRANSCRIPT_TRUNCATE_LENGTH).replace(/\s+\S*$/, '') + '…';
  }
  return t || null;
}

function getTextAtTimestamp(transcript, timestamp) {
  if (!transcript || transcript.length === 0) return null;

  const from = timestamp - 1;
  const to   = timestamp + 4;

  let hits = transcript.filter(s => s.start < to && s.end > from);

  if (hits.length === 0) {
    hits = [transcript.reduce((best, s) =>
      Math.abs(s.start - timestamp) < Math.abs(best.start - timestamp) ? s : best
    )];
  }

  const combined = hits.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
  return cleanTranscriptText(combined);
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

// ─── parseTags ─────────────────────────────────────────────────────────────
describe('parseTags', () => {
  it('returns empty array for empty string', () => {
    assert.deepEqual(parseTags(''), []);
  });

  it('returns empty array for null', () => {
    assert.deepEqual(parseTags(null), []);
  });

  it('returns empty array for undefined', () => {
    assert.deepEqual(parseTags(undefined), []);
  });

  it('extracts a single tag', () => {
    assert.deepEqual(parseTags('Great moment #important'), ['important']);
  });

  it('extracts multiple tags', () => {
    assert.deepEqual(parseTags('#note worth revisiting #review'), ['note', 'review']);
  });

  it('lowercases extracted tags', () => {
    assert.deepEqual(parseTags('#Important #TODO'), ['important', 'todo']);
  });

  it('ignores text without # prefix', () => {
    assert.deepEqual(parseTags('no tags here at all'), []);
  });

  it('handles consecutive tags', () => {
    assert.deepEqual(parseTags('#a #b #c'), ['a', 'b', 'c']);
  });

  it('captures digits-only words after #', () => {
    const tags = parseTags('#123');
    assert.strictEqual(tags.length, 1);
    assert.strictEqual(tags[0], '123');
  });

  it('handles tags embedded within longer text', () => {
    assert.deepEqual(parseTags('important moment #key concept'), ['key']);
  });
});

// ─── getTagColor ───────────────────────────────────────────────────────────
describe('getTagColor', () => {
  it('returns default blue for empty array', () => {
    assert.strictEqual(getTagColor([]), '#4da1ee');
  });

  it('returns default blue for null', () => {
    assert.strictEqual(getTagColor(null), '#4da1ee');
  });

  it('returns default blue for undefined', () => {
    assert.strictEqual(getTagColor(undefined), '#4da1ee');
  });

  it('returns correct color for "important"', () => {
    assert.strictEqual(getTagColor(['important']), TAG_COLORS.important);
  });

  it('returns correct color for "review"', () => {
    assert.strictEqual(getTagColor(['review']), TAG_COLORS.review);
  });

  it('returns correct color for "note"', () => {
    assert.strictEqual(getTagColor(['note']), TAG_COLORS.note);
  });

  it('returns correct color for "question"', () => {
    assert.strictEqual(getTagColor(['question']), TAG_COLORS.question);
  });

  it('returns correct color for "todo"', () => {
    assert.strictEqual(getTagColor(['todo']), TAG_COLORS.todo);
  });

  it('returns correct color for "key"', () => {
    assert.strictEqual(getTagColor(['key']), TAG_COLORS.key);
  });

  it('uses the first tag when multiple are supplied', () => {
    assert.strictEqual(getTagColor(['important', 'note']), TAG_COLORS.important);
  });

  it('returns an HSL string for unknown tags', () => {
    const color = getTagColor(['unknowntag']);
    assert.match(color, /^hsl\(\d+,\s*55%,\s*45%\)$/);
  });

  it('two different unknown tags produce different colors', () => {
    assert.notStrictEqual(getTagColor(['aaa']), getTagColor(['zzz']));
  });
});

// ─── stringToColor ─────────────────────────────────────────────────────────
describe('stringToColor', () => {
  it('returns a valid HSL string', () => {
    assert.match(stringToColor('hello'), /^hsl\(\d+,\s*55%,\s*45%\)$/);
  });

  it('is deterministic — same input always yields the same color', () => {
    assert.strictEqual(stringToColor('clipmark'), stringToColor('clipmark'));
  });

  it('produces different colors for different inputs', () => {
    assert.notStrictEqual(stringToColor('aaa'), stringToColor('zzz'));
  });

  it('hue is in 0–359 range', () => {
    for (const word of ['test', 'hello', 'world', 'youtube', 'bookmark']) {
      const hsl = stringToColor(word);
      const hue = parseInt(hsl.match(/hsl\((\d+)/)[1], 10);
      assert.ok(hue >= 0 && hue < 360, `Hue ${hue} out of [0, 360) for "${word}"`);
    }
  });

  it('saturation is always 55%', () => {
    assert.match(stringToColor('any'), /55%/);
  });

  it('lightness is always 45%', () => {
    assert.match(stringToColor('any'), /45%/);
  });
});

// ─── formatTimestamp ───────────────────────────────────────────────────────
describe('formatTimestamp', () => {
  it('formats 0 seconds as 00:00', () => {
    assert.strictEqual(formatTimestamp(0), '00:00');
  });

  it('formats 65 seconds as 01:05', () => {
    assert.strictEqual(formatTimestamp(65), '01:05');
  });

  it('formats 3600 seconds as 60:00', () => {
    assert.strictEqual(formatTimestamp(3600), '60:00');
  });

  it('pads minutes with a leading zero when < 10', () => {
    assert.strictEqual(formatTimestamp(9), '00:09');
  });

  it('pads seconds with a leading zero when < 10', () => {
    assert.strictEqual(formatTimestamp(61), '01:01');
  });

  it('floors fractional seconds', () => {
    assert.strictEqual(formatTimestamp(90.9), '01:30');
  });

  it('formats exactly 1 minute as 01:00', () => {
    assert.strictEqual(formatTimestamp(60), '01:00');
  });

  it('formats large timestamps correctly (90m 30s)', () => {
    assert.strictEqual(formatTimestamp(5430), '90:30');
  });
});

// ─── bmKey ─────────────────────────────────────────────────────────────────
describe('bmKey', () => {
  it('prepends bm_ to videoId', () => {
    assert.strictEqual(bmKey('dQw4w9WgXcQ'), 'bm_dQw4w9WgXcQ');
  });

  it('works for any string videoId', () => {
    assert.strictEqual(bmKey('abc123'), 'bm_abc123');
  });

  it('produces unique keys for different video IDs', () => {
    assert.notStrictEqual(bmKey('aaa'), bmKey('bbb'));
  });
});

// ─── ytWatchUrl ───────────────────────────────────────────────────────────
describe('ytWatchUrl', () => {
  it('returns a well-formed YouTube watch URL', () => {
    assert.strictEqual(
      ytWatchUrl('dQw4w9WgXcQ'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
  });

  it('appends timestamp when t > 0', () => {
    assert.strictEqual(
      ytWatchUrl('dQw4w9WgXcQ', 90),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s',
    );
  });

  it('floors the timestamp to an integer', () => {
    assert.strictEqual(ytWatchUrl('abc', 10.7), 'https://www.youtube.com/watch?v=abc&t=10s');
  });

  it('omits the t param when t is 0', () => {
    assert.strictEqual(ytWatchUrl('abc', 0), 'https://www.youtube.com/watch?v=abc');
  });

  it('omits the t param when t is not provided', () => {
    assert.strictEqual(ytWatchUrl('abc'), 'https://www.youtube.com/watch?v=abc');
  });
});

// ─── ytThumbnailUrl ───────────────────────────────────────────────────────
describe('ytThumbnailUrl', () => {
  it('returns a well-formed thumbnail URL with default quality', () => {
    assert.strictEqual(
      ytThumbnailUrl('dQw4w9WgXcQ'),
      'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
    );
  });

  it('respects a custom quality parameter', () => {
    assert.strictEqual(
      ytThumbnailUrl('dQw4w9WgXcQ', 'hqdefault'),
      'https://img.youtube.com/vi/dQw4w9WgXcQ/hqdefault.jpg',
    );
  });

  it('supports maxresdefault quality', () => {
    assert.strictEqual(
      ytThumbnailUrl('abc', 'maxresdefault'),
      'https://img.youtube.com/vi/abc/maxresdefault.jpg',
    );
  });
});

// ─── clusterBookmarks ─────────────────────────────────────────────────────
describe('clusterBookmarks', () => {
  function makeBookmarks(timestamps) {
    return timestamps.map((ts, i) => ({
      id: i,
      timestamp: ts,
      description: `Bookmark ${i}`,
      tags: [],
      color: '#4da1ee',
    }));
  }

  it('returns [] for empty bookmarks', () => {
    assert.deepEqual(clusterBookmarks([], 300), []);
  });

  it('marks all bookmarks as isCluster:false when count <= 8', () => {
    const bms = makeBookmarks([10, 20, 30, 40, 50, 60, 70, 80]);
    const result = clusterBookmarks(bms, 600);
    assert.ok(result.every(r => r.isCluster === false));
    assert.strictEqual(result.length, 8);
  });

  it('marks all bookmarks as isCluster:false when duration is 0', () => {
    const bms = makeBookmarks(Array.from({ length: 12 }, (_, i) => i * 10));
    assert.ok(clusterBookmarks(bms, 0).every(r => r.isCluster === false));
  });

  it('marks all bookmarks as isCluster:false when duration is null', () => {
    const bms = makeBookmarks(Array.from({ length: 10 }, (_, i) => i * 10));
    assert.ok(clusterBookmarks(bms, null).every(r => r.isCluster === false));
  });

  it('does not cluster spread-out bookmarks even when count > 8', () => {
    // 9 bookmarks each 60s apart; threshold for 600s video = 4.8s -> no clustering
    const bms = makeBookmarks([0, 60, 120, 180, 240, 300, 360, 420, 480]);
    const result = clusterBookmarks(bms, 600);
    assert.ok(result.every(r => r.isCluster === false));
    assert.strictEqual(result.length, 9);
  });

  it('clusters nearby bookmarks when count > 8', () => {
    // threshold for 3600s video = 28.8s; bookmarks at 1, 2, 3 are within threshold
    const bms = makeBookmarks([1, 2, 3, 200, 400, 600, 800, 1000, 1200]);
    const result = clusterBookmarks(bms, 3600);
    const cluster = result.find(r => r.isCluster);
    assert.ok(cluster, 'Expected at least one cluster');
    assert.strictEqual(cluster.clusterCount, 3);
  });

  it('cluster uses the middle bookmark as representative', () => {
    // Middle of sorted group [100, 101, 102] is index 1 -> timestamp 101
    const bms = makeBookmarks([100, 101, 102, 200, 400, 600, 800, 1000, 1200]);
    const cluster = clusterBookmarks(bms, 3600).find(r => r.isCluster);
    assert.strictEqual(cluster.timestamp, 101);
  });

  it('cluster items contain all grouped bookmarks in sorted order', () => {
    const bms = makeBookmarks([100, 101, 102, 200, 400, 600, 800, 1000, 1200]);
    const cluster = clusterBookmarks(bms, 3600).find(r => r.isCluster);
    assert.strictEqual(cluster.clusterItems.length, 3);
    assert.deepEqual(
      cluster.clusterItems.map(ci => ci.timestamp),
      [100, 101, 102],
    );
  });

  it('each cluster item has description, tags, and color', () => {
    const bms = makeBookmarks([100, 101, 102, 200, 400, 600, 800, 1000, 1200]);
    const cluster = clusterBookmarks(bms, 3600).find(r => r.isCluster);
    for (const ci of cluster.clusterItems) {
      assert.ok('description' in ci, 'Missing description');
      assert.ok('tags' in ci,        'Missing tags');
      assert.ok('color' in ci,       'Missing color');
    }
  });

  it('single-item groups remain isCluster:false', () => {
    const bms = makeBookmarks([100, 101, 300, 500, 700, 900, 1100, 1300, 1500]);
    const singles = clusterBookmarks(bms, 3600).filter(r => !r.isCluster);
    assert.ok(singles.length >= 7, `Expected >=7 singles, got ${singles.length}`);
  });

  it('two equal-timestamp bookmarks form a cluster of 2', () => {
    const bms = makeBookmarks([50, 50, 200, 400, 600, 800, 1000, 1200, 1400]);
    const cluster = clusterBookmarks(bms, 3600).find(r => r.isCluster);
    assert.ok(cluster);
    assert.strictEqual(cluster.clusterCount, 2);
  });

  it('preserves un-clustered bookmarks alongside clusters', () => {
    // [1,2,3] -> 1 cluster; [200,400,600,800,1000,1200] -> 6 singles; total 7
    const bms = makeBookmarks([1, 2, 3, 200, 400, 600, 800, 1000, 1200]);
    assert.strictEqual(clusterBookmarks(bms, 3600).length, 7);
  });
});

// ─── cleanTranscriptText ──────────────────────────────────────────────────
describe('cleanTranscriptText', () => {
  it('returns null for empty string', () => {
    assert.strictEqual(cleanTranscriptText(''), null);
  });

  it('returns null for null input', () => {
    assert.strictEqual(cleanTranscriptText(null), null);
  });

  it('returns null for whitespace-only string', () => {
    assert.strictEqual(cleanTranscriptText('   '), null);
  });

  it('capitalizes the first letter', () => {
    const result = cleanTranscriptText('hello world');
    assert.strictEqual(result[0], 'H');
  });

  it('leaves text under the limit unchanged (except capitalization)', () => {
    assert.strictEqual(cleanTranscriptText('hello world'), 'Hello world');
  });

  it(`truncates text longer than ${TRANSCRIPT_TRUNCATE_LENGTH} chars`, () => {
    const long = 'word '.repeat(40).trim();
    const result = cleanTranscriptText(long);
    assert.ok(
      result.length <= TRANSCRIPT_TRUNCATE_LENGTH + 1,
      `Expected length <=${TRANSCRIPT_TRUNCATE_LENGTH + 1}, got ${result.length}`,
    );
    assert.ok(result.endsWith('…'));
  });

  it('does not cut in the middle of a word', () => {
    const text = 'a '.repeat(60) + 'longwordthatwouldbesplit';
    const result = cleanTranscriptText(text);
    assert.ok(result.endsWith('…'));
    const withoutEllipsis = result.slice(0, -1);
    assert.ok(!withoutEllipsis.endsWith(' '), 'Should not trail a space before ellipsis');
  });

  it('trims leading and trailing whitespace', () => {
    assert.strictEqual(cleanTranscriptText('  hello  '), 'Hello');
  });

  it('handles single-word input', () => {
    assert.strictEqual(cleanTranscriptText('word'), 'Word');
  });
});

// ─── getTextAtTimestamp ───────────────────────────────────────────────────
describe('getTextAtTimestamp', () => {
  const sampleTranscript = [
    { start: 0,  end: 2,  text: 'welcome to this video' },
    { start: 2,  end: 5,  text: 'today we cover testing' },
    { start: 5,  end: 8,  text: 'we will look at unit tests' },
    { start: 8,  end: 12, text: 'playwright is great' },
    { start: 60, end: 65, text: 'later on we discuss deployment' },
  ];

  it('returns null for empty transcript array', () => {
    assert.strictEqual(getTextAtTimestamp([], 5), null);
  });

  it('returns null for null transcript', () => {
    assert.strictEqual(getTextAtTimestamp(null, 5), null);
  });

  it('returns text from segments overlapping the 5s window', () => {
    const result = getTextAtTimestamp(sampleTranscript, 3);
    assert.ok(result, 'Expected non-null result');
    assert.match(result.toLowerCase(), /testing|unit tests/);
  });

  it('falls back to nearest segment when no overlap', () => {
    const result = getTextAtTimestamp(sampleTranscript, 100);
    assert.ok(result);
    assert.match(result.toLowerCase(), /deployment/);
  });

  it('combines multiple overlapping segments', () => {
    const result = getTextAtTimestamp(sampleTranscript, 1);
    assert.ok(result && result.length > 0);
  });

  it('capitalizes the returned text', () => {
    const result = getTextAtTimestamp(sampleTranscript, 0);
    assert.strictEqual(result[0], result[0].toUpperCase());
  });

  it('handles single-segment transcript', () => {
    const single = [{ start: 10, end: 15, text: 'single segment here' }];
    const result = getTextAtTimestamp(single, 12);
    assert.ok(result);
    assert.match(result.toLowerCase(), /single segment/);
  });
});
