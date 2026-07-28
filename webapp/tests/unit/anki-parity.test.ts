/**
 * Anki export parity — webapp twin vs. extension original.
 *
 * `webapp/app/dashboard/_utils/anki.ts` deliberately duplicates
 * `extension/src/export-anki.module.js` (the extension module sits outside the
 * Next.js project root, so importing it into the app build would need the
 * experimental externalDir flag). This test removes the usual cost of that
 * duplication: it imports BOTH implementations and asserts byte-identical
 * output, so the twins cannot silently drift.
 *
 * Run: npm --prefix webapp run test:unit
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAnkiTsv as webappBuild, buildAnkiTsvFromCollections } from '../../app/dashboard/_utils/anki.js';
// The shipped extension module (plain ESM .js) — the source of truth.
import { buildAnkiTsv as extensionBuild } from '../../../extension/src/export-anki.module.js';

const CASES: { name: string; bookmarks: any[]; titles?: Record<string, string> }[] = [
  {
    name: 'plain bookmark with description + tags',
    bookmarks: [{ id: 1, videoId: 'abc12345678', timestamp: 65, description: 'Cardiac output', tags: ['important'], createdAt: '2026-01-01T00:00:00.000Z' }],
    titles: { abc12345678: 'Physiology 101' },
  },
  {
    name: 'no description → "Moment at" fallback front',
    bookmarks: [{ id: 2, videoId: 'vid', timestamp: 12, description: '', tags: [], createdAt: '2026-01-01T00:00:00.000Z' }],
    titles: { vid: 'Lecture' },
  },
  {
    name: 'timestamp 0 → URL omits &t=',
    bookmarks: [{ id: 3, videoId: 'zero', timestamp: 0, description: 'Intro', tags: [] }],
  },
  {
    name: 'hour-long video → H:MM:SS',
    bookmarks: [{ id: 4, videoId: 'long', timestamp: 3725, description: 'Deep dive', tags: [] }],
    titles: { long: '3-hour podcast' },
  },
  {
    name: 'tabs, newlines and HTML in user text',
    bookmarks: [{ id: 5, videoId: 'esc', timestamp: 5, description: 'a\tb\nc <b>bold</b> & "quoted"', tags: ['multi word tag'], notes: 'note\twith\ttabs' }],
  },
  {
    name: 'missing/garbage timestamp → 0',
    bookmarks: [{ id: 6, videoId: 'nan', description: 'No ts', tags: [] }],
  },
  {
    name: 'videoTitle on the bookmark wins over the titles map',
    bookmarks: [{ id: 7, videoId: 'v7', timestamp: 30, description: 'x', tags: [], videoTitle: 'From bookmark' }],
    titles: { v7: 'From map' },
  },
  {
    name: 'title falls back to videoId when nothing is known',
    bookmarks: [{ id: 8, videoId: 'orphan', timestamp: 30, description: '', tags: [] }],
  },
  { name: 'empty input → directives only', bookmarks: [] },
];

describe('Anki export: webapp twin matches the extension implementation', () => {
  for (const { name, bookmarks, titles } of CASES) {
    it(name, () => {
      assert.equal(
        webappBuild(bookmarks, titles ?? {}),
        extensionBuild(bookmarks, titles ?? {}),
        `webapp/extension Anki output diverged for: ${name}`,
      );
    });
  }

  it('produces the Anki header directives', () => {
    const out = webappBuild(CASES[0].bookmarks, CASES[0].titles);
    assert.match(out, /^#separator:tab\n#html:true\n#tags column:3\n/);
  });

  it('emits exactly 3 tab-separated fields per bookmark row', () => {
    const rows = webappBuild(CASES[0].bookmarks, CASES[0].titles).split('\n').slice(3);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].split('\t').length, 3);
  });
});

describe('buildAnkiTsvFromCollections', () => {
  it('flattens per-video collections and derives the title map', () => {
    const out = buildAnkiTsvFromCollections([
      { video_id: 'v1', video_title: 'Video One', bookmarks: [{ videoId: 'v1', timestamp: 10, description: 'first', tags: [] }] },
      { video_id: 'v2', video_title: 'Video Two', bookmarks: [{ videoId: 'v2', timestamp: 20, description: 'second', tags: [] }] },
    ]);
    const rows = out.split('\n').slice(3);
    assert.equal(rows.length, 2);
    assert.match(out, /Video One/);
    assert.match(out, /Video Two/);
    assert.match(out, /watch\?v=v1&t=10s/);
    assert.match(out, /watch\?v=v2&t=20s/);
  });

  it('tolerates null bookmarks and falls back to the group videoId', () => {
    const out = buildAnkiTsvFromCollections([
      { video_id: 'g1', video_title: null, bookmarks: null },
      { video_id: 'g2', video_title: 'T', bookmarks: [{ videoId: '', timestamp: 5, description: 'x', tags: [] }] },
    ]);
    const rows = out.split('\n').slice(3);
    assert.equal(rows.length, 1);
    assert.match(out, /watch\?v=g2&t=5s/);
  });
});
