/**
 * Anki export TSV builder — pure-logic unit tests (no browser, no Chrome APIs).
 *
 * buildAnkiTsv is imported directly from the shipped source module
 * (extension/src/export-anki.module.js) so these tests guard the real code
 * and cannot silently drift from it.
 *
 * Run: npm run test:unit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

import { buildAnkiTsv } from '../../extension/src/export-anki.module.js';

// Minimal bookmark factory matching the stored shape.
function bm(overrides = {}) {
  return {
    id: 1,
    videoId: 'abc123',
    timestamp: 65,
    description: 'Cardiac cycle recap',
    tags: [],
    color: '#4da1ee',
    createdAt: '2026-07-18T10:00:00.000Z',
    videoTitle: null,
    ...overrides,
  };
}

function rows(tsv) {
  return tsv.split('\n').filter(l => !l.startsWith('#'));
}

describe('buildAnkiTsv', () => {
  it('emits the Anki header directives in order', () => {
    const tsv = buildAnkiTsv([], {});
    assert.deepEqual(tsv.split('\n'), ['#separator:tab', '#html:true', '#tags column:3']);
  });

  it('emits one tab-separated row per bookmark with 3 fields', () => {
    const tsv = buildAnkiTsv([bm(), bm({ id: 2, timestamp: 130 })], { abc123: 'Physiology' });
    const dataRows = rows(tsv);
    assert.equal(dataRows.length, 2);
    for (const row of dataRows) assert.equal(row.split('\t').length, 3);
  });

  describe('field escaping', () => {
    const cases = [
      {
        name: 'tabs in description become spaces',
        bookmark: bm({ description: 'Hi\tthere' }),
        field: 0,
        expect: v => assert.equal(v, 'Hi there'),
      },
      {
        name: 'newlines in description become <br>',
        bookmark: bm({ description: 'line1\nline2' }),
        field: 0,
        expect: v => assert.equal(v, 'line1<br>line2'),
      },
      {
        name: 'CRLF newlines become a single <br>',
        bookmark: bm({ description: 'line1\r\nline2' }),
        field: 0,
        expect: v => assert.equal(v, 'line1<br>line2'),
      },
      {
        name: 'newlines in notes become <br> in the Back field',
        bookmark: bm({ notes: 'note line1\nnote line2' }),
        field: 1,
        expect: v => assert.ok(v.includes('note line1<br>note line2')),
      },
      {
        name: 'HTML in user text is escaped',
        bookmark: bm({ description: '<b>bold?</b> & more' }),
        field: 0,
        expect: v => assert.equal(v, '&lt;b&gt;bold?&lt;/b&gt; &amp; more'),
      },
      {
        name: 'surrounding whitespace in description is trimmed',
        bookmark: bm({ description: '  padded  ' }),
        field: 0,
        expect: v => assert.equal(v, 'padded'),
      },
    ];

    for (const { name, bookmark, field, expect } of cases) {
      it(name, () => {
        const tsv = buildAnkiTsv([bookmark], {});
        expect(rows(tsv)[0].split('\t')[field]);
      });
    }
  });

  describe('Back field', () => {
    it('contains the deep link back to the exact moment', () => {
      const tsv  = buildAnkiTsv([bm({ videoId: 'abc', timestamp: 65 })], {});
      const back = rows(tsv)[0].split('\t')[1];
      assert.ok(back.includes('<a href="https://www.youtube.com/watch?v=abc&t=65s">▶ Replay the moment</a>'));
    });

    it('floors fractional timestamps in the deep link', () => {
      const tsv  = buildAnkiTsv([bm({ videoId: 'abc', timestamp: 65.7 })], {});
      const back = rows(tsv)[0].split('\t')[1];
      assert.ok(back.includes('watch?v=abc&t=65s'));
    });

    it('shows the video title (from the videoTitles map) and M:SS time', () => {
      const tsv  = buildAnkiTsv([bm({ videoId: 'abc123', timestamp: 65 })], { abc123: 'Krebs Cycle Explained' });
      const back = rows(tsv)[0].split('\t')[1];
      assert.ok(back.includes('<b>Krebs Cycle Explained</b> — 1:05'));
    });

    it('formats timestamps past an hour as H:MM:SS', () => {
      const tsv  = buildAnkiTsv([bm({ timestamp: 3925 })], { abc123: 'Long Lecture' });
      const back = rows(tsv)[0].split('\t')[1];
      assert.ok(back.includes('— 1:05:25'), `got: ${back}`);
    });

    it('treats a missing timestamp as 0:00 instead of NaN', () => {
      const tsv = buildAnkiTsv([bm({ timestamp: undefined, description: '' })], { abc123: 'T' });
      assert.equal(rows(tsv)[0].split('\t')[0], 'Moment at 0:00 of T');
      assert.ok(!tsv.includes('NaN'));
    });

    it('prefers the bookmark videoTitle over the map, falls back to videoId', () => {
      const withOwn = buildAnkiTsv([bm({ videoTitle: 'Own Title' })], { abc123: 'Map Title' });
      assert.ok(rows(withOwn)[0].includes('<b>Own Title</b>'));
      const bare = buildAnkiTsv([bm()], {});
      assert.ok(rows(bare)[0].includes('<b>abc123</b>'));
    });

    it('appends the note after the replay link when present', () => {
      const tsv  = buildAnkiTsv([bm({ notes: 'remember this' })], {});
      const back = rows(tsv)[0].split('\t')[1];
      assert.ok(/Replay the moment<\/a><br>remember this$/.test(back));
    });
  });

  describe('tags', () => {
    const cases = [
      { name: 'spaces inside a tag become underscores', tags: ['a b'], expected: 'a_b' },
      { name: 'multiple tags are space-separated', tags: ['anatomy', 'high yield'], expected: 'anatomy high_yield' },
      { name: 'no tags yields an empty tags field', tags: [], expected: '' },
      { name: 'missing tags array yields an empty tags field', tags: undefined, expected: '' },
    ];

    for (const { name, tags, expected } of cases) {
      it(name, () => {
        const tsv = buildAnkiTsv([bm({ tags })], {});
        assert.equal(rows(tsv)[0].split('\t')[2], expected);
      });
    }
  });

  describe('Front fallback', () => {
    const cases = [
      { name: 'empty description', description: '' },
      { name: 'whitespace-only description', description: '   ' },
      { name: 'missing description', description: undefined },
    ];

    for (const { name, description } of cases) {
      it(`uses "Moment at M:SS of <title>" when ${name}`, () => {
        const tsv   = buildAnkiTsv([bm({ description, timestamp: 125 })], { abc123: 'Renal Physiology' });
        const front = rows(tsv)[0].split('\t')[0];
        assert.equal(front, 'Moment at 2:05 of Renal Physiology');
      });
    }
  });
});
