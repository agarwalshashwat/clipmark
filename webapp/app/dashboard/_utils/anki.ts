/**
 * Anki export — pure TSV builder for the webapp dashboard.
 *
 * ⚠️ TWIN of `extension/src/export-anki.module.js` — keep the two in sync.
 * They must produce byte-identical output for the same input; that invariant is
 * enforced by `webapp/tests/unit/anki-parity.test.ts`, which imports BOTH and
 * diffs them. (Direct import of the extension module is avoided here because it
 * lives outside the Next.js project root, which would require the experimental
 * externalDir flag for the whole build. Same twin pattern as
 * constants.js/constants.module.js and recall.js/recall.module.js.)
 */

/** Minimal bookmark shape the builder needs. */
export interface AnkiBookmark {
  videoId: string;
  timestamp: number;
  description?: string | null;
  tags?: string[] | null;
  notes?: string | null;
  videoTitle?: string | null;
}

// Mirrors extension/src/constants.module.js ytWatchUrl — note it OMITS &t= when
// the timestamp is 0/falsy, which the parity test relies on.
function ytWatchUrl(videoId: string, t = 0): string {
  return `https://www.youtube.com/watch?v=${videoId}${t ? `&t=${Math.floor(t)}s` : ''}`;
}

// M:SS (minutes not zero-padded); long lecture videos overflow into H:MM:SS.
function formatMomentTime(seconds: number): string {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// User-supplied text is rendered as HTML by Anki (#html:true), so neutralize it.
function escapeHtml(str: unknown): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// TSV field safety: tabs would split fields, newlines would split rows.
function escapeField(str: unknown): string {
  return String(str).replace(/\t/g, ' ').replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * Build an Anki-importable TSV (File → Import) with Front / Back / Tags,
 * where Back deep-links back to the exact video moment.
 */
export function buildAnkiTsv(
  bookmarks: AnkiBookmark[],
  videoTitles: Record<string, string> = {},
): string {
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];

  for (const b of bookmarks) {
    const title = b.videoTitle || videoTitles[b.videoId] || b.videoId;
    const secs = Number(b.timestamp) || 0;
    const time = formatMomentTime(secs);
    const url = ytWatchUrl(b.videoId, secs);
    const desc = (b.description || '').trim();

    const front = desc ? escapeHtml(desc) : `Moment at ${time} of ${escapeHtml(title)}`;

    const backParts = [
      `<b>${escapeHtml(title)}</b> — ${time}`,
      `<a href="${url}">▶ Replay the moment</a>`,
    ];
    if (b.notes && b.notes.trim()) backParts.push(escapeHtml(b.notes));
    const back = backParts.join('<br>');

    const tags = (b.tags || []).map(t => String(t).replace(/\s+/g, '_')).join(' ');

    lines.push([front, back, tags].map(escapeField).join('\t'));
  }

  return lines.join('\n');
}

/**
 * Webapp convenience: the dashboard holds cloud-synced bookmarks grouped per
 * video, so flatten them (and derive the title map) before building the TSV.
 */
export function buildAnkiTsvFromCollections(
  collections: { video_id: string; video_title: string | null; bookmarks: AnkiBookmark[] | null }[],
): string {
  const bookmarks: AnkiBookmark[] = [];
  const titles: Record<string, string> = {};

  for (const c of collections) {
    if (c.video_title) titles[c.video_id] = c.video_title;
    for (const b of c.bookmarks ?? []) {
      // Rows carry their own videoId, but fall back to the group's for safety.
      bookmarks.push({ ...b, videoId: b.videoId || c.video_id });
    }
  }

  return buildAnkiTsv(bookmarks, titles);
}
