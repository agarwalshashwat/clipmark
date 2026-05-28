// local-ai.js — Chrome built-in LanguageModel (Gemini Nano) helpers
// Loaded before popup.js and side-panel.js via <script> tag in HTML pages.
// All functions are globals; no module syntax (no build step).

// Internal: format seconds → MM:SS
function _fmtTs(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const _LM_LANGUAGE_OPTIONS = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

function _localAiDebugEnabled() {
  try {
    if (globalThis.CLIPMARK_DEV_LOG === true) return true;
    const manifest = chrome?.runtime?.getManifest?.();
    return !!manifest && !manifest.update_url;
  } catch {
    return false;
  }
}

// Parse JSON from model output — handles both full JSON and partial continuations.
function _parseJson(raw, opener, closer) {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  // Try direct parse first (model returned full JSON)
  try { return JSON.parse(cleaned); } catch { }
  // Fall back: model continued from opener char, reconstruct
  const idx = cleaned.lastIndexOf(closer);
  const body = idx !== -1 ? cleaned.slice(0, idx) : cleaned;
  try { return JSON.parse(opener + body + closer); } catch { return null; }
}

/**
 * Check whether Chrome's built-in LanguageModel is available.
 * @returns {Promise<"available"|"downloadable"|"downloading"|"unavailable">}
 */
async function localAiAvailability() {
  if (typeof LanguageModel === 'undefined') return 'unavailable';

  try {
    // Always send explicit language to satisfy newer safety/quality requirements.
    const fn = LanguageModel.availability.bind(LanguageModel);
    return await fn(_LM_LANGUAGE_OPTIONS);
  } catch { return 'unavailable'; }
}

async function _promptInEnglish(session, promptText) {
  return await session.prompt(promptText);
}

/**
 * Suggest 1-3 tags for a bookmark using on-device Gemini Nano.
 * @param {string} description
 * @param {string} [transcript]
 * @returns {Promise<string[]>}
 */
async function localSuggestTags(description, transcript) {
  const session = await LanguageModel.create({
    ..._LM_LANGUAGE_OPTIONS,
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
    const raw = await _promptInEnglish(session,
      `${ctx}\n\nSuggest tags for this bookmark. Reply with only a JSON array:\n[`
    );
    const tags = _parseJson(raw, '[', ']');
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
    ..._LM_LANGUAGE_OPTIONS,
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
    const raw = await _promptInEnglish(session, prompt);
    if (_localAiDebugEnabled()) console.log('[local-ai] raw summarize output:', raw);
    const result = _parseJson(raw, '{', '}');
    if (_localAiDebugEnabled()) console.log('[local-ai] parsed result:', result);
    return {
      summary:     typeof result?.summary === 'string'     ? result.summary     : '',
      topics:      Array.isArray(result?.topics)           ? result.topics      : [],
      actionItems: Array.isArray(result?.actionItems)      ? result.actionItems : [],
    };
  } finally {
    session.destroy();
  }
}

/**
 * Summarize a single transcript snippet into a concise bookmark title.
 * @param {string} snippet
 * @returns {Promise<string>}
 */
async function localSummarizeSnippet(snippet) {
  if (!snippet) return '';
  const availability = await localAiAvailability();
  if (availability !== 'available') return snippet;

  const session = await LanguageModel.create({
    ..._LM_LANGUAGE_OPTIONS,
    systemPrompt:
      'You are a technical editor for a YouTube bookmarking tool. ' +
      'Convert raw, messy transcript text into a concise, professional title (3-7 words). ' +
      'Focus on the core concept, action, or architectural detail being discussed. ' +
      'Respond ONLY with the title text. No quotes, no markdown, no explanation.',
  });
  try {
    const raw = await _promptInEnglish(session, `Snippet: "${snippet}"\nShort Title:`);
    return raw.replace(/["']/g, '').trim() || snippet;
  } catch (err) {
    if (_localAiDebugEnabled()) console.error('[local-ai] snippet summary failed:', err);
    return snippet;
  } finally {
    session.destroy();
  }
}

/**
 * Generate a social post based on bookmarks using on-device Gemini Nano.
 * @param {Array<{timestamp: number, description: string}>} bookmarks
 * @param {string} videoTitle
 * @param {string} shareUrl
 * @param {"twitter"|"linkedin"|"threads"} platform
 * @returns {Promise<string>}
 */
async function localGeneratePost(bookmarks, videoTitle, shareUrl, platform) {
  const charLimits = { twitter: 260, linkedin: 1500, threads: 480 };
  const platformGuide = {
    twitter:  'Punchy, max 2 lines, 1 hashtag, no emojis.',
    linkedin: 'Professional tone, use short paragraphs with line breaks, 3-5 bullet key takeaways, end with CTA.',
    threads:  'Casual, relatable hook, 1 emoji max.',
  };

  const session = await LanguageModel.create({
    ..._LM_LANGUAGE_OPTIONS,
    systemPrompt: `You are an assistant that writes ${platform} posts based on video notes. ` +
                  `Style: ${platformGuide[platform]}. Limit: ${charLimits[platform]} characters. ` +
                  `Include this link: ${shareUrl}`,
  });

  try {
    const lines = bookmarks.slice(0, 8).map(b => `- ${b.description}`).join('\n');
    const prompt = `Video: "${videoTitle}"\nNotes:\n${lines}\n\nWrite one ${platform} post. Output ONLY the post text.`;
    const res = await _promptInEnglish(session, prompt);
    return res.trim();
  } finally {
    session.destroy();
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.localAiAvailability = localAiAvailability;
  globalThis.localSuggestTags = localSuggestTags;
  globalThis.localSummarizeBookmarks = localSummarizeBookmarks;
  globalThis.localSummarizeSnippet = localSummarizeSnippet;
  globalThis.localGeneratePost = localGeneratePost;
}

// Ensure they are available as exports for Vite/ESM
export {
  localAiAvailability,
  localSuggestTags,
  localSummarizeBookmarks,
  localSummarizeSnippet,
  localGeneratePost
};

// Only export if we are in a CommonJS environment
if (typeof exports !== 'undefined' || typeof module !== 'undefined') {
  try {
    module.exports = { localAiAvailability, localSuggestTags, localSummarizeBookmarks, localSummarizeSnippet };
  } catch (e) {}
}
