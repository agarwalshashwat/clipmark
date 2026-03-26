// ─── Debug ────────────────────────────────────────────────────────────────────
function debugLog(category, message, data = null) {
  console.log(`[ContentScript][${category}][${new Date().toISOString()}] ${message}`, data ?? '');
}

debugLog('Init', 'Content script loading');

// ─── State ────────────────────────────────────────────────────────────────────
let video = null;
let progressBar = null;
let isInitialized = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY = 1000;

// ─── Revision mode state ──────────────────────────────────────────────────────
let revisionState = null; // { segments, index, countdownTimer }

let titleSaveTimer = null;
const savedTitlesCache = {}; // avoid redundant sync writes

// ─── Resume playback state ────────────────────────────────────────────────────
let progressSaveTimer = null;

// ─── Transcript state ─────────────────────────────────────────────────────────
let cachedTranscript       = null; // null = not fetched yet, [] = fetched but empty
let transcriptFetchPromise = null;
let cachedTranscriptVideoId = null;

// ─── Tag colours (must match popup.js) ───────────────────────────────────────
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

function bmKey(videoId) { return `bm_${videoId}`; }

// ─── Extension context guard ──────────────────────────────────────────────────
// After an extension reload/update the content script keeps running but
// chrome.storage / chrome.runtime calls throw "Extension context invalidated".
// Call this before any Chrome API usage in observer/timer callbacks.
function isContextValid() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

// ─── Format helpers ───────────────────────────────────────────────────────────
function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// ─── Video observer ───────────────────────────────────────────────────────────
function initializeVideoObserver() {
  debugLog('Observer', 'Setting up video observer');
  const observer = new MutationObserver(() => {
    if (!video) {
      video = document.querySelector('video');
      if (video) {
        debugLog('Video', 'Video element found', { duration: video.duration });
        initializeProgressBar();
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

// ─── Progress bar ─────────────────────────────────────────────────────────────
function initializeProgressBar() {
  debugLog('ProgressBar', 'Setting up progress bar observer');
  const observer = new MutationObserver(() => {
    progressBar = document.querySelector('.ytp-progress-bar');
    if (progressBar && !document.querySelector('.yt-bookmark-markers')) {
      debugLog('ProgressBar', 'Progress bar found, setting up markers');
      setupBookmarkMarkers();
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
}

function setupBookmarkMarkers() {
  debugLog('Markers', 'Creating markers container');
  const container = document.createElement('div');
  container.className = 'yt-bookmark-markers';
  container.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;';
  progressBar.appendChild(container);
  updateBookmarkMarkers();
  setupPlayerBookmarkButton();

  // Pre-warm transcript cache now that the player is ready
  fetchTranscript().catch(() => {});

  // Check if dashboard requested revision mode for this video
  const currentVideoId = new URLSearchParams(window.location.search).get('v');
  chrome.storage.local.get({ pendingRevision: null }, r => {
    if (r.pendingRevision?.videoId === currentVideoId && r.pendingRevision.bookmarks?.length) {
      chrome.storage.local.remove('pendingRevision');
      setTimeout(() => startRevisionMode(r.pendingRevision.bookmarks), 800);
    }
  });

  video.addEventListener('durationchange', () => {
    debugLog('Video', 'Duration changed', { duration: video.duration });
    updateBookmarkMarkers();
  });

  // Track watch position for resume-playback (debounced to once per 10s)
  video.addEventListener('timeupdate', () => {
    if (progressSaveTimer) return;
    progressSaveTimer = setTimeout(() => {
      progressSaveTimer = null;
      saveProgress();
    }, 10000);
  });
}

// ─── Player bookmark button ───────────────────────────────────────────────────
function setupPlayerBookmarkButton() {
  if (document.querySelector('.yt-bookmark-player-btn')) return;

  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) return;

  const btn = document.createElement('button');
  btn.className  = 'ytp-button yt-bookmark-player-btn';
  btn.title      = 'Bookmark this moment (Alt+S)';
  btn.innerHTML  = `<svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
    <path d="M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z" fill="currentColor"/>
  </svg>`;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    silentSaveBookmark();
  });

  // Insert before the first button in right-controls (settings gear or similar)
  controls.insertBefore(btn, controls.firstChild);
  debugLog('PlayerBtn', 'Bookmark button injected');
}

// ─── Marker clustering ────────────────────────────────────────────────────────
function clusterBookmarks(bookmarks, duration) {
  if (bookmarks.length <= 8 || !duration) return bookmarks.map(b => ({ ...b, isCluster: false }));

  const sorted    = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);
  const threshold = duration * 0.008; // 0.8% of video duration
  const result    = [];
  let i = 0;

  while (i < sorted.length) {
    const group = [sorted[i]];
    let j = i + 1;
    while (j < sorted.length && sorted[j].timestamp - sorted[i].timestamp < threshold) {
      group.push(sorted[j]);
      j++;
    }
    if (group.length === 1) {
      result.push({ ...group[0], isCluster: false });
    } else {
      const mid   = group[Math.floor(group.length / 2)];
      const label = `×${group.length}: ` + group.map(b => `${formatTimestamp(b.timestamp)} — ${b.description || 'No description'}`).join(' | ');
      result.push({ ...mid, isCluster: true, clusterCount: group.length, clusterLabel: label });
    }
    i = j;
  }
  return result;
}

// ─── Render markers ───────────────────────────────────────────────────────────
function updateBookmarkMarkers() {
  if (!isContextValid()) return;
  video = document.querySelector('video') || video;
  if (!video || !progressBar) return;

  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return;

  chrome.storage.sync.get({ [bmKey(videoId)]: [] }, result => {
    const container = document.querySelector('.yt-bookmark-markers');
    if (!container) return;

    container.innerHTML = '';
    const bookmarks = result[bmKey(videoId)];
    debugLog('Markers', 'Rendering markers', { count: bookmarks.length });

    const duration = video.duration;
    const items = clusterBookmarks(bookmarks, duration);
    items.forEach(bookmark => {
      const color = bookmark.color || getTagColor(bookmark.tags || []);

      const marker = document.createElement('div');
      marker.className = bookmark.isCluster ? 'yt-bookmark-marker yt-bookmark-cluster' : 'yt-bookmark-marker';
      marker.setAttribute('data-timestamp', bookmark.timestamp);
      marker.setAttribute('data-description', bookmark.isCluster
        ? bookmark.clusterLabel
        : `${formatTimestamp(bookmark.timestamp)} — ${bookmark.description || 'No description'}`);

      marker.style.left            = `${(bookmark.timestamp / duration) * 100}%`;
      marker.style.backgroundColor = color;
      marker.style.boxShadow       = `0 0 4px ${color}80`;
      marker.style.pointerEvents   = 'auto';
      if (bookmark.isCluster) marker.style.width = '5px';

      marker.addEventListener('click', () => {
        debugLog('Marker', 'Clicked', { timestamp: bookmark.timestamp });
        marker.classList.add('clicked');
        video.currentTime = bookmark.timestamp;
        setTimeout(() => marker.classList.remove('clicked'), 600);
      });

      container.appendChild(marker);
    });
  });
}

// ─── Transcript ───────────────────────────────────────────────────────────────
async function fetchTranscript() {
  const videoId = new URLSearchParams(window.location.search).get('v');

  // Invalidate cache when video changes (YouTube is a SPA)
  if (videoId !== cachedTranscriptVideoId) {
    cachedTranscript       = null;
    transcriptFetchPromise = null;
    cachedTranscriptVideoId = videoId;
  }

  if (cachedTranscript !== null) return cachedTranscript;
  if (transcriptFetchPromise)    return transcriptFetchPromise;

  transcriptFetchPromise = (async () => {
    try {
      const ytData = window.ytInitialPlayerResponse;
      const tracks = ytData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;

      if (!tracks) {
        // ytInitialPlayerResponse not ready yet — don't cache, allow retry
        debugLog('Transcript', 'Captions data not available yet, will retry on next call');
        cachedTranscript = null;
        transcriptFetchPromise = null;
        return [];
      }

      if (tracks.length === 0) {
        debugLog('Transcript', 'No caption tracks available for this video');
        cachedTranscript = [];
        return [];
      }

      // Prefer English auto-generated → English manual → any auto → first track
      const track =
        tracks.find(t => t.languageCode === 'en' && t.kind === 'asr') ||
        tracks.find(t => t.languageCode === 'en') ||
        tracks.find(t => t.kind === 'asr') ||
        tracks[0];

      if (!track?.baseUrl) {
        cachedTranscript = [];
        return [];
      }

      debugLog('Transcript', 'Fetching', { lang: track.languageCode, kind: track.kind });

      const res = await fetch(`${track.baseUrl}&fmt=json3`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      // YouTube json3 format: { events: [{ tStartMs, dDurationMs, segs: [{ utf8 }] }] }
      const segments = (data.events || [])
        .filter(e => e.segs && e.segs.length > 0)
        .map(e => ({
          start: e.tStartMs / 1000,
          end:   (e.tStartMs + (e.dDurationMs || 0)) / 1000,
          text:  e.segs.map(s => (s.utf8 || '').replace(/\n/g, ' ')).join('').trim(),
        }))
        .filter(s => s.text && s.text !== '\u200b');

      cachedTranscript = segments;
      debugLog('Transcript', `Loaded ${segments.length} segments`);
      return segments;
    } catch (error) {
      debugLog('Transcript', 'Failed to fetch', { error: error.message });
      cachedTranscript = [];
      return [];
    }
  })();

  return transcriptFetchPromise;
}

// Return cleaned transcript text for a ~5s window around the given timestamp
function getTextAtTimestamp(transcript, timestamp) {
  if (!transcript || transcript.length === 0) return null;

  // 1s before bookmark → 4s after (captures what's being said at that moment)
  const from = timestamp - 1;
  const to   = timestamp + 4;

  let hits = transcript.filter(s => s.start < to && s.end > from);

  if (hits.length === 0) {
    // Fallback: nearest segment by start time
    hits = [transcript.reduce((best, s) =>
      Math.abs(s.start - timestamp) < Math.abs(best.start - timestamp) ? s : best
    )];
  }

  const combined = hits.map(s => s.text).join(' ').replace(/\s+/g, ' ').trim();
  return cleanTranscriptText(combined);
}

function cleanTranscriptText(text) {
  if (!text) return null;
  let t = text.trim();
  // Capitalize first letter
  t = t.charAt(0).toUpperCase() + t.slice(1);
  // Truncate at word boundary to ~120 chars
  if (t.length > 120) {
    t = t.substring(0, 120).replace(/\s+\S*$/, '') + '…';
  }
  return t || null;
}

// ─── Chapter detection ───────────────────────────────────────────────────────
function getCurrentChapter() {
  const el = document.querySelector('.ytp-chapter-title-content');
  return el ? el.textContent.trim() || null : null;
}

// ─── Silent save (Alt+S) ──────────────────────────────────────────────────────
async function silentSaveBookmark() {
  if (!isContextValid()) return;
  video = document.querySelector('video') || video;
  if (!video) { debugLog('Silent', 'No video element'); return; }

  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) { debugLog('Silent', 'No video ID'); return; }

  const timestamp = video.currentTime;
  const tags      = [];
  const color     = '#4da1ee';

  // Try transcript first, fall back to "Bookmark at M:SS"
  const transcript     = await fetchTranscript().catch(() => null);
  const transcriptText = transcript ? getTextAtTimestamp(transcript, timestamp) : null;
  const chapter     = getCurrentChapter();
  const description = transcriptText || chapter || `Bookmark at ${formatTimestamp(timestamp)}`;

  try {
    const result = await new Promise(resolve =>
      chrome.storage.sync.get({ [bmKey(videoId)]: [], videoTitles: {}, videoDurations: {} }, resolve)
    );
    const bookmarks      = result[bmKey(videoId)];
    const videoTitles    = result.videoTitles;
    const videoDurations = result.videoDurations;

    bookmarks.push({
      id: Date.now(),
      videoId,
      timestamp,
      description,
      tags,
      color,
      createdAt:      new Date().toISOString(),
      videoTitle:     videoTitles[videoId] || null,
      reviewSchedule: [1, 3, 7],
      lastReviewed:   null,
    });

    if (video.duration && !isNaN(video.duration)) videoDurations[videoId] = video.duration;

    await new Promise((resolve, reject) =>
      chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks, videoDurations }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      })
    );

    updateBookmarkMarkers();
    showSaveFlash();
    showSilentSaveIndicator(description);
    const playerBtn = document.querySelector('.yt-bookmark-player-btn');
    if (playerBtn) { playerBtn.classList.add('saving'); setTimeout(() => playerBtn.classList.remove('saving'), 400); }
    debugLog('Silent', 'Saved silent bookmark', { timestamp, description });
  } catch (error) {
    debugLog('Silent', 'Failed', { error: error.message });
  }
}

// ─── Save flash (sparkle screenshot effect) ────────────────────────────────────
function showSaveFlash() {
  const player = document.querySelector('.html5-video-player') ||
                 document.querySelector('#movie_player');
  if (!player) return;

  // Ensure player is positioned so absolute children work
  if (getComputedStyle(player).position === 'static') {
    player.style.position = 'relative';
  }

  const overlay = document.createElement('div');
  overlay.className = 'yt-save-flash';

  const colors = ['#14B8A6', '#5865f2', '#f59e0b', '#ff6b6b', '#22c55e', '#a78bfa'];
  const count  = 10;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('div');
    dot.className = 'yt-save-sparkle';
    const angle  = (i / count) * 360;
    const dist   = 55 + Math.random() * 35;
    const tx     = (Math.cos(angle * Math.PI / 180) * dist).toFixed(1);
    const ty     = (Math.sin(angle * Math.PI / 180) * dist).toFixed(1);
    dot.style.cssText = `
      left: calc(50% - 3px);
      top: calc(50% - 3px);
      --tx: ${tx}px;
      --ty: ${ty}px;
      background: ${colors[i % colors.length]};
      animation-delay: ${i * 25}ms;
    `;
    overlay.appendChild(dot);
  }

  player.appendChild(overlay);
  setTimeout(() => overlay.remove(), 750);
}

function showSilentSaveIndicator(message, type = 'success') {
  const el = document.createElement('div');
  el.className = 'yt-bookmark-toast';
  el.textContent = message;
  if (type === 'error') {
    el.style.borderLeftColor = '#ef4444';
  } else {
    el.style.borderLeftColor = '#14B8A6';
  }
  document.body.appendChild(el);
  // Trigger reflow for animation
  el.getClientRects();
  el.classList.add('yt-bookmark-toast--show');
  setTimeout(() => {
    el.classList.remove('yt-bookmark-toast--show');
    setTimeout(() => el.remove(), 400);
  }, 2000);
}

// ─── Keyboard shortcuts ───────────────────────────────────────────────────────
function handleKeyboardShortcut(event) {
  if (!event.altKey) return;
  if (event.key.toLowerCase() === 'b') {
    try { chrome.runtime.sendMessage({ action: 'openPopup' }); } catch { }
  }
  if (event.key.toLowerCase() === 's') {
    silentSaveBookmark();
  }
}

// ─── Message listener ─────────────────────────────────────────────────────────
function initializeMessageListener() {
  debugLog('Messaging', 'Setting up message listener');
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!isContextValid()) return;
    debugLog('Messaging', 'Received', { action: request.action });

    const handle = async () => {
      if (request.action === 'ping') {
        sendResponse({ status: 'ready' });
        return;
      }
      if (request.action === 'getCurrentTime') {
        const activeVideo = document.querySelector('video') || video;
        sendResponse({ currentTime: activeVideo ? activeVideo.currentTime : 0 });
        return;
      }
      if (request.action === 'getBookmarkData') {
        const activeVideo = document.querySelector('video') || video;
        const titleEl = document.querySelector('h1.ytd-video-primary-info-renderer');
        sendResponse({
          currentTime: activeVideo ? activeVideo.currentTime : 0,
          duration:    activeVideo ? (activeVideo.duration || 0) : 0,
          title: titleEl ? titleEl.textContent.trim() : null
        });
        return;
      }
      if (request.action === 'getCurrentChapter') {
        sendResponse({ chapter: getCurrentChapter() });
        return;
      }
      if (request.action === 'getTranscriptSnippet') {
        const transcript = await fetchTranscript();
        const snippet = getTextAtTimestamp(transcript, request.timestamp);
        sendResponse({ snippet: snippet || null });
        return;
      }
      if (request.action === 'showToast') {
        showSilentSaveIndicator(request.message, request.type);
        sendResponse({});
        return;
      }
      if (request.action === 'showSaveFlash') {
        showSaveFlash();
        sendResponse({});
        return;
      }
      if (request.action === 'getTimestamp') {
        // Always query fresh — YouTube SPA may replace the video element
        const activeVideo = document.querySelector('video') || video;
        if (!activeVideo) throw new Error('Video element not found');
        video = activeVideo; // keep cache fresh
        sendResponse({ timestamp: activeVideo.currentTime, duration: activeVideo.duration || 0 });
        return;
      }
      if (request.action === 'seekTo') {
        const activeVideo = document.querySelector('video') || video;
        if (activeVideo) {
          video = activeVideo;
          activeVideo.currentTime = request.time;
          activeVideo.play().catch(() => {});
        }
        sendResponse({});
        return;
      }
      if (request.action === 'setTimestamp') {
        const activeVideo = document.querySelector('video') || video;
        if (activeVideo) {
          video = activeVideo;
          activeVideo.currentTime = request.timestamp;
          activeVideo.play().catch(() => {});
        }
        sendResponse({});
        return;
      }
      if (request.action === 'bookmarkUpdated') {
        updateBookmarkMarkers();
        sendResponse({});
        return;
      }
      if (request.action === 'startRevision') {
        startRevisionMode(request.bookmarks);
        sendResponse({});
        return;
      }
      if (request.action === 'exitRevision') {
        exitRevisionMode();
        sendResponse({});
        return;
      }
      if (request.action === 'getTranscriptAtTimestamp') {
        const transcript = await fetchTranscript();
        const text       = getTextAtTimestamp(transcript, request.timestamp);
        const hasCaptions = !!window.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks?.length;
        debugLog('Transcript', 'getTranscriptAtTimestamp result', {
          timestamp: request.timestamp,
          segmentCount: transcript.length,
          hasCaptionsInPlayerResponse: hasCaptions,
          textFound: !!text,
        });
        sendResponse({ text: text || null, _debug: { segmentCount: transcript.length, hasCaptions } });
        return;
      }
      if (request.action === 'prefetchTranscript') {
        fetchTranscript(); // fire-and-forget to warm the cache
        sendResponse({});
        return;
      }
    };

    handle().catch(error => {
      debugLog('Messaging', 'Error', { error });
      sendResponse({ error: error.message });
    });

    return true; // keep channel open for async
  });
}

// ─── Video title ──────────────────────────────────────────────────────────────
async function getVideoTitle() {
  const el = document.querySelector('h1.ytd-video-primary-info-renderer');
  return el ? el.textContent.trim() : null;
}

async function saveVideoTitle() {
  if (!isContextValid()) return;
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return;
  const title = await getVideoTitle();
  if (!title) return;

  // Skip write if we already saved this exact title
  if (savedTitlesCache[videoId] === title) return;

  debugLog('Title', 'Saving', { videoId, title });
  const result = await new Promise(resolve => chrome.storage.sync.get({ videoTitles: {} }, resolve));
  const videoTitles = result.videoTitles;
  if (videoTitles[videoId] === title) {
    savedTitlesCache[videoId] = title; // already in storage, just cache it
    return;
  }
  videoTitles[videoId] = title;
  chrome.storage.sync.set({ videoTitles });
  savedTitlesCache[videoId] = title;
}

// ─── Resume playback tracking ─────────────────────────────────────────────────
function saveProgress() {
  if (!isContextValid()) return;
  const activeVideo = document.querySelector('video') || video;
  if (!activeVideo || activeVideo.currentTime < 30) return; // only save past 30s
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) return;
  const key = `resume_${videoId}`;
  chrome.storage.local.set({
    [key]: { time: activeVideo.currentTime, lastWatched: new Date().toISOString() }
  });
}

// ─── Extension reconnect ──────────────────────────────────────────────────────
async function attemptReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return false;
  debugLog('Reconnect', `Attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS}`);
  reconnectAttempts++;
  try {
    await chrome.runtime.sendMessage({ action: 'ping' });
    reconnectAttempts = 0;
    return true;
  } catch {
    await new Promise(r => setTimeout(r, RECONNECT_DELAY));
    return false;
  }
}

// ─── Injected styles ──────────────────────────────────────────────────────────
function injectStyles() {
  debugLog('Styles', 'Injecting marker styles');
  const style = document.createElement('style');
  style.textContent = `
    .yt-bookmark-marker {
      position: absolute;
      width: 3px;
      height: 100%;
      z-index: 2;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .yt-bookmark-marker:hover {
      transform: scaleX(2) scaleY(1.2);
      filter: brightness(1.3);
    }
    .yt-bookmark-marker::before {
      content: '';
      position: absolute;
      top: -2px;
      left: 50%;
      transform: translateX(-50%);
      width: 7px;
      height: 7px;
      background-color: inherit;
      border-radius: 50%;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .yt-bookmark-marker:hover::before {
      opacity: 1;
      transform: translateX(-50%) scale(1.2);
    }
    .yt-bookmark-marker::after {
      content: attr(data-description);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(10px);
      background-color: #2d2d2d;
      color: white;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      visibility: hidden;
      opacity: 0;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      pointer-events: none;
      margin-bottom: 5px;
      z-index: 9999;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      border: 1px solid rgba(255,255,255,0.1);
    }
    .yt-bookmark-marker:hover::after {
      visibility: visible;
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
    .yt-bookmark-marker.clicked {
      animation: bm-ripple 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes bm-ripple {
      0%   { box-shadow: 0 0 0 0 rgba(77,161,238,0.4); }
      100% { box-shadow: 0 0 0 10px rgba(77,161,238,0); }
    }

    /* Silent-save toast */
    .yt-bookmark-toast {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 99999;
      background: rgba(45, 45, 45, 0.92);
      color: white;
      padding: 10px 18px;
      border-radius: 8px;
      font-size: 13px;
      font-family: 'Segoe UI', sans-serif;
      border-left: 3px solid #4da1ee;
      opacity: 0;
      transform: translateY(-8px);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    }
    .yt-bookmark-toast--show {
      opacity: 1;
      transform: translateY(0);
    }
    .yt-bookmark-cluster::after {
      white-space: normal;
      max-width: 300px;
      word-break: break-word;
      font-size: 11px;
    }

    /* Save flash overlay */
    .yt-save-flash {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 999;
      overflow: hidden;
    }
    .yt-save-flash::before {
      content: '';
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,0.28);
      animation: bm-screen-flash 0.55s ease forwards;
    }
    .yt-save-sparkle {
      position: absolute;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      animation: bm-sparkle-out 0.65s ease forwards;
    }
    @keyframes bm-screen-flash {
      0%   { opacity: 0; }
      18%  { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes bm-sparkle-out {
      0%   { transform: scale(0) translate(0, 0); opacity: 1; }
      100% { transform: scale(1.4) translate(var(--tx), var(--ty)); opacity: 0; }
    }

    /* Revision mode overlay */
    .yt-revision-overlay {
      position: fixed;
      top: 80px;
      right: 20px;
      z-index: 999999;
      background: rgba(15, 15, 15, 0.90);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      padding: 14px 18px 12px;
      color: white;
      font-family: 'Segoe UI', system-ui, sans-serif;
      min-width: 190px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    .yt-revision-label {
      font-size: 10px;
      font-weight: 700;
      color: #14B8A6;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .yt-revision-clip {
      font-size: 17px;
      font-weight: 700;
      margin-bottom: 3px;
    }
    .yt-revision-range {
      font-size: 13px;
      color: rgba(255,255,255,0.65);
      font-variant-numeric: tabular-nums;
      margin-bottom: 6px;
    }
    .yt-revision-next {
      font-size: 11px;
      color: #fbbf24;
      min-height: 16px;
    }
    .yt-revision-close {
      position: absolute;
      top: 8px;
      right: 10px;
      background: transparent;
      border: none;
      color: rgba(255,255,255,0.45);
      font-size: 15px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
      transition: color 0.12s;
    }
    .yt-revision-close:hover { color: white; }

    /* Player bookmark button */
    .yt-bookmark-player-btn {
      color: white;
      opacity: 0.9;
      width: 40px !important;
      height: 40px !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 0 !important;
      transition: opacity 0.15s, transform 0.15s;
      vertical-align: middle;
    }
    .yt-bookmark-player-btn:hover {
      opacity: 1;
      transform: scale(1.15);
      color: #14B8A6;
    }
    .yt-bookmark-player-btn.saving {
      animation: bm-pulse 0.4s ease;
    }
    @keyframes bm-pulse {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.3); color: #14B8A6; }
      100% { transform: scale(1); }
    }
  `;
  document.head.appendChild(style);
}

// ─── Revision mode ────────────────────────────────────────────────────────────
function buildRevisionSegments(bookmarks) {
  const sorted = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.map((b, i) => {
    const next = sorted[i + 1];
    const end  = next ? Math.min(next.timestamp, b.timestamp + 60) : b.timestamp + 60;
    return { bookmark: b, start: b.timestamp, end };
  });
}

function startRevisionMode(bookmarks) {
  if (!bookmarks.length) return;
  exitRevisionMode(); // clean up any prior session
  revisionState = { segments: buildRevisionSegments(bookmarks), index: 0, countdownTimer: null };
  playRevisionSegment(0);
}

function playRevisionSegment(index) {
  const v = document.querySelector('video') || video;
  if (!v || !revisionState) return;
  const seg = revisionState.segments[index];
  revisionState.index = index;
  v.currentTime = seg.start;
  v.play().catch(() => {});
  updateRevisionOverlay();
  v.addEventListener('timeupdate', revisionTimeUpdateHandler);
}

function revisionTimeUpdateHandler() {
  const v = document.querySelector('video') || video;
  if (!v || !revisionState) return;
  const seg = revisionState.segments[revisionState.index];
  if (v.currentTime >= seg.end) {
    v.removeEventListener('timeupdate', revisionTimeUpdateHandler);
    advanceRevision();
  }
}

function advanceRevision() {
  if (!revisionState) return;
  const next = revisionState.index + 1;
  if (next >= revisionState.segments.length) {
    exitRevisionMode();
    showSilentSaveIndicator('Revision complete ✓');
    return;
  }
  let countdown = 3;
  updateRevisionCountdown(countdown);
  revisionState.countdownTimer = setInterval(() => {
    countdown--;
    if (countdown <= 0) {
      clearInterval(revisionState.countdownTimer);
      revisionState.countdownTimer = null;
      playRevisionSegment(next);
    } else {
      updateRevisionCountdown(countdown);
    }
  }, 1000);
}

function exitRevisionMode() {
  const v = document.querySelector('video') || video;
  if (v) v.removeEventListener('timeupdate', revisionTimeUpdateHandler);
  if (revisionState?.countdownTimer) clearInterval(revisionState.countdownTimer);
  revisionState = null;
  document.querySelector('.yt-revision-overlay')?.remove();
}

function ensureRevisionOverlay() {
  let overlay = document.querySelector('.yt-revision-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'yt-revision-overlay';
    overlay.innerHTML = `
      <div class="yt-revision-label">🔖 Revision Mode</div>
      <div class="yt-revision-clip"></div>
      <div class="yt-revision-range"></div>
      <div class="yt-revision-next"></div>
      <button class="yt-revision-close">✕</button>
    `;
    overlay.querySelector('.yt-revision-close').addEventListener('click', exitRevisionMode);
    document.body.appendChild(overlay);
  }
  return overlay;
}

function updateRevisionOverlay() {
  if (!revisionState) return;
  const overlay  = ensureRevisionOverlay();
  const seg      = revisionState.segments[revisionState.index];
  const current  = revisionState.index + 1;
  const total    = revisionState.segments.length;
  overlay.querySelector('.yt-revision-clip').textContent  = `Clip ${current} / ${total}`;
  overlay.querySelector('.yt-revision-range').textContent =
    `${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}`;
  overlay.querySelector('.yt-revision-next').textContent  = '';
}

function updateRevisionCountdown(sec) {
  const el = document.querySelector('.yt-revision-next');
  if (el) el.textContent = `Next clip in ${sec}s`;
}

// ─── Initialize ───────────────────────────────────────────────────────────────
function initialize() {
  if (isInitialized) { debugLog('Init', 'Already initialized'); return; }
  debugLog('Init', 'Initializing content script');

  try {
    injectStyles();
    initializeVideoObserver();
    initializeProgressBar();
    initializeMessageListener();
    document.addEventListener('keydown', handleKeyboardShortcut);

    // Debounce title saves — YouTube fires hundreds of DOM mutations per second
    const titleObserver = new MutationObserver(() => {
      clearTimeout(titleSaveTimer);
      titleSaveTimer = setTimeout(() => saveVideoTitle().catch(() => {}), 3000);
    });
    titleObserver.observe(document.body, { subtree: true, childList: true });
    saveVideoTitle().catch(() => {});

    isInitialized = true;
    debugLog('Init', 'Content script initialized successfully');
  } catch (error) {
    debugLog('Init', 'Error during initialization', { error });
    throw error;
  }
}

// Notify background that content script is ready
try {
  chrome.runtime.sendMessage({ action: 'contentScriptReady' }, response => {
    debugLog('Init', 'Sent contentScriptReady', response);
  });
} catch { }

// Detect YouTube SPA navigation and notify the side panel
document.addEventListener('yt-navigate-finish', () => {
  const videoId = new URLSearchParams(window.location.search).get('v');
  if (videoId) {
    try {
      chrome.runtime.sendMessage({ action: 'ytVideoChanged', videoId }).catch(() => {});
    } catch { /* extension context invalidated after reload — ignore */ }
  }
});

// ytInitialPlayerResponse is only populated after yt-page-data-updated fires during SPA navigation.
// Reset transcript cache here so the next fetch reads fresh captions data.
document.addEventListener('yt-page-data-updated', () => {
  debugLog('Transcript', 'yt-page-data-updated — resetting transcript cache');
  cachedTranscript       = null;
  transcriptFetchPromise = null;
  cachedTranscriptVideoId = null;
  fetchTranscript().catch(() => {});
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

window.addEventListener('pagehide', () => {
  debugLog('Cleanup', 'Performing cleanup');
  document.removeEventListener('keydown', handleKeyboardShortcut);
  if (video) video.removeEventListener('durationchange', updateBookmarkMarkers);
  exitRevisionMode();
  if (progressSaveTimer) { clearTimeout(progressSaveTimer); progressSaveTimer = null; }
  saveProgress(); // flush final position on page unload
  isInitialized       = false;
  reconnectAttempts   = 0;
  cachedTranscript    = null;
  transcriptFetchPromise = null;
  cachedTranscriptVideoId = null;
});
