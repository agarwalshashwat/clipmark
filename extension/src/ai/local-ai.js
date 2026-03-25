// local-ai.js — Chrome built-in LanguageModel (Gemini Nano) helpers
// Loaded before popup.js and side-panel.js via <script> tag in HTML pages.
// All functions are globals; no module syntax (no build step).

// Internal: format seconds → MM:SS
function _fmtTs(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Internal: reconstruct and parse JSON that the model continues from an opener char.
// e.g. prompt ends with "[", model outputs `"tag1","tag2"]` → reconstruct `["tag1","tag2"]`
function _closeJson(raw, opener, closer) {
  const idx = raw.lastIndexOf(closer);
  const body = idx !== -1 ? raw.slice(0, idx) : raw;
  try { return JSON.parse(opener + body + closer); } catch { return null; }
}

/**
 * Check whether Chrome's built-in LanguageModel is available.
 * @returns {Promise<"available"|"downloadable"|"downloading"|"unavailable">}
 */
async function localAiAvailability() {
  if (typeof LanguageModel === 'undefined') return 'unavailable';
  try { return await LanguageModel.availability({ expectedOutputLanguages: ['en'] }); }
  catch { return 'unavailable'; }
}

/**
 * Suggest 1-3 tags for a bookmark using on-device Gemini Nano.
 * @param {string} description
 * @param {string} [transcript]
 * @returns {Promise<string[]>}
 */
async function localSuggestTags(description, transcript) {
  const session = await LanguageModel.create({
    expectedOutputLanguages: ['en'],
    systemPrompt:
      'You are a tagging assistant for YouTube video bookmarks. ' +
      'Respond ONLY with a raw JSON array of 1-3 lowercase single-word tags. ' +
      'Prefer named tags when relevant: important, review, note, question, todo, key. ' +
      'No explanation, no markdown fences — only the array.',
  });
  try {
    const ctx = transcript
      ? `Description: "${description}"\nTranscript context: "${transcript.slice(0, 300)}"`
      : `Description: "${description}"`;
    const raw = await session.prompt(
      `${ctx}\n\nSuggest tags for this bookmark. Reply with only a JSON array:\n[`
    );
    const tags = _closeJson(raw, '[', ']');
    if (!Array.isArray(tags)) return [];
    return tags
      .filter(t => typeof t === 'string' && /^\w+$/.test(t))
      .map(t => t.toLowerCase())
      .slice(0, 3);
  } finally {
    session.destroy();
  }
}

/**
 * Summarize a list of bookmarks using on-device Gemini Nano.
 * @param {Array<{timestamp: number, description: string, tags?: string[]}>} bookmarks
 * @param {string} [videoTitle]
 * @returns {Promise<{summary: string, topics: string[], actionItems: string[]}>}
 */
async function localSummarizeBookmarks(bookmarks, videoTitle) {
  const session = await LanguageModel.create({
    expectedOutputLanguages: ['en'],
    systemPrompt:
      'You are an AI that summarizes YouTube video bookmark lists. ' +
      'Respond ONLY with a single JSON object matching this exact shape: ' +
      '{"summary":"string","topics":["string"],"actionItems":["string"]}. ' +
      'No markdown fences, no extra keys, no explanation.',
  });
  try {
    const list = bookmarks
      .map((b, i) => `${i + 1}. [${_fmtTs(b.timestamp)}] ${b.description}`)
      .join('\n');
    const prompt =
      `Video: "${videoTitle || 'Unknown'}"\n` +
      `Bookmarks:\n${list}\n\n` +
      `Summarize these bookmarks. Return JSON matching {"summary":"...","topics":[...],"actionItems":[...]}:\n{`;
    const raw = await session.prompt(prompt);
    const result = _closeJson(raw, '{', '}');
    return {
      summary:     typeof result?.summary === 'string'     ? result.summary     : '',
      topics:      Array.isArray(result?.topics)           ? result.topics      : [],
      actionItems: Array.isArray(result?.actionItems)      ? result.actionItems : [],
    };
  } finally {
    session.destroy();
  }
}
