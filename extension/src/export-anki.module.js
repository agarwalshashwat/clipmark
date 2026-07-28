/**
 * Anki export — pure TSV builder (no DOM, no Chrome APIs).
 *
 * Produces a tab-separated file Anki imports directly (File → Import):
 *   #separator:tab / #html:true / #tags column:3 header directives, then one
 *   row per bookmark with fields Front, Back, Tags. Back is HTML and carries a
 *   deep link back to the exact video moment via ytWatchUrl.
 *
 * Kept as a standalone module so unit tests can import it without pulling in
 * the DOM-coupled dashboard page script (same pattern as constants.module.js).
 */

import { ytWatchUrl } from './constants.module.js';

// M:SS (minutes not zero-padded) — matches the "Moment at M:SS" fallback copy.
// Long lecture videos overflow into H:MM:SS.
function formatMomentTime(seconds) {
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = s.toString().padStart(2, '0');
  return h > 0 ? `${h}:${m.toString().padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// User-supplied text is rendered as HTML by Anki (#html:true), so neutralize it.
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// TSV field safety: tabs would split fields, newlines would split rows.
function escapeField(str) {
  return String(str).replace(/\t/g, ' ').replace(/\r\n|\r|\n/g, '<br>');
}

/**
 * @param {Array<object>} bookmarks   - bookmark objects ({videoId, timestamp, description, tags, notes, videoTitle, ...})
 * @param {Record<string,string>} videoTitles - videoId → title map (storage `videoTitles`)
 * @returns {string} Anki-importable TSV (Front, Back, Tags)
 */
export function buildAnkiTsv(bookmarks, videoTitles = {}) {
  const lines = ['#separator:tab', '#html:true', '#tags column:3'];

  for (const b of bookmarks) {
    const title = b.videoTitle || videoTitles[b.videoId] || b.videoId;
    const secs  = Number(b.timestamp) || 0;
    const time  = formatMomentTime(secs);
    const url   = ytWatchUrl(b.videoId, secs);
    const desc  = (b.description || '').trim();

    const front = desc
      ? escapeHtml(desc)
      : `Moment at ${time} of ${escapeHtml(title)}`;

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
