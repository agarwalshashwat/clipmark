import { API_BASE } from '../config.js';
import { TAG_COLORS, parseTags, stringToColor, getTagColor, ytWatchUrl, ytThumbnailUrl, APP_EXPORT_PREFIX } from '../constants.js';
import { localAiAvailability, localSuggestTags, localSummarizeBookmarks } from '../ai/local-ai.js';

async function checkPro() {
  const { bmUser } = await syncGet({ bmUser: null });
  return bmUser?.isPro === true;
}

// Returns a fresh access token, auto-refreshing via /api/refresh if expired.
async function getValidToken() {
  const { bmUser } = await new Promise(resolve =>
    chrome.storage.sync.get({ bmUser: null }, resolve)
  );
  if (!bmUser?.accessToken) {
    debugLog('Auth', 'No access token in storage');
    return null;
  }
  try {
    const payload = JSON.parse(atob(bmUser.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp * 1000 > Date.now() + 60_000) {
      debugLog('Auth', 'Using existing access token');
      return bmUser.accessToken;
    }
  } catch { /* fall through to refresh */ }
  if (!bmUser.refreshToken) {
    debugLog('Auth', 'Token refresh unavailable: missing refresh token');
    return null;
  }
  debugLog('Auth', 'Refreshing access token');
  try {
    const res = await fetch(`${API_BASE}/api/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: bmUser.refreshToken }),
    });
    if (!res.ok) {
      debugLog('Auth', 'Token refresh failed', { status: res.status });
      return null;
    }
    const { access_token, refresh_token } = await res.json();
    await new Promise(resolve =>
      chrome.storage.sync.set({ bmUser: { ...bmUser, accessToken: access_token, refreshToken: refresh_token } }, resolve)
    );
    debugLog('Auth', 'Token refresh succeeded');
    return access_token;
  } catch (error) {
    debugError('Token refresh request failed', error);
    return null;
  }
}

// TAG_COLORS, parseTags, stringToColor, getTagColor are defined in constants.js

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function debugLog(category, message, data = null) {
  console.log(`[SidePanel][${category}][${new Date().toISOString()}] ${message}`, data ?? '');
}

function toErrorMessage(error) {
  if (!error) return 'Unknown error';
  return error instanceof Error ? error.message : String(error);
}

function debugError(operation, error, context = {}) {
  debugLog('Error', operation, {
    ...context,
    error: toErrorMessage(error),
  });
}

// ─── Storage helpers ────────────────────────────────────────────────────────
function bmKey(videoId) { return `bm_${videoId}`; }

function syncGet(defaults) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(defaults, r => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    });
  });
}

function syncSet(data) {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.set(data, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    debugLog('Tabs', 'No active tab found');
  }
  return tab;
}

function extractVideoId(url) {
  try {
    return new URLSearchParams(new URL(url).search).get('v');
  } catch {
    return null;
  }
}

async function getVideoBookmarksLocal(videoId) {
  const r = await syncGet({ [bmKey(videoId)]: [] });
  return r[bmKey(videoId)];
}

async function getVideoBookmarks(videoId) {
  debugLog('Storage', 'Loading bookmarks for video', { videoId });
  await pullFromCloud(videoId);
  return getVideoBookmarksLocal(videoId);
}

async function saveVideoBookmarks(videoId, bookmarks) {
  debugLog('Storage', 'Saving local bookmarks', { videoId, count: bookmarks.length });
  await syncSet({ [bmKey(videoId)]: bookmarks });
  // Cloud sync: push to backend if signed in
  try {
    const token = await getValidToken();
    if (!token) {
      debugLog('CloudSync', 'Skipping push: no token', { videoId });
      return;
    }
    const res = await fetch(`${API_BASE}/api/bookmarks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ videoId, bookmarks }),
    });
    debugLog('CloudSync', 'Push completed', {
      videoId,
      status: res.status,
      bookmarkCount: bookmarks.length,
    });
    if (res.status === 403) {
      // Server says not Pro — sync local flag so UI reflects reality
      const { bmUser } = await syncGet({ bmUser: null });
      if (bmUser) await syncSet({ bmUser: { ...bmUser, isPro: false } });
    }
  } catch (error) {
    // Best-effort cloud sync
    debugError('Cloud bookmark push failed', error, { videoId, bookmarkCount: bookmarks.length });
  }
}

async function pullFromCloud(videoId) {
  try {
    const token = await getValidToken();
    if (!token) {
      debugLog('CloudSync', 'Skipping pull: no token', { videoId });
      return;
    }
    debugLog('CloudSync', 'Pulling cloud bookmarks', { videoId });
    const res = await fetch(`${API_BASE}/api/bookmarks?videoId=${encodeURIComponent(videoId)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    debugLog('CloudSync', 'Pull response', { videoId, status: res.status });
    if (res.status === 403) {
      // Server says not Pro — sync local flag so UI reflects reality
      const { bmUser } = await syncGet({ bmUser: null });
      if (bmUser) await syncSet({ bmUser: { ...bmUser, isPro: false } });
      return;
    }
    if (!res.ok) return;
    const { bookmarks: cloudBms } = await res.json();
    if (!cloudBms?.length) return;
    const localBms = await getVideoBookmarksLocal(videoId);
    const localIds = new Set(localBms.map(b => b.id));
    const newFromCloud = cloudBms.filter(b => !localIds.has(b.id));
    if (!newFromCloud.length) {
      debugLog('CloudSync', 'Pull completed with no new bookmarks', { videoId, cloudCount: cloudBms.length });
      return;
    }
    const merged = [...localBms, ...newFromCloud];
    debugLog('CloudSync', 'Merging cloud bookmarks into local', {
      videoId,
      localCount: localBms.length,
      cloudCount: cloudBms.length,
      mergedCount: merged.length,
      addedCount: newFromCloud.length,
    });
    await saveVideoBookmarks(videoId, merged);
  } catch (error) {
    // Pull is best-effort — don't block the user
    debugError('Cloud bookmark pull failed', error, { videoId });
  }
}

async function getVideoTitles() {
  const r = await syncGet({ videoTitles: {} });
  return r.videoTitles;
}

// ─── Messaging ───────────────────────────────────────────────────────────────
function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate'));
      } else if (response && response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

async function waitForContentScript(tabId, maxRetries = MAX_RECONNECT_ATTEMPTS, delay = RECONNECT_DELAY) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await sendMessageToTab(tabId, { action: 'ping' });
      if (r && r.status === 'ready') {
        if (i > 0) {
          debugLog('Messaging', 'Content script became ready after retry', { tabId, attempts: i + 1 });
        }
        return true;
      }
    } catch {
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delay));
    }
  }
  debugLog('Messaging', 'Content script unavailable after retries', { tabId, maxRetries });
  throw new Error('Content script not available. Please refresh the YouTube page.');
}

// ─── UI Helpers ────────────────────────────────────────────────────────────
function showError(message, duration = 3000) {
  const el = document.getElementById('error-message');
  el.textContent = message;
  el.style.display = 'block';
  el.classList.add('show');
  el.classList.remove('hide');
  setTimeout(() => {
    el.classList.add('hide');
    el.classList.remove('show');
    setTimeout(() => { el.style.display = 'none'; }, 300);
  }, duration);
}

function showStatus(message, duration = 1500) {
  const el = document.getElementById('status-message');
  el.textContent = message;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), duration);
}

// ─── Bookmark Operations ──────────────────────────────────────────────────────
async function saveBookmark(bookmark) {
  try {
    const tab = await getCurrentTab();
    if (!tab.url.includes('youtube.com/watch')) {
      throw new Error('Please navigate to a YouTube video first!');
    }

    debugLog('Bookmarks', 'Save requested', {
      videoId: bookmark.videoId,
      timestamp: Math.floor(bookmark.timestamp),
      hasDescription: Boolean(bookmark.description?.trim()),
    });

    await waitForContentScript(tab.id);

    // Parallel reads — dupe check list + video titles in one round-trip
    const [bookmarks, videoTitles] = await Promise.all([
      getVideoBookmarks(bookmark.videoId),
      getVideoTitles(),
    ]);

    if (bookmarks.some(b => Math.floor(b.timestamp) === Math.floor(bookmark.timestamp))) {
      debugLog('Bookmarks', 'Duplicate bookmark prevented', {
        videoId: bookmark.videoId,
        timestamp: Math.floor(bookmark.timestamp),
      });
      showError('Bookmark already exists.');
      return;
    }

    // Auto-fill description using cached transcript only (no network wait)
    let description = bookmark.description.trim();
    if (!description) {
      try {
        const txRes = await sendMessageToTab(tab.id, {
          action: 'getTranscriptCachedAtTimestamp',
          timestamp: bookmark.timestamp,
        });
        if (txRes?.text) description = txRes.text;
      } catch {}
      if (!description) {
        try {
          const chRes = await sendMessageToTab(tab.id, { action: 'getCurrentChapter' });
          if (chRes?.chapter) description = chRes.chapter;
        } catch {}
      }
      if (!description) description = `Bookmark at ${formatTimestamp(bookmark.timestamp)}`;
    }

    const tags = parseTags(description);
    const color = getTagColor(tags);

    bookmarks.push({
      ...bookmark,
      description,
      tags,
      color,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      videoTitle: videoTitles[bookmark.videoId] || null,
      reviewSchedule: [1, 3, 7],
      lastReviewed: null,
    });

    await saveVideoBookmarks(bookmark.videoId, bookmarks);
    if (bookmark.duration) {
      const vd = (await syncGet({ videoDurations: {} })).videoDurations;
      vd[bookmark.videoId] = bookmark.duration;
      await syncSet({ videoDurations: vd });
    }
    debugLog('Bookmarks', 'Saved bookmark', {
      videoId: bookmark.videoId,
      timestamp: Math.floor(bookmark.timestamp),
      tagCount: tags.length,
      usedFallbackDescription: !bookmark.description?.trim(),
    });

    // Instant feedback — UI refresh runs in background
    sendMessageToTab(tab.id, { action: 'showSaveFlash' }).catch(() => {});
    document.getElementById('description').value = '';
    document.getElementById('tag-suggestions').style.display = 'none';
    showStatus('Bookmark saved ✓');

    loadBookmarks();
    sendMessageToTab(tab.id, { action: 'bookmarkUpdated' }).catch(() => {});
  } catch (error) {
    debugError('Failed to save bookmark', error, {
      videoId: bookmark.videoId,
      timestamp: Math.floor(bookmark.timestamp || 0),
    });
    showError('Failed to save bookmark: ' + error.message);
  }
}

async function deleteBookmark(videoId, bookmarkId) {
  try {
    debugLog('Bookmarks', 'Delete requested', { videoId, bookmarkId: parseInt(bookmarkId) });
    const tab = await getCurrentTab();
    await waitForContentScript(tab.id);

    const bookmarks = await getVideoBookmarks(videoId);
    await saveVideoBookmarks(videoId, bookmarks.filter(b => b.id !== parseInt(bookmarkId)));

    await loadBookmarks();
    try { await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' }); } catch {}
  } catch (error) {
    debugError('Failed to delete bookmark', error, { videoId, bookmarkId: parseInt(bookmarkId) });
    showError('Failed to delete bookmark: ' + error.message);
  }
}

async function updateBookmarkDescription(videoId, bookmarkId, newDescription) {
  try {
    debugLog('Bookmarks', 'Update description requested', {
      videoId,
      bookmarkId: parseInt(bookmarkId),
      newDescriptionLength: newDescription?.length || 0,
    });
    showStatus('Saving…');
    const bookmarks = await getVideoBookmarks(videoId);
    const updated = bookmarks.map(b => {
      if (b.id !== parseInt(bookmarkId)) return b;
      const tags = parseTags(newDescription);
      const color = getTagColor(tags);
      return { ...b, description: newDescription, tags, color };
    });
    await saveVideoBookmarks(videoId, updated);
    await loadBookmarks();
    showStatus('Saved ✓');
    try {
      const tab = await getCurrentTab();
      await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' });
    } catch {}
  } catch (error) {
    debugError('Failed to update bookmark description', error, {
      videoId,
      bookmarkId: parseInt(bookmarkId),
      newDescriptionLength: newDescription?.length || 0,
    });
    showError('Failed to update bookmark: ' + error.message);
  }
}

// ─── Share Bookmarks ──────────────────────────────────────────────────────────
async function shareBookmarks() {
  const btn = document.getElementById('share-btn');
  try {
    const tab = await getCurrentTab();
    if (!tab.url.includes('youtube.com/watch')) {
      throw new Error('Please navigate to a YouTube video first!');
    }

    const videoId = extractVideoId(tab.url);
    if (!videoId) throw new Error('Could not find video ID');

    const bookmarks = await getVideoBookmarks(videoId);
    if (bookmarks.length === 0) {
      throw new Error('Add some bookmarks before sharing');
    }
    debugLog('Share', 'Share requested', { videoId, bookmarkCount: bookmarks.length });

    const videoTitles = await getVideoTitles();

    btn.textContent = 'Sharing…';
    btn.disabled = true;

    const { bmUser } = await syncGet({ bmUser: null });
    const response = await fetch(`${API_BASE}/api/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        videoId,
        videoTitle: videoTitles[videoId] || '',
        bookmarks,
        userId: bmUser?.userId || null,
      }),
    });

    if (response.status === 403) {
      const err = await response.json().catch(() => ({}));
      if (err.error === 'free_limit_reached') {
        debugLog('Share', 'Share blocked by free limit', { limit: err.limit });
        showError(`You've used all ${err.limit} free shares. ✦ Upgrade to Pro for unlimited sharing.`, 5000);
        chrome.tabs.create({ url: `${API_BASE}/upgrade` });
        btn.textContent = '↗ Share';
        btn.disabled = false;
        return null;
      }
    }

    if (!response.ok) throw new Error('Server error');

    const { shareId } = await response.json();
    const shareUrl = `${API_BASE}/v/${shareId}`;

    await navigator.clipboard.writeText(shareUrl);

    btn.textContent = '✓ Copied!';
    debugLog('Share', 'Share link created and copied', { videoId, shareId });
    setTimeout(() => {
      btn.textContent = '↗ Share';
      btn.disabled = false;
    }, 2500);

    return shareUrl;
  } catch (error) {
    debugError('Share failed', error);
    showError(error.message);
    btn.textContent = '↗ Share';
    btn.disabled = false;
    return null;
  }
}

// ─── Summarize Bookmarks ──────────────────────────────────────────────────────
async function summarizeBookmarks() {
  const btn = document.getElementById('summarize-btn');
  const panel = document.getElementById('summary-panel');
  const content = document.getElementById('summary-content');

  if (panel.style.display !== 'none') {
    debugLog('AI', 'Summary panel closed');
    panel.style.display = 'none';
    return;
  }

  try {
    const tab = await getCurrentTab();
    if (!tab.url.includes('youtube.com/watch')) {
      throw new Error('Please navigate to a YouTube video first!');
    }

    const videoId = extractVideoId(tab.url);
    if (!videoId) throw new Error('Could not find video ID');

    const bookmarks = await getVideoBookmarks(videoId);
    if (bookmarks.length === 0) {
      throw new Error('Add some bookmarks first');
    }

    const videoTitles = await getVideoTitles();
    const videoTitle = videoTitles[videoId] || '';

    const availability = await localAiAvailability();
    const { bmUser } = await new Promise(resolve => chrome.storage.sync.get({ bmUser: null }, resolve));
    const isPro = bmUser?.isPro === true;
    debugLog('AI', 'Summary requested', {
      videoId,
      bookmarkCount: bookmarks.length,
      availability,
      isPro,
    });
    let result = null;

    if (availability === 'available') {
      // Local AI — works for everyone, no cost
      debugLog('AI', 'Using local summary path', { videoId });
      btn.textContent = '…';
      btn.disabled = true;
      try {
        result = await localSummarizeBookmarks(bookmarks, videoTitle);
        debugLog('AI', 'Local summary succeeded', {
          hasSummary: Boolean(result?.summary),
          topicCount: Array.isArray(result?.topics) ? result.topics.length : 0,
          actionItemCount: Array.isArray(result?.actionItems) ? result.actionItems.length : 0,
        });
      } catch (error) {
        debugError('Local summary failed, falling back to cloud', error, { videoId });
      }

    } else if (availability === 'downloading') {
      debugLog('AI', 'Summary deferred: local model downloading', { isPro });
      // Model is still downloading — show informational notice
      const hint = isPro
        ? 'Cloud AI will be used automatically once the download completes.'
        : 'Upgrade to Pro to use cloud AI while Gemini Nano downloads.';
      content.innerHTML = `
        <div class="local-ai-notice">
          <p>Gemini Nano is downloading to your device. Try again in a few minutes.</p>
          <p class="local-ai-notice-hint">${hint}</p>
        </div>`;
      panel.style.display = 'block';
      return;

    } else {
      debugLog('AI', 'Local AI unavailable', { availability, isPro });
      // Local AI unavailable — soft paywall for free users, cloud for Pro
      if (!isPro) {
        content.innerHTML = `
          <div class="soft-paywall">
            <div class="soft-paywall-blur">
              <p>Your bookmarks summarized into key topics, decisions, and action items — powered by AI.</p>
              <ul><li>Introduction to the topic</li><li>Key concepts covered</li><li>Action items to follow up</li></ul>
            </div>
            <div class="soft-paywall-cta">
              <span class="soft-paywall-icon">✦</span>
              <strong>Unlock AI Summary</strong>
              <p>Get instant AI-powered summaries, key topics, and action items from your bookmarks.</p>
              <button class="soft-paywall-btn" id="soft-paywall-upgrade">✦ Upgrade to Pro</button>
            </div>
          </div>`;
        panel.style.display = 'block';
        document.getElementById('soft-paywall-upgrade').addEventListener('click', () => {
          chrome.tabs.create({ url: `${API_BASE}/upgrade` });
        });
        return;
      }
      // Pro + no local AI → fall through to cloud fetch below
    }

    if (!result) {
      // Cloud fallback — Pro only (reached when local AI unavailable or errored)
      debugLog('AI', 'Using cloud summary fallback', { videoId, isPro });
      btn.textContent = '…';
      btn.disabled = true;
      const response = await fetch(`${API_BASE}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks, videoTitle }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        debugLog('AI', 'Cloud summary failed response', { status: response.status });
        throw new Error(err.error || 'Server error');
      }
      result = await response.json();
      debugLog('AI', 'Cloud summary succeeded', {
        hasSummary: Boolean(result?.summary),
        topicCount: Array.isArray(result?.topics) ? result.topics.length : 0,
        actionItemCount: Array.isArray(result?.actionItems) ? result.actionItems.length : 0,
      });
    }

    const { summary, topics, actionItems } = result;

    let html = `<p class="summary-text">${summary}</p>`;

    if (topics?.length) {
      html += `<div class="summary-section"><strong>Topics</strong><ul>${
        topics.map(t => `<li>${t}</li>`).join('')
      }</ul></div>`;
    }

    if (actionItems?.length) {
      html += `<div class="summary-section"><strong>Action items</strong><ul>${
        actionItems.map(a => `<li>${a}</li>`).join('')
      }</ul></div>`;
    }

    content.innerHTML = html;
    panel.style.display = 'block';
  } catch (error) {
    debugError('Summarize failed', error);
    showError(error.message);
  } finally {
    btn.textContent = '✦ Summary';
    btn.disabled = false;
  }
}

// ─── Social Post Generation ───────────────────────────────────────────────────
async function generateSocialPost(platform, shareUrl, autoOpen = false) {
  const outputEl = document.getElementById('social-output');
  const textareaEl = document.getElementById('social-post-text');
  const openLink = document.getElementById('social-open-link');
  const platformBtns = document.querySelectorAll('.social-platform-btn');

  platformBtns.forEach(b => {
    b.disabled = true;
    b.classList.toggle('active', b.dataset.platform === platform);
  });

  outputEl.style.display = 'none';

  try {
    const tab = await getCurrentTab();
    if (!tab.url.includes('youtube.com/watch')) throw new Error('Open a YouTube video first');

    const videoId = extractVideoId(tab.url);
    const bookmarks = await getVideoBookmarks(videoId);
    if (bookmarks.length === 0) throw new Error('No bookmarks to share');
    debugLog('Share', 'Generate social post requested', {
      platform,
      videoId,
      bookmarkCount: bookmarks.length,
      hasShareUrl: Boolean(shareUrl),
      autoOpen,
    });

    const videoTitles = await getVideoTitles();

    const response = await fetch(`${API_BASE}/api/generate-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookmarks,
        videoTitle: videoTitles[videoId] || '',
        shareUrl: shareUrl || '',
        platform,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      debugLog('Share', 'Generate social post failed response', { status: response.status, platform });
      throw new Error(err.error || 'Server error');
    }

    const { post } = await response.json();
    textareaEl.value = post;

    const encoded = encodeURIComponent(post);
    const composeUrls = {
      twitter:  `https://twitter.com/intent/tweet?text=${encoded}`,
      linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${encoded}`,
      threads:  `https://www.threads.net/intent/post?text=${encoded}`,
    };
    openLink.href = composeUrls[platform] || '#';
    openLink.textContent = `Open ${platform.charAt(0).toUpperCase() + platform.slice(1)} ↗`;

    outputEl.style.display = 'block';
    if (autoOpen && composeUrls[platform]) chrome.tabs.create({ url: composeUrls[platform] });
  } catch (error) {
    debugError('Generate social post failed', error, { platform });
    showError(error.message);
  } finally {
    platformBtns.forEach(b => { b.disabled = false; });
  }
}

// ─── Resume Playback ──────────────────────────────────────────────────────────
async function loadResumePosition(videoId, tabId) {
  const pill = document.getElementById('resume-pill');
  if (!pill) return;

  const key = `resume_${videoId}`;
  const data = await new Promise(resolve => chrome.storage.local.get({ [key]: null }, resolve));
  const entry = data[key];

  if (!entry || entry.time < 30) { pill.style.display = 'none'; return; }

  pill.style.display = 'flex';
  pill.innerHTML = `
    <span class="resume-pill-icon material-symbols-outlined">play_circle</span>
    <span class="resume-pill-text">Resume from ${formatTimestamp(entry.time)}</span>
    <button class="resume-pill-dismiss" title="Dismiss" aria-label="Dismiss">✕</button>
  `;

  pill.querySelector('.resume-pill-text').addEventListener('click', async () => {
    try {
      await sendMessageToTab(tabId, { action: 'seekTo', time: entry.time });
      pill.style.display = 'none';
    } catch { /* tab may have been navigated */ }
  });

  pill.querySelector('.resume-pill-icon').addEventListener('click', async () => {
    try {
      await sendMessageToTab(tabId, { action: 'seekTo', time: entry.time });
      pill.style.display = 'none';
    } catch { /* tab may have been navigated */ }
  });

  pill.querySelector('.resume-pill-dismiss').addEventListener('click', () => {
    pill.style.display = 'none';
  });
}

async function pruneOldResumeEntries() {
  const all = await new Promise(resolve => chrome.storage.local.get(null, resolve));
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days ago
  const toRemove = Object.keys(all).filter(k => {
    if (!k.startsWith('resume_')) return false;
    const entry = all[k];
    return !entry?.lastWatched || new Date(entry.lastWatched).getTime() < cutoff;
  });
  if (toRemove.length) chrome.storage.local.remove(toRemove);
}

// ─── Comments View ────────────────────────────────────────────────────────────

// Sync state
let allComments = [];          // { author, likeCount, text, timestamps[] }
let commentSyncInterval = null;
let lastSyncedIdxs = null; // null = never rendered yet → always force first render
const COMMENT_SYNC_WINDOW = 30; // seconds either side of current time

/** Extract all mm:ss / hh:mm:ss timestamps from a comment string → array of seconds */
function parseCommentTimestamps(text) {
  const re = /\b(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\b/g;
  const stamps = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const secs = (parseInt(m[1] || '0') * 3600) + (parseInt(m[2]) * 60) + parseInt(m[3]);
    stamps.push(secs);
  }
  return stamps;
}

/** Build HTML for a single comment card. syncTs = matched seconds or null */
function commentCardHtml(c, syncTs) {
  const initials = (c.author || '?').charAt(0).toUpperCase();
  const likesText = c.likeCount > 0
    ? `<span class="comment-likes">♥ ${c.likeCount.toLocaleString()}</span>`
    : '';
  const syncBadge = syncTs != null
    ? `<span class="comment-sync-badge">⏱ ${formatTimestamp(syncTs)}</span>`
    : '';
  return `
    <div class="comment-card${syncTs != null ? ' comment-card--synced' : ''}">
      <div class="comment-header">
        <div class="comment-avatar">${initials}</div>
        <span class="comment-author">${escapeHtml(c.author)}</span>
        ${syncBadge}
        ${likesText}
      </div>
      <p class="comment-text">${sanitizeCommentHtml(c.text)}</p>
      <button class="comment-expand-btn" data-expanded="false">Show more</button>
    </div>
  `;
}

/** Re-sort comments by proximity to currentTime and re-render only when synced set changes */
function renderCommentList(currentTime) {
  const list = document.getElementById('comment-list');
  if (!list || allComments.length === 0) return;

  const synced = [];
  const rest = [];

  allComments.forEach((c, idx) => {
    if (c.timestamps.length === 0) { rest.push({ c, syncTs: null }); return; }
    let best = { dist: Infinity, ts: null };
    for (const ts of c.timestamps) {
      const d = Math.abs(ts - currentTime);
      if (d < best.dist) best = { dist: d, ts };
    }
    if (best.dist <= COMMENT_SYNC_WINDOW) {
      synced.push({ c, idx, syncTs: best.ts, dist: best.dist });
    } else {
      rest.push({ c, syncTs: null });
    }
  });

  synced.sort((a, b) => a.dist - b.dist);

  // Only re-render when the set of synced comments actually changes
  // (lastSyncedIdxs === null means never rendered yet — always proceed)
  const newIdxs = new Set(synced.map(e => e.idx));
  const changed = lastSyncedIdxs === null ||
    newIdxs.size !== lastSyncedIdxs.size ||
    [...newIdxs].some(i => !lastSyncedIdxs.has(i));
  if (!changed) return;
  lastSyncedIdxs = newIdxs;

  let html = '';
  if (synced.length > 0) {
    html += `<div class="comment-sync-header"><span class="comment-sync-icon">⏱</span> Relevant to this moment</div>`;
    html += synced.map(({ c, syncTs }) => commentCardHtml(c, syncTs)).join('');
    html += `<div class="comment-sync-divider"></div>`;
  }
  html += rest.map(({ c }) => commentCardHtml(c, null)).join('');
  list.innerHTML = html;

  // Hide expand buttons on short comments that don't overflow
  list.querySelectorAll('.comment-card').forEach(card => {
    const textEl = card.querySelector('.comment-text');
    const btn = card.querySelector('.comment-expand-btn');
    if (textEl.scrollHeight <= textEl.clientHeight) btn.style.display = 'none';
  });
}

/** Start polling current video time and re-sorting comments */
async function startCommentSync(tabId) {
  stopCommentSync();
  try {
    const r = await sendMessageToTab(tabId, { action: 'getCurrentTime' });
    if (r?.currentTime !== undefined) renderCommentList(r.currentTime);
  } catch {}
  commentSyncInterval = setInterval(async () => {
    try {
      const r = await sendMessageToTab(tabId, { action: 'getCurrentTime' });
      if (r?.currentTime !== undefined) renderCommentList(r.currentTime);
    } catch {}
  }, 2000);
}

/** Stop the sync polling and reset synced state */
function stopCommentSync() {
  if (commentSyncInterval) { clearInterval(commentSyncInterval); commentSyncInterval = null; }
  lastSyncedIdxs = null; // reset sentinel so next render always proceeds
}

async function loadComments(videoId, tabId) {
  const list = document.getElementById('comment-list');
  if (!list) return;
  stopCommentSync();
  allComments = [];

  list.innerHTML = '<div class="comment-skeleton"></div><div class="comment-skeleton"></div><div class="comment-skeleton"></div>';

  try {
    const res = await fetch(`${API_BASE}/api/comments?videoId=${encodeURIComponent(videoId)}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load comments');
    }

    const { comments } = await res.json();

    if (!comments || comments.length === 0) {
      list.innerHTML = '<div class="no-bookmarks">No comments found.</div>';
      return;
    }

    // Store parsed comments globally so renderCommentList can re-sort them
    allComments = comments.map(c => ({
      ...c,
      timestamps: parseCommentTimestamps(String(c.text || '')),
    }));

    // Initial render at t=0, then start live sync if we have a tab
    renderCommentList(0);
    if (tabId) startCommentSync(tabId);
  } catch (error) {
    list.innerHTML = `<div class="no-bookmarks">${error.message}</div>`;
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// YouTube API returns HTML in textDisplay (e.g. <br>, &#39;, <a href>).
// Strip everything except <br> and <a> (with href sanitized), then decode entities.
function sanitizeCommentHtml(html) {
  return String(html)
    // Keep <br> as-is
    // Strip all tags except <br> and <a href="...">
    .replace(/<(?!br\s*\/?>|a\s[^>]*href=["']https?:\/\/[^"']*["'][^>]*>|\/a>)[^>]+>/gi, '')
    // Force all <a> links to open safely
    .replace(/<a\s[^>]*href=["'](https?:\/\/[^"']*?)["'][^>]*>/gi,
      (_, url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">`)
    .trim();
}

// ─── Module-level state ───────────────────────────────────────────────────────
let hasLoadedVideo = false;
let lastCommentVideoId = null;

// ─── Load Bookmarks ───────────────────────────────────────────────────────────
function showUnsupportedScreen() {
  const screen = document.getElementById('sp-unsupported-screen');
  if (screen) screen.style.display = 'flex';
}

function hideUnsupportedScreen() {
  const screen = document.getElementById('sp-unsupported-screen');
  if (screen) screen.style.display = 'none';
}

async function loadBookmarks() {
  try {
    const tab = await getCurrentTab();
    if (!tab.url || !tab.url.includes('youtube.com/watch')) {
      if (hasLoadedVideo) return;
      debugLog('Init', 'Showing unsupported screen (not on YouTube watch page)');
      showUnsupportedScreen();
      return;
    }
    hideUnsupportedScreen();
    hasLoadedVideo = true;

    const videoId = extractVideoId(tab.url);
    if (!videoId) return;
    debugLog('Bookmarks', 'Loading bookmarks for active video', { videoId, tabId: tab.id });

    // Auto-refresh comments if Comments tab is currently visible and video changed
    const commentsPanel = document.getElementById('comments-panel');
    const commentsVisible = commentsPanel && commentsPanel.style.display !== 'none';
    if (commentsVisible && videoId !== lastCommentVideoId) {
      lastCommentVideoId = videoId;
      loadComments(videoId);
    }

    // Resume playback pill + entry cleanup
    loadResumePosition(videoId, tab.id);
    pruneOldResumeEntries();

    // Update video title context
    const videoTitles = await getVideoTitles();
    const titleEl = document.querySelector('#video-title span');
    if (titleEl && videoTitles[videoId]) {
      titleEl.className = '';
      titleEl.textContent = videoTitles[videoId];
    }

    // Update timestamp
    try {
      const response = await sendMessageToTab(tab.id, { action: 'getCurrentTime' });
      if (response && response.currentTime !== undefined) {
        const currentTimeEl = document.getElementById('current-time');
        if (currentTimeEl) {
          currentTimeEl.textContent = `⏱ ${formatTimestamp(response.currentTime)}`;
        }
      }
    } catch (e) {
      debugLog('Error', 'Could not get current time', e.message);
    }

    await waitForContentScript(tab.id);

    const bookmarks = (await getVideoBookmarks(videoId))
      .sort((a, b) => a.timestamp - b.timestamp);
    debugLog('Bookmarks', 'Loaded bookmarks', { videoId, count: bookmarks.length });

    const list = document.getElementById('bookmark-list');

    if (bookmarks.length === 0) {
      list.innerHTML = `
        <div class="no-bookmarks">
          No bookmarks yet.<br>
          <span style="font-size:11px;color:var(--text-secondary);margin-top:8px;display:block;">Save important moments to see them here.</span>
        </div>
      `;
      return;
    }

    list.innerHTML = bookmarks.map(b => `
      <div class="bookmark" data-timestamp="${b.timestamp}" data-id="${b.id}" data-video-id="${videoId}" style="border-left-color: ${b.color || '#4da1ee'}">
        <div class="bookmark-content">
          <span class="bookmark-time" style="color:${b.color || '#4da1ee'}">${formatTimestamp(b.timestamp)}</span>
          <span class="bookmark-desc">${b.description || 'No description'}</span>
          ${b.tags && b.tags.length
            ? `<div class="bookmark-tags">${b.tags.map(t =>
                `<span class="tag-badge" style="background:${getTagColor([t])};opacity:0.8;color:white">${t}</span>`
              ).join('')}</div>`
            : ''}
        </div>
        <button class="copy-link" data-video-id="${videoId}" data-timestamp="${b.timestamp}" aria-label="Copy link" title="Copy link">⎘</button>
        <button class="delete-bookmark" aria-label="Delete bookmark" title="Delete">&times;</button>
      </div>
    `).join('');

    list.querySelectorAll('.bookmark').forEach(el => {
      const id = el.dataset.id;
      const vId = el.dataset.videoId;
      const timestamp = el.dataset.timestamp;

      // Copy link
      el.querySelector('.copy-link').addEventListener('click', async e => {
        e.stopPropagation();
        const url = ytWatchUrl(vId, parseFloat(timestamp));
        await navigator.clipboard.writeText(url);
        showStatus('Link copied!');
      });

      // Delete
      el.querySelector('.delete-bookmark').addEventListener('click', async e => {
        e.stopPropagation();
        await deleteBookmark(vId, id);
      });

      // Seek to bookmark
      el.addEventListener('click', async e => {
        if (e.target.classList.contains('delete-bookmark')) return;
        try {
          await waitForContentScript(tab.id);
          await sendMessageToTab(tab.id, { action: 'setTimestamp', timestamp: parseFloat(timestamp) });
        } catch (error) {
          showError('Failed to seek: ' + error.message);
        }
      });

      // Inline edit
      el.querySelector('.bookmark-desc').addEventListener('click', e => {
        e.stopPropagation();
        const descEl = e.currentTarget;
        const current = descEl.textContent;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'sp-input';
        input.value = (current === 'No description' || current.startsWith('Bookmark at')) ? '' : current;
        descEl.replaceWith(input);
        input.focus();
        input.select();

        const save = () => {
          const val = input.value.trim() || `Bookmark at ${formatTimestamp(parseFloat(timestamp))}`;
          input.disabled = true;
          input.classList.add('sp-input--saving');
          updateBookmarkDescription(vId, id, val);
        };

        const blurHandler = () => {
          save();
          input.removeEventListener('blur', blurHandler);
        };

        input.addEventListener('blur', blurHandler);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter') { e.preventDefault(); input.removeEventListener('blur', blurHandler); save(); }
          if (e.key === 'Escape') { input.removeEventListener('blur', blurHandler); loadBookmarks(); }
        });
      });
    });
  } catch (error) {
    debugError('Failed to load bookmarks', error);
    showError('Failed to load bookmarks: ' + error.message);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function loadAuthState() {
  const { bmUser } = await new Promise(resolve => chrome.storage.sync.get({ bmUser: null }, resolve));
  const signinBtn  = document.getElementById('signin-btn');
  const userChip   = document.getElementById('user-chip');
  const signoutBtn = document.getElementById('signout-btn');
  if (!signinBtn || !userChip) return;

  if (bmUser) {
    debugLog('Auth', 'Rendering signed-in state');
    signinBtn.style.display  = 'none';
    userChip.style.display   = '';
    userChip.textContent     = bmUser.userEmail?.split('@')[0] || 'Signed in';
    userChip.title           = bmUser.userEmail || '';
    if (signoutBtn) signoutBtn.style.display = '';

    // Silently validate/refresh token — sign out if session is fully expired
    const token = await getValidToken();
    if (!token) {
      debugLog('Auth', 'Session expired, clearing bmUser');
      await new Promise(resolve => chrome.storage.sync.remove('bmUser', resolve));
      loadAuthState();
    }
  } else {
    debugLog('Auth', 'Rendering signed-out state');
    signinBtn.style.display  = '';
    userChip.style.display   = 'none';
    if (signoutBtn) signoutBtn.style.display = 'none';
  }
}

// ─── Initialize ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  debugLog('Init', 'Side panel opened');

  loadBookmarks();
  loadAuthState();

  // Unsupported screen button handlers
  document.getElementById('sp-go-youtube-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.youtube.com' });
  });
  document.getElementById('sp-open-dashboard-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
  });

  // Re-check when the active tab navigates (e.g. user goes to YouTube)
  chrome.tabs.onUpdated.addListener((_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      loadBookmarks();
    }
  });

  // Theme toggle (hidden)
  // function initTheme() {
  //   chrome.storage.local.get(['theme'], (result) => {
  //     const theme = result.theme || 'light';
  //     document.documentElement.setAttribute('data-theme', theme);
  //     updateThemeIcon(theme);
  //   });
  // }
  // function updateThemeIcon(theme) {
  //   const icon = document.querySelector('.theme-icon');
  //   if (icon) { icon.textContent = theme === 'dark' ? '🌙' : '☀️'; }
  // }
  // function toggleTheme() {
  //   const current = document.documentElement.getAttribute('data-theme') || 'light';
  //   const newTheme = current === 'light' ? 'dark' : 'light';
  //   document.documentElement.setAttribute('data-theme', newTheme);
  //   chrome.storage.local.set({ theme: newTheme });
  //   updateThemeIcon(newTheme);
  // }
  // initTheme();
  // document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

  // Tab switching: Bookmarks / Comments
  document.getElementById('tab-bookmarks').addEventListener('click', () => {
    document.getElementById('tab-bookmarks').classList.add('sp-tab--active');
    document.getElementById('tab-comments').classList.remove('sp-tab--active');
    document.getElementById('bookmarks-panel').style.display = '';
    document.getElementById('comments-panel').style.display = 'none';
    stopCommentSync();
  });
  document.getElementById('tab-comments').addEventListener('click', async () => {
    document.getElementById('tab-comments').classList.add('sp-tab--active');
    document.getElementById('tab-bookmarks').classList.remove('sp-tab--active');
    document.getElementById('bookmarks-panel').style.display = 'none';
    document.getElementById('comments-panel').style.display = '';
    const tab = await getCurrentTab();
    const videoId = tab?.url ? extractVideoId(tab.url) : null;
    if (videoId !== lastCommentVideoId) {
      lastCommentVideoId = videoId;
      if (videoId) loadComments(videoId, tab.id);
      else document.getElementById('comment-list').innerHTML = '<div class="no-bookmarks">Open a YouTube video first.</div>';
    } else if (videoId && allComments.length > 0) {
      // Same video — comments already loaded, just restart the sync polling
      startCommentSync(tab.id);
    }
  });

  // Expand / collapse comment text (delegated — survives comment list re-renders)
  document.getElementById('comment-list')?.addEventListener('click', e => {
    const btn = e.target.closest('.comment-expand-btn');
    if (!btn) return;
    const textEl = btn.closest('.comment-card').querySelector('.comment-text');
    const isExpanded = btn.dataset.expanded === 'true';
    textEl.classList.toggle('expanded', !isExpanded);
    btn.dataset.expanded = String(!isExpanded);
    btn.textContent = isExpanded ? 'Show more' : 'Show less';
  });

  // Quick tags
  const descInput = document.getElementById('description');
  document.querySelectorAll('.quick-tag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tag = btn.dataset.tag;
      const current = descInput.value.trim();
      const alreadyHas = new RegExp(`#${tag}\\b`).test(current);
      if (!alreadyHas) {
        descInput.value = current ? `${current} #${tag}` : `#${tag}`;
      }
      descInput.focus();
    });
  });

  // Buttons
  document.getElementById('add-bookmark').addEventListener('click', async () => {
    try {
      const tab = await getCurrentTab();
      if (!tab.url.includes('youtube.com/watch')) {
        throw new Error('Please navigate to a YouTube video first!');
      }

      const videoId = extractVideoId(tab.url);
      if (!videoId) throw new Error('Could not find a valid YouTube video ID');

      await waitForContentScript(tab.id);
      const response = await sendMessageToTab(tab.id, { action: 'getTimestamp' });

      if (response && response.timestamp != null) {
        const description = document.getElementById('description').value;
        await saveBookmark({ videoId, timestamp: response.timestamp, description, duration: response.duration || 0 });
        document.getElementById('description').value = '';
      } else {
        throw new Error('Could not get current video timestamp');
      }
    } catch (error) {
      debugError('Failed to add bookmark from UI click', error);
      showError(error.message);
    }
  });

  // ── Auto-fill from transcript ──────────────────────────────────────────────
  document.getElementById('auto-fill-btn').addEventListener('click', async () => {
    const btn   = document.getElementById('auto-fill-btn');
    const input = document.getElementById('description');
    const origHTML = btn.innerHTML;
    try {
      const tab = await getCurrentTab();
      if (!tab.url.includes('youtube.com/watch')) {
        debugLog('AutoFill', 'Blocked: not on YouTube watch page');
        return;
      }

      btn.disabled = true;
      debugLog('AutoFill', 'Auto-fill requested', { tabId: tab.id });

      await waitForContentScript(tab.id);
      const tsRes = await sendMessageToTab(tab.id, { action: 'getTimestamp' });
      if (!tsRes?.timestamp) throw new Error('no timestamp');

      debugLog('AutoFill', 'Fetching transcript/chapter', { timestamp: Math.floor(tsRes.timestamp) });
      const [txResult, chResult] = await Promise.allSettled([
        sendMessageToTab(tab.id, { action: 'getTranscriptAtTimestamp', timestamp: tsRes.timestamp }),
        sendMessageToTab(tab.id, { action: 'getCurrentChapter' }),
      ]);

      const transcript = txResult.status === 'fulfilled' ? txResult.value?.text  : null;
      const chapter    = chResult.status  === 'fulfilled' ? chResult.value?.chapter : null;
      const txRaw = txResult.status === 'fulfilled' ? txResult.value : null;
      debugLog('AutoFill', 'Transcript fetch result', {
        status: txResult.status,
        hasText: Boolean(txRaw?.text),
        textLength: txRaw?.text?.length || 0,
        segmentCount: txRaw?._debug?.segmentCount,
        hasCaptions: txRaw?._debug?.hasCaptions,
        error: toErrorMessage(txResult.reason),
      });
      debugLog('AutoFill', 'Chapter fetch result', {
        status: chResult.status,
        hasChapter: Boolean(chapter),
        chapterLength: chapter?.length || 0,
      });

      let text = null;
      if (chapter && transcript) text = `${chapter} - ${transcript}`;
      else if (transcript)        text = transcript;
      else if (chapter)           text = chapter;

      if (text) {
        debugLog('AutoFill', 'Auto-fill succeeded', {
          source: chapter && transcript ? 'chapter+transcript' : (transcript ? 'transcript' : 'chapter'),
          valueLength: text.length,
        });
        input.value = text;
        input.focus();
        input.select();
      } else {
        debugLog('AutoFill', 'No transcript or chapter available');
        showStatus('No transcript available');
      }
    } catch (e) {
      debugError('Auto-fill failed', e);
    } finally {
      btn.disabled = false;
      btn.innerHTML = origHTML;
    }
  });

  document.getElementById('signin-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${API_BASE}/signin?extensionId=${chrome.runtime.id}` });
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await new Promise(resolve => chrome.storage.sync.remove('bmUser', resolve));
    loadAuthState();
  });

  document.getElementById('dashboard-link').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
  });

  document.getElementById('revisit-mode-btn').addEventListener('click', async () => {
    try {
      const isPro = await checkPro();
      if (!isPro) {
        showError('▶ Revisit Mode is a Pro feature. Upgrade to Clipmark Pro.', 4000);
        return;
      }
      const tab = await getCurrentTab();
      if (!tab.url.includes('youtube.com/watch')) {
        showError('Please navigate to a YouTube video first.');
        return;
      }
      const videoId = extractVideoId(tab.url);
      if (!videoId) return;
      const bookmarks = (await getVideoBookmarks(videoId)).sort((a, b) => a.timestamp - b.timestamp);
      if (!bookmarks.length) {
        showError('No bookmarks for this video yet.');
        return;
      }
      await waitForContentScript(tab.id);
      await sendMessageToTab(tab.id, { action: 'startRevision', bookmarks });
    } catch (error) {
      showError('Could not start Revisit Mode: ' + error.message);
    }
  });

  document.getElementById('summarize-btn').addEventListener('click', summarizeBookmarks);

  document.getElementById('summary-close').addEventListener('click', () => {
    document.getElementById('summary-panel').style.display = 'none';
  });

  document.getElementById('social-close').addEventListener('click', () => {
    document.getElementById('social-panel').style.display = 'none';
  });

  // Overlay platform buttons (copy flow)
  document.querySelectorAll('.social-platform-btn').forEach(btn => {
    btn.addEventListener('click', () => generateSocialPost(btn.dataset.platform, null));
  });

  // Footer platform buttons — generate post and open platform directly
  document.querySelectorAll('.sp-platform-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('social-panel').style.display = 'flex';
      generateSocialPost(btn.dataset.platform, null, true);
    });
  });

  // Watch for storage changes (real-time sync from dashboard)
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      debugLog('Storage', 'Sync change detected, reloading side panel', {
        changedKeys: Object.keys(changes),
      });
      loadBookmarks();
      if (changes.bmUser) loadAuthState();
    }
  });

  // Reload bookmarks when tab changes
  chrome.tabs.onActivated.addListener(() => {
    debugLog('Tabs', 'Tab activated, reloading bookmarks');
    loadBookmarks();
  });

  debugLog('Init', 'Side panel initialization complete');
});

// Auto-refresh when YouTube SPA navigates to a new video
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'ytVideoChanged') {
    debugLog('Nav', 'YouTube video changed, reloading', { videoId: msg.videoId });
    loadBookmarks();
  }
});
