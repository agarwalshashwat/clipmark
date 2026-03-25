// API_BASE is defined in config.js (loaded via <script> tag before this file)

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

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function debugLog(category, message, data = null) {
  console.log(`[SidePanel][${category}][${new Date().toISOString()}] ${message}`, data ?? '');
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
  await pullFromCloud(videoId);
  return getVideoBookmarksLocal(videoId);
}

async function saveVideoBookmarks(videoId, bookmarks) {
  await syncSet({ [bmKey(videoId)]: bookmarks });
  // Cloud sync: push to backend if signed in
  try {
    const token = await getValidToken();
    if (token) {
      const res = await fetch(`${API_BASE}/api/bookmarks`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ videoId, bookmarks }),
      });
      if (res.status === 403) {
        // Server says not Pro — sync local flag so UI reflects reality
        const { bmUser } = await syncGet({ bmUser: null });
        if (bmUser) await syncSet({ bmUser: { ...bmUser, isPro: false } });
      }
    }
  } catch {
    // Best-effort cloud sync
  }
}

async function pullFromCloud(videoId) {
  try {
    const token = await getValidToken();
    if (!token) return;
    const res = await fetch(`${API_BASE}/api/bookmarks?videoId=${encodeURIComponent(videoId)}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
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

    await waitForContentScript(tab.id);

    // Duplicate check
    const existing = await getVideoBookmarks(bookmark.videoId);
    if (existing.some(b => Math.floor(b.timestamp) === Math.floor(bookmark.timestamp))) {
      showError('Bookmark already exists.');
      return;
    }

    const videoTitles = await getVideoTitles();

    // Auto-fill description if empty
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

    const tags = parseTags(description);
    const color = getTagColor(tags);

    const bookmarks = await getVideoBookmarks(bookmark.videoId);
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
    debugLog('Bookmarks', 'Saved bookmark', { description, tags });

    // Visual feedback
    try { await sendMessageToTab(tab.id, { action: 'showSaveFlash' }); } catch {}

    document.getElementById('description').value = '';
    document.getElementById('tag-suggestions').style.display = 'none';
    showStatus('Bookmark saved ✓');

    await loadBookmarks();
    try { await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' }); } catch {}
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
    try { await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' }); } catch {}
  } catch (error) {
    showError('Failed to delete bookmark: ' + error.message);
  }
}

async function updateBookmarkDescription(videoId, bookmarkId, newDescription) {
  try {
    const bookmarks = await getVideoBookmarks(videoId);
    const updated = bookmarks.map(b => {
      if (b.id !== parseInt(bookmarkId)) return b;
      const tags = parseTags(newDescription);
      const color = getTagColor(tags);
      return { ...b, description: newDescription, tags, color };
    });
    await saveVideoBookmarks(videoId, updated);
    await loadBookmarks();
    try {
      const tab = await getCurrentTab();
      await sendMessageToTab(tab.id, { action: 'bookmarkUpdated' });
    } catch {}
  } catch (error) {
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

    if (!response.ok) throw new Error('Server error');

    const { shareId } = await response.json();
    const shareUrl = `${API_BASE}/v/${shareId}`;

    await navigator.clipboard.writeText(shareUrl);

    btn.textContent = '✓ Copied!';
    setTimeout(() => {
      btn.textContent = '↗ Share';
      btn.disabled = false;
    }, 2500);

    return shareUrl;
  } catch (error) {
    debugLog('Error', 'Share failed', { error: error.message });
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
    let result = null;

    if (availability === 'available') {
      // Local AI — works for everyone, no cost
      btn.textContent = '…';
      btn.disabled = true;
      try { result = await localSummarizeBookmarks(bookmarks, videoTitle); } catch { /* fall through to cloud */ }

    } else if (availability === 'downloading') {
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
      btn.textContent = '…';
      btn.disabled = true;
      const response = await fetch(`${API_BASE}/api/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookmarks, videoTitle }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Server error');
      }
      result = await response.json();
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
async function loadComments(videoId) {
  const list = document.getElementById('comment-list');
  if (!list) return;

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

    list.innerHTML = comments.map(c => {
      const initials = (c.author || '?').charAt(0).toUpperCase();
      const likesText = c.likeCount > 0
        ? `<span class="comment-likes">♥ ${c.likeCount.toLocaleString()}</span>`
        : '';
      return `
        <div class="comment-card">
          <div class="comment-header">
            <div class="comment-avatar">${initials}</div>
            <span class="comment-author">${escapeHtml(c.author)}</span>
            ${likesText}
          </div>
          <p class="comment-text">${sanitizeCommentHtml(c.text)}</p>
        </div>
      `;
    }).join('');
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

// ─── Load Bookmarks ───────────────────────────────────────────────────────────
async function loadBookmarks() {
  try {
    const tab = await getCurrentTab();
    if (!tab.url.includes('youtube.com/watch')) return;

    const videoId = extractVideoId(tab.url);
    if (!videoId) return;

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
        const url = `https://www.youtube.com/watch?v=${vId}&t=${Math.floor(parseFloat(timestamp))}`;
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
    debugLog('Error', 'Failed to load bookmarks', { error: error.message });
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
    signinBtn.style.display  = 'none';
    userChip.style.display   = '';
    userChip.textContent     = bmUser.userEmail?.split('@')[0] || 'Signed in';
    userChip.title           = bmUser.userEmail || '';
    if (signoutBtn) signoutBtn.style.display = '';

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
  }
}

// ─── Initialize ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  debugLog('Init', 'Side panel opened');

  loadBookmarks();
  loadAuthState();

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
  let lastCommentVideoId = null;
  document.getElementById('tab-bookmarks').addEventListener('click', () => {
    document.getElementById('tab-bookmarks').classList.add('sp-tab--active');
    document.getElementById('tab-comments').classList.remove('sp-tab--active');
    document.getElementById('bookmarks-panel').style.display = '';
    document.getElementById('comments-panel').style.display = 'none';
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
      if (videoId) loadComments(videoId);
      else document.getElementById('comment-list').innerHTML = '<div class="no-bookmarks">Open a YouTube video first.</div>';
    }
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
      debugLog('Error', 'Failed to add bookmark', { error: error.message });
      showError(error.message);
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
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/bookmarks.html') });
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
      debugLog('Storage', 'Change detected, reloading bookmarks');
      loadBookmarks();
      if (changes.bmUser) loadAuthState();
    }
  });

  // Reload bookmarks when tab changes
  chrome.tabs.onActivated.addListener(() => {
    debugLog('Tabs', 'Tab activated, reloading bookmarks');
    loadBookmarks();
  });
});

// Auto-refresh when YouTube SPA navigates to a new video
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'ytVideoChanged') {
    debugLog('Nav', 'YouTube video changed, reloading', { videoId: msg.videoId });
    loadBookmarks();
  }
});
