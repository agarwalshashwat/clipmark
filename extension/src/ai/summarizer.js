/**
 * Chrome's built-in Summarizer API (Chrome 138+), wrapped for ClipMark.
 *
 * ── Why a separate module from ai/local-ai.js ────────────────────────────────
 * local-ai.js is listed in manifest.json's `content_scripts`, so every byte of
 * it is injected into every YouTube page the user opens. The Summarizer is only
 * ever used by the side panel, and shipping it into the content script would
 * cost every page load for a feature that surface never calls.
 *
 * ── On-device only ───────────────────────────────────────────────────────────
 * The Summarizer runs against the model already on the machine. There is no
 * network call here, no API key, and no transcript ever leaves the device —
 * which is the whole reason this is the flagship feature rather than a
 * server-side summarizer we'd have to pay for and take responsibility for.
 *
 * ── Progressive enhancement ──────────────────────────────────────────────────
 * Every export degrades to a falsy/neutral value rather than throwing. The
 * capture → flashcard → review loop must work identically on a Chrome that has
 * never heard of this API, so a caller that forgets to check availability still
 * cannot break the panel.
 */

/**
 * Longest transcript we hand to the model.
 *
 * ponytail: naive head-truncation, ~12k chars (roughly a 25-minute lecture).
 * Gemini Nano's context window is small and the API rejects oversized input, so
 * something has to give. Upgrade path when it matters: chunk the transcript,
 * summarize each chunk, then summarize the summaries — worth doing only once
 * someone actually complains that long lectures lose their ending.
 */
export const MAX_TRANSCRIPT_CHARS = 12_000;

/** Shared across availability() and create() so the two can never disagree. */
const SUMMARIZER_OPTIONS = Object.freeze({
  type: 'key-points',
  format: 'plain-text',
  length: 'medium',
});

/**
 * Is the Summarizer usable right now?
 *
 * Mirrors the API's own vocabulary so callers can tell "this Chrome will never
 * do it" from "the model is still downloading", which need different UI.
 *
 * @returns {Promise<'available'|'downloadable'|'downloading'|'unavailable'>}
 */
export async function summarizerAvailability() {
  // typeof, not `'Summarizer' in self` — the latter throws in a context without
  // a `self`, and this runs during panel init where a throw is expensive.
  if (typeof Summarizer === 'undefined') return 'unavailable';
  try {
    const state = await Summarizer.availability(SUMMARIZER_OPTIONS);
    return state ?? 'unavailable';
  } catch {
    // An older Chrome may expose the global with a different signature.
    return 'unavailable';
  }
}

/**
 * Trim a transcript to something the model will accept.
 *
 * Exported for the unit test: the truncation is the part most likely to be
 * quietly wrong, and a transcript that is one character too long fails the
 * whole feature.
 *
 * @param {string} text
 * @param {number} [max]
 * @returns {{text: string, truncated: boolean}}
 */
export function trimTranscript(text, max = MAX_TRANSCRIPT_CHARS) {
  const input = typeof text === 'string' ? text.trim() : '';
  if (input.length <= max) return { text: input, truncated: false };
  // Cut on a word boundary so the model isn't handed a severed token.
  const head = input.slice(0, max);
  const lastSpace = head.lastIndexOf(' ');
  return { text: lastSpace > max * 0.8 ? head.slice(0, lastSpace) : head, truncated: true };
}

/**
 * Summarize a video transcript into key points.
 *
 * @param {string} transcript
 * @param {{videoTitle?: string, signal?: AbortSignal}} [opts]
 * @returns {Promise<{points: string[], truncated: boolean}>}
 */
export async function summarizeTranscript(transcript, opts = {}) {
  const { text, truncated } = trimTranscript(transcript);
  if (!text) return { points: [], truncated: false };

  const summarizer = await Summarizer.create({
    ...SUMMARIZER_OPTIONS,
    sharedContext:
      'A transcript of an educational YouTube video. The reader is a student ' +
      'revising, so favour concrete claims, definitions and steps over generalities.',
    ...(opts.signal ? { signal: opts.signal } : {}),
  });

  try {
    const raw = await summarizer.summarize(text, {
      context: opts.videoTitle ? `The video is titled "${opts.videoTitle}".` : undefined,
      ...(opts.signal ? { signal: opts.signal } : {}),
    });
    return { points: parseKeyPoints(raw), truncated };
  } finally {
    // Sessions hold model resources; leaking one per click would degrade the
    // whole browser, not just this panel.
    summarizer.destroy?.();
  }
}

/**
 * Split the model's key-points output into lines.
 *
 * `format: 'plain-text'` still comes back as a bullet list, and the bullet
 * character varies by model build — strip whatever leader it used rather than
 * rendering "* * Foo" at the user.
 *
 * @param {string} raw
 * @returns {string[]}
 */
export function parseKeyPoints(raw) {
  if (typeof raw !== 'string') return [];
  return raw
    .split('\n')
    .map((line) => line.replace(/^\s*(?:[-*•‣▪]|\d+[.)])\s*/, '').trim())
    .filter(Boolean);
}
