// ─── API config ──────────────────────────────────────────────────────────────
// Change to 'https://bookmarker.app' after deploying the webapp
const API_BASE = 'https://clipmark-chi.vercel.app';

// Returns a fresh access token, auto-refreshing via /api/refresh if expired.
async function getValidToken() {
  const { bmUser } = await new Promise(resolve =>
    chrome.storage.sync.get({ bmUser: null }, resolve)
  );
  if (!bmUser?.accessToken) return null;
  try {
    const payload = JSON.parse(atob(bmUser.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp * 1000 > Date.now() + 60_000) return bmUser.accessToken;
  } catch { /* fall through to refresh */ }
  if (!bmUser.refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: bmUser.refreshToken }),
    });
    if (!res.ok) return null;
    const { access_token, refresh_token } = await res.json();
    await new Promise(resolve =>
      chrome.storage.sync.set({ bmUser: { ...bmUser, accessToken: access_token, refreshToken: refresh_token } }, resolve)
    );
    return access_token;
  } catch {
    return null;
  }
}

// ─── Tag colours ────────────────────────────────────────────────────────────
const TAG_COLORS = {
  important: '#ff6b6b',
  review:    '#ffa94d',
  note:      '#74c0fc',
  question:  '#a9e34b',
  todo:      '#da77f2',
  key:       '#f783ac',
};

function parseTags(description) {
  if (!description) return [];
  const matches = description.match(/#(\w+)/g);
  return matches ? matches.map(t => t.slice(1).toLowerCase()) : [];
}

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 60%, 60%)`;
}

function getTagColor(tags) {
  if (!tags || tags.length === 0) return '#4da1ee';
  return TAG_COLORS[tags[0]] || stringToColor(tags[0]);
}

// ─── Utilities ───────────────────────────────────────────────────────────────
function extractVideoId(url) {
  return new URLSearchParams(new URL(url).search).get('v');
}

async function getCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function debugLog(category, message, data = null) {
  console.log(`[Popup][${category}][${new Date().toISOString()}] ${message}`, data ?? '');
}

// ─── Messaging ───────────────────────────────────────────────────────────────
function sendMessageToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, response => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message || 'Failed to communicate with the page'));
      } else if (response && response.error) {
        reject(new Error(response.error));
      } else {
        resolve(response);
      }
    });
  });
}

async function waitForContentScript(tabId, maxRetries = 3, delay = 1000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const r = await sendMessageToTab(tabId, { action: 'ping' });
      if (r && r.status === 'ready') return true;
    } catch {
      if (i < maxRetries - 1) await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error('Content script not available. Please refresh the YouTube page.');
}

// ─── Storage (per-video sync keys) ───────────────────────────────────────────
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

async function getVideoBookmarksLocal(videoId) {
  const r = await syncGet({ [bmKey(videoId)]: [] });
  return r[bmKey(videoId)];
}

async function getVideoBookmarks(videoId) {
  await pullFromCloud(videoId);
  return getVideoBookmarksLocal(videoId);
}

async function saveVideoBookmarks(videoId, bookmarks) {
  await syncSet({ [bmKey(videoId)]: bookmarks });
  // Cloud sync: push to Supabase if signed in
  syncToCloud(videoId, bookmarks);
}

async function syncToCloud(videoId, bookmarks) {
  try {
    const token = await getValidToken();
    if (!token) return;
    await fetch(`${API_BASE}/api/bookmarks`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ videoId, bookmarks }),
    });
  } catch {
    // Cloud sync is best-effort — don't block the user
  }
}

async function pullFromCloud(videoId) {
  try {
    const token = await getValidToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/bookmarks?videoId=${encodeURIComponent(videoId)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { bookmarks: cloudBms } = await res.json();
    if (!cloudBms?.length) return;
    const localBms = await getVideoBookmarksLocal(videoId);
    const localIds = new Set(localBms.map(b => b.id));
    const newFromCloud = cloudBms.filter(b => !localIds.has(b.id));
    if (!newFromCloud.length) return;
    const merged = [...localBms, ...newFromCloud];
    await saveVideoBookmarks(videoId, merged);
  } catch {
    // Pull is best-effort — don't block the user
  }
}

async function getVideoTitles() {
  const r = await syncGet({ videoTitles: {} });
  return r.videoTitles;
}

// ─── One-time migration from chrome.storage.local → sync ─────────────────────
async function migrateToSync(tabId) {
  const check = await syncGet({ syncMigrated: false });
  if (check.syncMigrated) return;

  const local = await new Promise(resolve =>
    chrome.storage.local.get({ bookmarks: [], videoTitles: {} }, resolve)
  );

  const syncData = { syncMigrated: true };

  if (local.bookmarks.length > 0) {
    const byVideo = {};
    local.bookmarks.forEach(b => {
      if (!byVideo[b.videoId]) byVideo[b.videoId] = [];
      const tags = b.tags || parseTags(b.description);
      byVideo[b.videoId].push({ ...b, tags, color: b.color || getTagColor(tags) });
    });
    for (const [vId, bms] of Object.entries(byVideo)) {
      syncData[bmKey(vId)] = bms;
    }
  }

  if (Object.keys(local.videoTitles).length > 0) {
    syncData.videoTitles = local.videoTitles;
  }

  await syncSet(syncData);
  debugLog('Migration', 'Migrated bookmarks from local to sync');

  // Refresh markers after migration
  if (tabId) {
    try { await sendMessageToTab(tabId, { action: 'bookmarkUpdated' }); } catch {}
  }
}

// ─── Bookmark CRUD ────────────────────────────────────────────────────────────
async function saveBookmark(bookmark) {
  try {
    const tab = await getCurrentTab();
    await waitForContentScript(tab.id);

    // Duplicate check (unique by videoId + timestamp)
    const existing = await getVideoBookmarks(bookmark.videoId);
    if (existing.some(b => Math.floor(b.timestamp) === Math.floor(bookmark.timestamp))) {
      showError('Bookmark already exists.');
      return;
    }

    const videoTitles = await getVideoTitles();

    // Auto-fill description from transcript when user left it empty
    let description = bookmark.description.trim();
    if (!description) {
      try {
        const txRes = await sendMessageToTab(tab.id, {
          action: 'getTranscriptAtTimestamp',
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

    const tags  = parseTags(description);
    const color = getTagColor(tags);

    const bookmarks = await getVideoBookmarks(bookmark.videoId);
    bookmarks.push({
      ...bookmark,
      description,
      tags,
      color,
      id:             Date.now(),
      createdAt:      new Date().toISOString(),
      videoTitle:     videoTitles[bookmark.videoId] || null,
      reviewSchedule: [1, 3, 7],
      lastReviewed:   null,
    });

    await saveVideoBookmarks(bookmark.videoId, bookmarks);
    if (bookmark.duration) {
      const vd = (await syncGet({ videoDurations: {} })).videoDurations;
      vd[bookmark.videoId] = bookmark.duration;
      await syncSet({ videoDurations: vd });
    }
    debugLog('Bookmarks', 'Saved bookmark', { description, tags });

    // Visual feedback on the video player
    sendMessageToTab(tab.id, { action: 'showSaveFlash' }).catch(() => {});

    document.getElementById('description').value = '';
    document.getElementById('tag-suggestions').style.display = 'none';
    showStatus('Bookmark saved ✓');

    await loadBookmarks();
    await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' });
  } catch (error) {
    debugLog('Error', 'Failed to save bookmark', { error: error.message });
    showError('Failed to save bookmark: ' + error.message);
  }
}

async function deleteBookmark(videoId, bookmarkId) {
  try {
    const tab = await getCurrentTab();
    await waitForContentScript(tab.id);

    const bookmarks = await getVideoBookmarks(videoId);
    await saveVideoBookmarks(videoId, bookmarks.filter(b => b.id !== parseInt(bookmarkId)));

    await loadBookmarks();
    await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' });
  } catch (error) {
    showError('Failed to delete bookmark: ' + error.message);
  }
}

async function updateBookmarkDescription(videoId, bookmarkId, newDescription) {
  try {
    const tab = await getCurrentTab();
    const bookmarks = await getVideoBookmarks(videoId);
    const updated = bookmarks.map(b => {
      if (b.id !== parseInt(bookmarkId)) return b;
      const tags  = parseTags(newDescription);
      const color = getTagColor(tags);
      return { ...b, description: newDescription, tags, color };
    });
    await saveVideoBookmarks(videoId, updated);
    await loadBookmarks();
    try { await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' }); } catch {}
  } catch (error) {
    showError('Failed to update bookmark: ' + error.message);
  }
}

// ─── Pro / Paywall helpers ────────────────────────────────────────────────────
async function checkPro() {
  const { bmUser } = await syncGet({ bmUser: null });
  return bmUser?.isPro === true;
}

function showUpgradePrompt(feature) {
  showError(`✦ ${feature} is a Pro feature. Upgrade to Clipmark Pro to unlock AI-powered tools.`, 4000);
}

// ─── Smart Tag Suggestions ────────────────────────────────────────────────────
async function suggestTags(description, transcript) {
  const suggestionsEl = document.getElementById('tag-suggestions');
  if (!description.trim()) {
    suggestionsEl.style.display = 'none';
    return;
  }

  // Pro-only feature — silently skip so it doesn't disrupt the auto-fill flow
  const isPro = await checkPro();
  if (!isPro) return;

  try {
    const response = await fetch(`${API_BASE}/api/suggest-tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, transcript }),
    });
    if (!response.ok) return;

    const { tags } = await response.json();
    if (!tags?.length) return;

    const input = document.getElementById('description');
    const existingTags = parseTags(input.value);
    const newTags = tags.filter(t => !existingTags.includes(t));
    if (!newTags.length) return;

    suggestionsEl.innerHTML =
      '<span class="tag-suggest-label">Suggested:</span>' +
      newTags.map(t =>
        `<button class="tag-suggest-chip" data-tag="${t}" style="background:${getTagColor([t])}">#${t}</button>`
      ).join('');

    suggestionsEl.querySelectorAll('.tag-suggest-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        const val = input.value.trim();
        input.value = val ? `${val} #${tag}` : `#${tag}`;
        chip.remove();
        if (!suggestionsEl.querySelectorAll('.tag-suggest-chip').length) {
          suggestionsEl.style.display = 'none';
        }
      });
    });

    suggestionsEl.style.display = 'flex';
  } catch {
    // Silently ignore — tag suggestions are non-critical
  }
}

// ─── AI Summary ───────────────────────────────────────────────────────────────
async function summarizeBookmarks() {
  const btn = document.getElementById('summarize-btn');
  const panel = document.getElementById('summary-panel');
  const content = document.getElementById('summary-content');

  // Toggle off if already open
  if (panel.style.display !== 'none') {
    panel.style.display = 'none';
    return;
  }

  // Pro-only feature — show blurred soft paywall instead of hard error
  const isPro = await checkPro();
  if (!isPro) {
    content.innerHTML = `
      <div class="soft-paywall">
        <div class="soft-paywall-blur">
          <p>Your bookmarks summarized into key topics, decisions, and action items — powered by Claude AI.</p>
          <ul><li>Introduction to the topic</li><li>Key concepts covered</li><li>Action items to follow up</li></ul>
        </div>
        <div class="soft-paywall-cta">
          <span class="soft-paywall-icon">✦</span>
          <strong>Unlock AI Summary</strong>
          <p>Upgrade to Clipmark Pro to summarize any video's bookmarks instantly.</p>
          <button class="soft-paywall-btn" id="soft-paywall-upgrade">✦ Upgrade to Pro</button>
        </div>
      </div>`;
    panel.style.display = 'block';
    document.getElementById('soft-paywall-upgrade').addEventListener('click', () => {
      chrome.tabs.create({ url: `${API_BASE}/upgrade` });
    });
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

    btn.textContent = '…';
    btn.disabled = true;

    const response = await fetch(`${API_BASE}/api/summarize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookmarks,
        videoTitle: videoTitles[videoId] || '',
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Server error');
    }

    const { summary, topics, actionItems } = await response.json();

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
    showError(error.message);
  } finally {
    btn.textContent = '✦ Summary';
    btn.disabled = false;
  }
}

// ─── Social Post Generation ────────────────────────────────────────────────────
async function generateSocialPost(platform, shareUrl) {
  const outputEl     = document.getElementById('social-output');
  const textareaEl   = document.getElementById('social-post-text');
  const openLink     = document.getElementById('social-open-link');
  const platformBtns = document.querySelectorAll('.social-platform-btn');

  platformBtns.forEach(b => {
    b.disabled = true;
    b.classList.toggle('active', b.dataset.platform === platform);
  });

  outputEl.style.display = 'none';

  try {
    const tab = await getCurrentTab();
    if (!tab.url.includes('youtube.com/watch')) throw new Error('Open a YouTube video first');

    const videoId    = extractVideoId(tab.url);
    const bookmarks  = await getVideoBookmarks(videoId);
    if (bookmarks.length === 0) throw new Error('No bookmarks to share');

    const videoTitles = await getVideoTitles();

    const response = await fetch(`${API_BASE}/api/generate-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bookmarks,
        videoTitle: videoTitles[videoId] || '',
        shareUrl:   shareUrl || '',
        platform,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Server error');
    }

    const { post } = await response.json();
    textareaEl.value = post;

    // Deep-link to platform compose
    const encoded = encodeURIComponent(post);
    const composeUrls = {
      twitter:  `https://twitter.com/intent/tweet?text=${encoded}`,
      linkedin: `https://www.linkedin.com/feed/?shareActive=true&text=${encoded}`,
      threads:  `https://www.threads.net/intent/post?text=${encoded}`,
    };
    openLink.href        = composeUrls[platform] || '#';
    openLink.textContent = `Open ${platform.charAt(0).toUpperCase() + platform.slice(1)} ↗`;

    outputEl.style.display = 'block';
  } catch (error) {
    showError(error.message);
  } finally {
    platformBtns.forEach(b => { b.disabled = false; });
  }
}

// ─── Share ────────────────────────────────────────────────────────────────────
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
        showError(`You've used all ${err.limit} free shares. ✦ Upgrade to Pro for unlimited sharing.`, 5000);
        chrome.tabs.create({ url: `${API_BASE}/upgrade` });
        btn.textContent = '↗ Share';
        btn.disabled = false;
        return null;
      }
    }

    if (!response.ok) throw new Error('Server error — is the webapp running?');

    const { shareId, collectionsUsed, freeLimit } = await response.json();
    const shareUrl = `${API_BASE}/v/${shareId}`;

    await navigator.clipboard.writeText(shareUrl);

    btn.textContent = '✓ Copied!';
    btn.classList.add('share-btn--copied');
    setTimeout(() => {
      btn.textContent = '↗ Share';
      btn.classList.remove('share-btn--copied');
      btn.disabled = false;
    }, 2500);

    // Show usage nudge when approaching free tier limit
    if (collectionsUsed != null && freeLimit != null) {
      const isPro = await checkPro();
      if (!isPro && collectionsUsed >= freeLimit - 1) {
        const remaining = freeLimit - collectionsUsed;
        if (remaining <= 0) {
          showError(`You've used all ${freeLimit} free shares. ✦ Upgrade to Pro for unlimited.`, 4000);
        } else {
          showStatus(`${collectionsUsed} of ${freeLimit} free shares used · ${remaining} left`, 4000);
        }
      }
    }

    return shareUrl;
  } catch (error) {
    debugLog('Error', 'Share failed', { error: error.message });
    showError(error.message);
    btn.textContent = '↗ Share';
    btn.disabled = false;
    return null;
  }
}

// ─── Spaced Revisit (legacy bookmark-level, backward compat) ──────────────────
function isDueForReview(bookmark) {
  if (!bookmark.reviewSchedule?.length || !bookmark.createdAt) return false;
  const created      = new Date(bookmark.createdAt).getTime();
  const now          = Date.now();
  const lastReviewed = bookmark.lastReviewed ? new Date(bookmark.lastReviewed).getTime() : 0;
  return bookmark.reviewSchedule.some(days => {
    const dueAt = created + days * 86400000;
    return now >= dueAt && lastReviewed < dueAt;
  });
}

async function markReviewed(videoId, bookmarkId) {
  const bookmarks = await getVideoBookmarks(videoId);
  const updated   = bookmarks.map(b =>
    b.id === bookmarkId ? { ...b, lastReviewed: new Date().toISOString() } : b
  );
  await saveVideoBookmarks(videoId, updated);
}

// ─── Video-level Revisit Reminders ────────────────────────────────────────────
function remKey(videoId) { return `rem_${videoId}`; }

async function getRevisitReminder(videoId) {
  const data = await new Promise(resolve => chrome.storage.sync.get(remKey(videoId), resolve));
  return data[remKey(videoId)] || null;
}

async function setRevisitReminder(videoId, videoTitle, intervalDays) {
  const nextRevisitDate = new Date(Date.now() + intervalDays * 86400000).toISOString();
  await new Promise(resolve =>
    chrome.storage.sync.set({ [remKey(videoId)]: { videoId, videoTitle, intervalDays, nextRevisitDate, createdAt: new Date().toISOString() } }, resolve)
  );
}

async function clearRevisitReminder(videoId) {
  await new Promise(resolve => chrome.storage.sync.remove(remKey(videoId), resolve));
}

async function advanceRevisitReminder(videoId) {
  const rem = await getRevisitReminder(videoId);
  if (!rem) return;
  const nextRevisitDate = new Date(Date.now() + rem.intervalDays * 86400000).toISOString();
  await new Promise(resolve =>
    chrome.storage.sync.set({ [remKey(videoId)]: { ...rem, nextRevisitDate } }, resolve)
  );
}

async function loadRevisitReminderPanel(videoId, videoTitle) {
  const panel = document.getElementById('revisit-reminder-panel');
  if (!panel) return;

  const rem = await getRevisitReminder(videoId);
  if (rem) {
    const due  = new Date(rem.nextRevisitDate);
    const diff = Math.ceil((due - Date.now()) / 86400000);
    const label = diff <= 0 ? 'Due now' : diff === 1 ? 'Tomorrow' : `In ${diff} days`;
    panel.innerHTML = `
      <div class="rr-active">
        <span class="rr-icon">🔔</span>
        <span class="rr-label">Every <strong>${rem.intervalDays}d</strong> · ${label}</span>
        <button class="rr-change" id="rr-change-btn">Change</button>
        <button class="rr-clear" id="rr-clear-btn">✕</button>
      </div>`;
    panel.querySelector('#rr-clear-btn').addEventListener('click', async () => {
      await clearRevisitReminder(videoId);
      loadRevisitReminderPanel(videoId, videoTitle);
    });
    panel.querySelector('#rr-change-btn').addEventListener('click', () => showReminderInput(panel, videoId, videoTitle, rem.intervalDays));
  } else {
    showReminderInput(panel, videoId, videoTitle, null);
  }
}

function showReminderInput(panel, videoId, videoTitle, currentDays) {
  panel.innerHTML = `
    <div class="rr-set">
      <span class="rr-icon">🔔</span>
      <span class="rr-set-label">Remind every</span>
      <input id="rr-days-input" class="rr-days-input" type="number" min="1" max="365" value="${currentDays || 7}" placeholder="days">
      <span class="rr-set-label">days</span>
      <button class="rr-set-btn" id="rr-set-btn">Set</button>
      ${currentDays ? '<button class="rr-clear" id="rr-cancel-btn">Cancel</button>' : ''}
    </div>`;
  panel.querySelector('#rr-set-btn').addEventListener('click', async () => {
    const days = parseInt(panel.querySelector('#rr-days-input').value);
    if (!days || days < 1) return;
    await setRevisitReminder(videoId, videoTitle, days);
    loadRevisitReminderPanel(videoId, videoTitle);
  });
  panel.querySelector('#rr-cancel-btn')?.addEventListener('click', () => loadRevisitReminderPanel(videoId, videoTitle));
}

async function loadSpacedRevision() {
  const section = document.getElementById('revision-today');
  if (!section) return;

  const allData = await new Promise(resolve => chrome.storage.sync.get(null, resolve));

  // Video-level reminders
  const dueReminders = [];
  for (const [key, val] of Object.entries(allData)) {
    if (key.startsWith('rem_') && val?.nextRevisitDate) {
      if (new Date(val.nextRevisitDate) <= new Date()) dueReminders.push(val);
    }
  }

  // Legacy bookmark-level spaced revisit (backward compat)
  const dueBookmarks = [];
  for (const [key, val] of Object.entries(allData)) {
    if (key.startsWith('bm_') && Array.isArray(val)) {
      val.forEach(b => { if (isDueForReview(b)) dueBookmarks.push(b); });
    }
  }

  const total = dueReminders.length + dueBookmarks.length;
  if (total === 0) { section.style.display = 'none'; return; }

  section.style.display = 'block';
  section.innerHTML = `
    <div class="revision-today-header">
      <span class="revision-today-title">📚 Revisit Today</span>
      <span class="revision-today-count">${total}</span>
    </div>
    <div class="revision-today-list">
      ${dueReminders.map(r => `
        <div class="revision-item rr-due-item" data-video-id="${r.videoId}">
          <span class="revision-ts">🎬</span>
          <span class="revision-desc">${r.videoTitle || r.videoId}</span>
        </div>`).join('')}
      ${dueBookmarks.slice(0, 5 - dueReminders.length).map(b => `
        <div class="revision-item" data-video-id="${b.videoId}" data-timestamp="${b.timestamp}" data-id="${b.id}">
          <span class="revision-ts">${formatTimestamp(b.timestamp)}</span>
          <span class="revision-desc">${b.description || 'No note'}</span>
        </div>`).join('')}
      ${total > 5 ? `<div class="revision-more">+${total - 5} more in dashboard</div>` : ''}
    </div>
  `;

  section.querySelectorAll('.rr-due-item').forEach(el => {
    el.addEventListener('click', async () => {
      const isPro = await checkPro();
      if (!isPro) {
        showError('▶ Revisit Mode is a Pro feature. Upgrade to Clipmark Pro.', 4000);
        chrome.tabs.create({ url: `${API_BASE}/upgrade` });
        return;
      }
      const { videoId } = el.dataset;
      await advanceRevisitReminder(videoId);
      chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}` });
      loadSpacedRevision();
    });
  });

  section.querySelectorAll('.revision-item:not(.rr-due-item)').forEach(el => {
    el.addEventListener('click', async () => {
      const { videoId, timestamp, id } = el.dataset;
      await markReviewed(videoId, parseInt(id));
      const tab = await getCurrentTab();
      if (tab?.url?.includes(`youtube.com/watch?v=${videoId}`)) {
        await handleBookmarkClick(tab, timestamp);
      } else {
        chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(parseFloat(timestamp))}` });
      }
    });
  });
}

// ─── UI helpers ───────────────────────────────────────────────────────────────
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

// ─── Render bookmarks in popup ────────────────────────────────────────────────
async function loadBookmarks() {
  try {
    const tab = await getCurrentTab();
    if (!tab.url.includes('youtube.com/watch')) return;

    const videoId = extractVideoId(tab.url);
    if (!videoId) return;

    // Update video title context
    const videoTitles = await getVideoTitles();
    const titleEl = document.querySelector('#video-title span');
    if (titleEl && videoTitles[videoId]) {
      titleEl.className = '';
      titleEl.textContent = videoTitles[videoId];
    }

    // Load revisit reminder panel for this video
    loadRevisitReminderPanel(videoId, videoTitles[videoId] || '');

    // Update timestamp preview
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

    const list = document.getElementById('bookmark-list');
    
    if (bookmarks.length === 0) {
      list.innerHTML = `
        <div class="no-bookmarks">
          No bookmarks yet.<br>
          <span class="no-bookmarks-hint">Save important moments from YouTube videos<br>so you can revisit them later.</span>
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
                `<span class="tag-badge" style="background:${getTagColor([t])}">${t}</span>`
              ).join('')}</div>`
            : ''}
        </div>
        <button class="copy-link" data-video-id="${videoId}" data-timestamp="${b.timestamp}" aria-label="Copy link" title="Copy timestamped link">⎘</button>
        <button class="delete-bookmark" aria-label="Delete bookmark">&times;</button>
      </div>
    `).join('');

    list.querySelectorAll('.bookmark').forEach(el => {
      const id        = el.dataset.id;
      const vId       = el.dataset.videoId;
      const timestamp = el.dataset.timestamp;

      // Copy link
      el.querySelector('.copy-link').addEventListener('click', async e => {
        e.stopPropagation();
        const url = `https://www.youtube.com/watch?v=${vId}&t=${Math.floor(parseFloat(timestamp))}`;
        await navigator.clipboard.writeText(url);
        showStatus('Link copied!');
      });

      // Delete
      el.querySelector('.delete-bookmark').addEventListener('click', async e => {
        e.stopPropagation();
        await deleteBookmark(vId, id);
      });

      // Navigate on row click (not on desc or delete)
      el.addEventListener('click', async e => {
        if (e.target.classList.contains('delete-bookmark') ||
            e.target.classList.contains('bookmark-desc')) return;
        const currentTab = await getCurrentTab();
        await handleBookmarkClick(currentTab, timestamp);
      });

      // Inline edit on description click
      el.querySelector('.bookmark-desc').addEventListener('click', e => {
        e.stopPropagation();
        const descEl  = e.currentTarget;
        const current = descEl.textContent;

        const input = document.createElement('input');
        input.type      = 'text';
        input.className = 'bookmark-edit-input';
        input.value     = (current === 'No description' || current.startsWith('Bookmark at')) ? '' : current;
        descEl.replaceWith(input);
        input.focus();
        input.select();

        const save = () => {
          const val = input.value.trim() || `Bookmark at ${formatTimestamp(parseFloat(timestamp))}`;
          updateBookmarkDescription(vId, id, val);
        };

        const blurHandler = () => {
          save();
          input.removeEventListener('blur', blurHandler);
        };

        input.addEventListener('blur', blurHandler);
        input.addEventListener('keydown', e => {
          if (e.key === 'Enter')  { e.preventDefault(); input.removeEventListener('blur', blurHandler); save(); }
          if (e.key === 'Escape') { input.removeEventListener('blur', blurHandler); loadBookmarks(); }
        });
      });
    });
  } catch (error) {
    debugLog('Error', 'Failed to load bookmarks', { error: error.message });
    showError('Failed to load bookmarks: ' + error.message);
  }
}

async function handleBookmarkClick(tab, timestamp) {
  try {
    await waitForContentScript(tab.id);
    await sendMessageToTab(tab.id, { action: 'setTimestamp', timestamp: parseFloat(timestamp) });
  } catch (error) {
    showError('Failed to navigate to timestamp: ' + error.message);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function loadAuthState() {
  const { bmUser } = await syncGet({ bmUser: null });
  const signinBtn  = document.getElementById('signin-btn');
  const userChip   = document.getElementById('user-chip');
  if (!signinBtn || !userChip) return;

  const upgradeBtn  = document.getElementById('upgrade-btn');
  const signoutBtn  = document.getElementById('signout-btn');

  if (bmUser) {
    signinBtn.style.display  = 'none';
    userChip.style.display   = '';
    userChip.textContent     = bmUser.userEmail?.split('@')[0] || 'Signed in';
    userChip.title           = bmUser.userEmail || '';
    if (signoutBtn) signoutBtn.style.display = '';
    if (upgradeBtn) upgradeBtn.style.display = bmUser.isPro ? 'none' : '';

    // Silently validate/refresh token — sign out if session is fully expired
    const token = await getValidToken();
    if (!token) {
      await new Promise(resolve => chrome.storage.sync.remove('bmUser', resolve));
      loadAuthState();
    }
  } else {
    signinBtn.style.display  = '';
    userChip.style.display   = 'none';
    if (signoutBtn) signoutBtn.style.display = 'none';
    if (upgradeBtn) upgradeBtn.style.display = '';  // always show for signed-out users
  }
}

// ─── Onboarding Tour ──────────────────────────────────────────────────────────
async function initOnboardingTour() {
  const { onboardingDone } = await new Promise(resolve =>
    chrome.storage.local.get({ onboardingDone: false }, resolve)
  );
  if (onboardingDone) return;

  const overlay = document.getElementById('onboarding-overlay');
  if (!overlay) return;
  overlay.style.display = 'flex';

  const showStep = (n) => {
    [1, 2, 3].forEach(i => {
      const el = document.getElementById(`onb-step-${i}`);
      if (el) el.style.display = i === n ? 'flex' : 'none';
    });
  };

  const dismiss = async () => {
    overlay.style.display = 'none';
    await chrome.storage.local.set({ onboardingDone: true });
  };

  showStep(1);
  document.getElementById('onb-next-1').addEventListener('click', () => showStep(2));
  document.getElementById('onb-next-2').addEventListener('click', () => showStep(3));
  document.getElementById('onb-done').addEventListener('click', dismiss);
  document.getElementById('onb-skip').addEventListener('click', dismiss);
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  debugLog('Init', 'Popup opened');

  const tab = await getCurrentTab().catch(() => null);
  if (tab) await migrateToSync(tab.id).catch(() => {});

  initOnboardingTour();
  loadBookmarks();
  loadSpacedRevision();

  // Pre-warm transcript cache while the popup is loading
  getCurrentTab().then(t => {
    if (t?.url?.includes('youtube.com/watch')) {
      sendMessageToTab(t.id, { action: 'prefetchTranscript' }).catch(() => {});
    }
  }).catch(() => {});

  loadAuthState();

  // ── Theme Toggle (hidden) ────────────────────────────────────────────────────
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

  // Refresh auth state live when sign-in completes in another tab
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.bmUser) loadAuthState();
  });

  // Quick tag chips
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

  document.getElementById('summarize-btn').addEventListener('click', summarizeBookmarks);
  document.getElementById('summary-close').addEventListener('click', () => {
    document.getElementById('summary-panel').style.display = 'none';
  });

  // Social post panel
  let lastShareUrl = null;

  document.getElementById('post-btn').addEventListener('click', async () => {
    const panel = document.getElementById('social-panel');
    if (panel.style.display !== 'none') { panel.style.display = 'none'; return; }

    // Pro gate
    const isPro = await checkPro();
    if (!isPro) { showUpgradePrompt('Post Insights'); return; }

    // Reset output pane
    document.getElementById('social-output').style.display = 'none';
    document.querySelectorAll('.social-platform-btn').forEach(b => b.classList.remove('active'));
    panel.style.display = 'block';
  });

  document.getElementById('social-close').addEventListener('click', () => {
    document.getElementById('social-panel').style.display = 'none';
  });

  document.querySelectorAll('.social-platform-btn').forEach(btn => {
    btn.addEventListener('click', () => generateSocialPost(btn.dataset.platform, lastShareUrl));
  });

  document.getElementById('social-copy-btn').addEventListener('click', async () => {
    const text = document.getElementById('social-post-text').value;
    await navigator.clipboard.writeText(text);
    const btn = document.getElementById('social-copy-btn');
    btn.textContent = 'Copied ✓';
    setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
  });

  document.getElementById('share-btn').addEventListener('click', async () => {
    const url = await shareBookmarks();
    if (url) lastShareUrl = url;
  });

  document.getElementById('signin-btn').addEventListener('click', async () => {
    const tab = await getCurrentTab().catch(() => null);
    if (!tab) return;
    const url = `${API_BASE}/signin?extensionId=${chrome.runtime.id}`;
    chrome.tabs.create({ url });
  });

  document.getElementById('upgrade-btn').addEventListener('click', () => {
    chrome.tabs.create({ url: `${API_BASE}/upgrade` });
  });

  document.getElementById('signout-btn').addEventListener('click', async () => {
    await new Promise(resolve => chrome.storage.sync.remove('bmUser', resolve));
    loadAuthState();
  });

  // ── Auto-fill from transcript ──────────────────────────────────────────────
  document.getElementById('auto-fill-btn').addEventListener('click', async () => {
    const btn   = document.getElementById('auto-fill-btn');
    const input = document.getElementById('description');
    try {
      const tab = await getCurrentTab();
      if (!tab.url.includes('youtube.com/watch')) return;

      btn.textContent = '…';
      btn.disabled    = true;

      await waitForContentScript(tab.id);
      const tsRes = await sendMessageToTab(tab.id, { action: 'getTimestamp' });
      if (!tsRes?.timestamp) throw new Error('no timestamp');

      const txRes = await sendMessageToTab(tab.id, {
        action:    'getTranscriptAtTimestamp',
        timestamp: tsRes.timestamp,
      });

      if (txRes?.text) {
        input.value = txRes.text;
        input.focus();
        input.select();
        btn.textContent = '✓';
        btn.classList.add('auto-fill-btn--done');
        suggestTags(txRes.text, txRes.text);
      } else {
        const chRes = await sendMessageToTab(tab.id, { action: 'getCurrentChapter' }).catch(() => null);
        if (chRes?.chapter) {
          input.value = chRes.chapter;
          input.focus();
          input.select();
          btn.textContent = '✓';
          btn.classList.add('auto-fill-btn--done');
          suggestTags(chRes.chapter);
        } else {
          btn.textContent = 'No transcript';
        }
      }
    } catch {
      btn.textContent = '✦ Auto';
    } finally {
      setTimeout(() => {
        btn.textContent = '✦ Auto';
        btn.classList.remove('auto-fill-btn--done');
        btn.disabled = false;
      }, 1800);
    }
  });

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
      debugLog('Error', 'Failed to add bookmark', { error: error.message });
      showError(error.message);
    }
  });

  document.getElementById('view-all-bookmarks').addEventListener('click', e => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/bookmarks.html') });
  });
});
