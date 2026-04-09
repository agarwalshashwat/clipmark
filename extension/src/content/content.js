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
// MAX_RECONNECT_ATTEMPTS and RECONNECT_DELAY are defined in constants.js

// ─── Revisit mode state ───────────────────────────────────────────────────────
let revisionState = null; // { segments, index, countdownTimer, speed }

let titleSaveTimer = null;
const savedTitlesCache = {}; // avoid redundant sync writes

// ─── Resume playback state ────────────────────────────────────────────────────
let progressSaveTimer = null;

// ─── Transcript state ─────────────────────────────────────────────────────────
let cachedTranscript       = null; // null = not fetched yet, [] = fetched but empty
let transcriptFetchPromise = null;
let cachedTranscriptVideoId = null;

// TAG_COLORS, parseTags, stringToColor, getTagColor are defined in constants.js

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

  // Create shared tooltip element (once per page)
  if (!document.getElementById('yt-bm-tooltip')) {
    const tt = document.createElement('div');
    tt.id = 'yt-bm-tooltip';
    document.body.appendChild(tt);
  }

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
  // Also track active marker (throttled to ~2.5/sec)
  let activeCheckTimer = null;
  video.addEventListener('timeupdate', () => {
    if (!progressSaveTimer) {
      progressSaveTimer = setTimeout(() => {
        progressSaveTimer = null;
        saveProgress();
      }, 10000);
    }
    if (!activeCheckTimer) {
      activeCheckTimer = setTimeout(() => {
        activeCheckTimer = null;
        updateActiveMarker();
      }, 400);
    }
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
      const mid = group[Math.floor(group.length / 2)];
      result.push({
        ...mid,
        isCluster: true,
        clusterCount: group.length,
        clusterItems: group.map(b => ({
          timestamp: b.timestamp,
          description: b.description || 'No description',
          tags: b.tags || [],
          color: b.color || getTagColor(b.tags || []),
        })),
      });
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

    // Shared tooltip element (created in setupBookmarkMarkers)
    const bmTooltip = document.getElementById('yt-bm-tooltip');

    items.forEach(bookmark => {
      const color = bookmark.color || getTagColor(bookmark.tags || []);

      const marker = document.createElement('div');
      marker.className = 'yt-bookmark-marker';
      marker.setAttribute('data-timestamp', bookmark.timestamp);
      marker.style.left = `${(bookmark.timestamp / duration) * 100}%`;
      marker.style.setProperty('--bm-color', color);
      marker.style.pointerEvents = 'auto';

      // Click → seek
      marker.addEventListener('click', () => {
        debugLog('Marker', 'Clicked', { timestamp: bookmark.timestamp });
        marker.classList.add('clicked');
        video.currentTime = bookmark.timestamp;
        setTimeout(() => marker.classList.remove('clicked'), 600);
      });

      // Hover → rich tooltip
      if (bmTooltip) {
        marker.addEventListener('mouseenter', () => {
          if (bookmark.isCluster) {
            const items = bookmark.clusterItems
              .map(ci => `<div class="yt-bm-tt-cluster-item"><span class="yt-bm-tt-cluster-time">${formatTimestamp(ci.timestamp)}</span>${ci.description.replace(/</g, '&lt;')}</div>`)
              .join('');
            bmTooltip.innerHTML = `<div class="yt-bm-tt-cluster-header">${bookmark.clusterCount} clips nearby</div>${items}`;
          } else {
            const tags = (bookmark.tags || []);
            const tagHtml = tags.length
              ? `<div class="yt-bm-tt-tags">${tags.map(t => {
                  const c = TAG_COLORS[t] || stringToColor(t);
                  return `<span class="yt-bm-tt-tag" style="background:${c}22;color:${c}">${t}</span>`;
                }).join('')}</div>`
              : '';
            const desc = (bookmark.description || '').replace(/</g, '&lt;');
            bmTooltip.innerHTML = `<div class="yt-bm-tt-time">${formatTimestamp(bookmark.timestamp)}</div>${desc ? `<div class="yt-bm-tt-desc">${desc}</div>` : ''}${tagHtml}`;
          }

          // Position with edge clamping
          requestAnimationFrame(() => {
            const tw = bmTooltip.offsetWidth;
            const th = bmTooltip.offsetHeight;
            const rect = marker.getBoundingClientRect();
            const pad = 8;
            let left = rect.left + rect.width / 2 - tw / 2;
            let top  = rect.top - th - 10;
            left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
            if (top < pad) top = rect.bottom + 6;
            bmTooltip.style.left = left + 'px';
            bmTooltip.style.top  = top + 'px';
            bmTooltip.classList.add('visible');
          });
        });

        marker.addEventListener('mouseleave', () => {
          bmTooltip.classList.remove('visible');
        });
      }

      container.appendChild(marker);
    });
  });
}

// ─── Active marker tracking ───────────────────────────────────────────────────
let lastActiveMarker = null;

function updateActiveMarker() {
  if (!video) return;
  const container = document.querySelector('.yt-bookmark-markers');
  if (!container) return;

  const currentTime = video.currentTime;
  const threshold = 1.5;
  let closestMarker = null;
  let closestDist = threshold;

  container.querySelectorAll('.yt-bookmark-marker').forEach(m => {
    const ts = parseFloat(m.getAttribute('data-timestamp'));
    const dist = Math.abs(ts - currentTime);
    if (dist < closestDist) {
      closestDist = dist;
      closestMarker = m;
    }
  });

  if (lastActiveMarker && lastActiveMarker !== closestMarker) {
    lastActiveMarker.classList.remove('yt-bookmark-marker--active');
  }
  if (closestMarker && closestMarker !== lastActiveMarker) {
    closestMarker.classList.add('yt-bookmark-marker--active');
  }
  lastActiveMarker = closestMarker;
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
  if (t.length > TRANSCRIPT_TRUNCATE_LENGTH) {
    t = t.substring(0, TRANSCRIPT_TRUNCATE_LENGTH).replace(/\s+\S*$/, '') + '…';
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
  // Ignore keypresses from text inputs
  const tag = event.target?.tagName?.toLowerCase();
  if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;

  // Alt+B / Alt+S global shortcuts
  if (event.altKey) {
    if (event.key.toLowerCase() === 'b') {
      try { chrome.runtime.sendMessage({ action: 'openPopup' }); } catch { }
    }
    if (event.key.toLowerCase() === 's') {
      silentSaveBookmark();
    }
  }

  // Revisit mode navigation — only when a session is active
  if (!revisionState) return;
  if (event.key === '[') { event.preventDefault(); skipToPrev(); }
  if (event.key === ']') { event.preventDefault(); skipToNext(); }
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
      if (request.action === 'getTranscriptCachedAtTimestamp') {
        // Cache-only — never waits for a network fetch, always returns instantly
        const text = cachedTranscript ? getTextAtTimestamp(cachedTranscript, request.timestamp) : null;
        sendResponse({ text: text || null });
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
      if (request.action === 'startClipDownload') {
        startClipDownload(request.startTime, request.endTime, request.filename);
        sendResponse({ started: true });
        return;
      }
      if (request.action === 'cancelClipDownload') {
        cancelClipDownload();
        sendResponse({});
        return;
      }
      if (request.action === 'updateClipMarkers') {
        updateClipRangeMarker(request.startTime, request.endTime);
        sendResponse({});
        return;
      }
      if (request.action === 'clearClipMarkers') {
        clearClipRangeMarker();
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

// ─── Clip recording ───────────────────────────────────────────────────────────
let clipRecorder     = null;
let clipChunks       = [];
let clipEndTime      = null;
let clipTimeListener = null;
let clipProgressEl   = null;

function cancelClipDownload() {
  if (clipRecorder && clipRecorder.state !== 'inactive') {
    clipRecorder.stop();
  }
  clipRecorder     = null;
  clipChunks       = [];
  clipEndTime      = null;
  if (clipTimeListener) {
    const v = document.querySelector('video') || video;
    if (v) v.removeEventListener('timeupdate', clipTimeListener);
    clipTimeListener = null;
  }
  if (clipProgressEl) {
    clipProgressEl.remove();
    clipProgressEl = null;
  }
  try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'cancelled' }); } catch {}
}

function startClipDownload(startTime, endTime, filename) {
  const activeVideo = document.querySelector('video') || video;
  if (!activeVideo) {
    try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'error', message: 'No video found' }); } catch {}
    return;
  }
  if (clipRecorder && clipRecorder.state !== 'inactive') {
    debugLog('Clip', 'Already recording, cancelling previous');
    cancelClipDownload();
  }

  const duration = endTime - startTime;
  if (duration <= 0 || duration > 3600) {
    try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'error', message: 'Invalid clip duration' }); } catch {}
    return;
  }

  debugLog('Clip', 'Starting clip download', { startTime, endTime, filename });

  // Show recording overlay on the YouTube player
  const player = document.querySelector('.html5-video-player') || document.querySelector('#movie_player');
  if (player) {
    clipProgressEl = document.createElement('div');
    clipProgressEl.className = 'yt-clip-recording-overlay';
    clipProgressEl.innerHTML = `
      <div class="yt-clip-rec-inner">
        <div class="yt-clip-rec-dot"></div>
        <span class="yt-clip-rec-label">Recording clip…</span>
        <span class="yt-clip-rec-time" id="yt-clip-rec-time">0s / ${Math.round(duration)}s</span>
        <button class="yt-clip-rec-cancel" id="yt-clip-rec-cancel">✕ Cancel</button>
      </div>`;
    if (getComputedStyle(player).position === 'static') player.style.position = 'relative';
    player.appendChild(clipProgressEl);
    clipProgressEl.querySelector('#yt-clip-rec-cancel').addEventListener('click', () => {
      cancelClipDownload();
    });
  }

  // Seek to start and play
  activeVideo.currentTime = startTime;
  activeVideo.play().catch(() => {});

  let stream;
  try {
    stream = activeVideo.captureStream();
  } catch (e) {
    debugLog('Clip', 'captureStream failed', { error: e.message });
    if (clipProgressEl) { clipProgressEl.remove(); clipProgressEl = null; }
    try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'error', message: 'captureStream not supported' }); } catch {}
    return;
  }

  // Choose best available MIME type
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || '';
  clipChunks = [];
  clipEndTime = endTime;

  try {
    clipRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
  } catch (e) {
    debugLog('Clip', 'MediaRecorder init failed', { error: e.message });
    if (clipProgressEl) { clipProgressEl.remove(); clipProgressEl = null; }
    try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'error', message: 'MediaRecorder not available' }); } catch {}
    return;
  }

  clipRecorder.ondataavailable = e => {
    if (e.data && e.data.size > 0) clipChunks.push(e.data);
  };

  clipRecorder.onstop = () => {
    debugLog('Clip', 'Recording stopped, creating download');
    if (clipProgressEl) { clipProgressEl.remove(); clipProgressEl = null; }
    if (clipTimeListener) {
      const v = document.querySelector('video') || video;
      if (v) v.removeEventListener('timeupdate', clipTimeListener);
      clipTimeListener = null;
    }
    if (clipChunks.length === 0) {
      try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'error', message: 'No data recorded' }); } catch {}
      clipRecorder = null;
      return;
    }

    const blob = new Blob(clipChunks, { type: clipRecorder.mimeType || 'video/webm' });
    const url  = URL.createObjectURL(blob);
    const ext  = (clipRecorder.mimeType || 'video/webm').includes('webm') ? 'webm' : 'mp4';
    const safeFilename = (filename || `clip_${Math.round(startTime)}-${Math.round(endTime)}`).replace(/[^\w\-. ]/g, '_') + `.${ext}`;

    const a  = document.createElement('a');
    a.href   = url;
    a.download = safeFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    clipRecorder = null;
    clipChunks   = [];
    try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'done' }); } catch {}
    showSilentSaveIndicator('Clip downloaded ✓');
  };

  clipRecorder.onerror = e => {
    debugLog('Clip', 'Recorder error', { error: e.error?.message });
    if (clipProgressEl) { clipProgressEl.remove(); clipProgressEl = null; }
    clipRecorder = null;
    try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'error', message: e.error?.message || 'Recorder error' }); } catch {}
  };

  clipRecorder.start(1000); // collect data every second

  // Monitor end time
  clipTimeListener = () => {
    const v = document.querySelector('video') || video;
    if (!v) return;
    const elapsed = v.currentTime - startTime;
    const recTimeEl = document.getElementById('yt-clip-rec-time');
    if (recTimeEl) recTimeEl.textContent = `${Math.max(0, Math.round(elapsed))}s / ${Math.round(duration)}s`;

    if (v.currentTime >= clipEndTime) {
      if (clipRecorder && clipRecorder.state === 'recording') {
        clipRecorder.stop();
      }
      v.removeEventListener('timeupdate', clipTimeListener);
      clipTimeListener = null;
    }
  };
  activeVideo.addEventListener('timeupdate', clipTimeListener);
  try { chrome.runtime.sendMessage({ action: 'clipRecordingUpdate', status: 'recording', duration }); } catch {}
}

// ─── Clip range markers on the progress bar ───────────────────────────────────
function updateClipRangeMarker(startTime, endTime) {
  video = document.querySelector('video') || video;
  if (!video || !progressBar) return;

  clearClipRangeMarker();

  const duration = video.duration;
  if (!duration || isNaN(duration)) return;

  const container = document.querySelector('.yt-bookmark-markers');
  if (!container) return;

  const startPct = (startTime / duration) * 100;
  const endPct   = (endTime / duration) * 100;
  const widthPct = endPct - startPct;
  if (widthPct <= 0) return;

  const range = document.createElement('div');
  range.className = 'yt-clip-range-marker';
  range.style.cssText = `left:${startPct}%;width:${widthPct}%;`;
  container.appendChild(range);
}

function clearClipRangeMarker() {
  document.querySelectorAll('.yt-clip-range-marker').forEach(el => el.remove());
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
    /* ── Bookmark markers ───────────────────────────────────────────────── */
    .yt-bookmark-marker {
      position: absolute;
      width: 16px;          /* wide transparent hit-area */
      height: 100%;
      z-index: 2;
      cursor: pointer;
      background: transparent;
      transform: translateX(-50%);  /* center the 16px on the exact position */
    }

    /* The 3px colored bar (centered inside the 16px hit area) */
    .yt-bookmark-marker::after {
      content: '';
      position: absolute;
      left: 50%;
      transform: translateX(-50%);
      width: 3px;
      height: 100%;
      background: var(--bm-color, #4da1ee);
      box-shadow: 0 0 5px var(--bm-color, #4da1ee);
      transition: width 0.2s ease, filter 0.2s ease;
    }
    .yt-bookmark-marker:hover::after {
      width: 5px;
      filter: brightness(1.35);
    }
    .yt-bookmark-marker--active::after {
      width: 5px;
      box-shadow: 0 0 10px var(--bm-color, #4da1ee), 0 0 20px var(--bm-color, #4da1ee);
      animation: bm-pass-pulse 0.5s ease-out;
    }
    @keyframes bm-pass-pulse {
      0%   { transform: translateX(-50%) scaleY(1); }
      40%  { transform: translateX(-50%) scaleY(1.5); filter: brightness(1.7); }
      100% { transform: translateX(-50%) scaleY(1); }
    }

    /* Always-visible diamond nub above the bar */
    .yt-bookmark-marker::before {
      content: '';
      position: absolute;
      top: -6px;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 8px;
      height: 8px;
      background: var(--bm-color, #4da1ee);
      border-radius: 2px;
      opacity: 0.85;
      box-shadow: 0 1px 4px rgba(0,0,0,0.45);
      transition: transform 0.2s ease, top 0.2s ease, opacity 0.2s ease;
    }
    .yt-bookmark-marker:hover::before {
      transform: translateX(-50%) rotate(45deg) scale(1.35);
      top: -8px;
      opacity: 1;
    }
    .yt-bookmark-marker--active::before {
      transform: translateX(-50%) rotate(45deg) scale(1.3);
      top: -8px;
      opacity: 1;
    }

    .yt-bookmark-marker.clicked::after {
      animation: bm-ripple 0.6s cubic-bezier(0.4, 0, 0.2, 1);
    }
    @keyframes bm-ripple {
      0%   { box-shadow: 0 0 0 0 var(--bm-color, rgba(77,161,238,0.5)); }
      100% { box-shadow: 0 0 0 10px transparent; }
    }

    /* ── Shared rich tooltip ─────────────────────────────────────────────── */
    #yt-bm-tooltip {
      position: fixed;
      z-index: 999999;
      background: rgba(18, 18, 18, 0.96);
      color: #fff;
      border-radius: 8px;
      padding: 9px 12px;
      font-family: 'YouTube Noto', 'Roboto', Arial, sans-serif;
      pointer-events: none;
      opacity: 0;
      transform: translateY(6px);
      transition: opacity 0.15s ease, transform 0.15s ease;
      box-shadow: 0 4px 20px rgba(0,0,0,0.55);
      border: 1px solid rgba(255,255,255,0.08);
      max-width: 260px;
      min-width: 110px;
    }
    #yt-bm-tooltip.visible {
      opacity: 1;
      transform: translateY(0);
    }
    .yt-bm-tt-time {
      font-size: 13px;
      font-weight: 700;
      color: #14B8A6;
      margin-bottom: 4px;
      letter-spacing: 0.02em;
    }
    .yt-bm-tt-desc {
      font-size: 12px;
      color: rgba(255,255,255,0.82);
      line-height: 1.45;
      word-break: break-word;
    }
    .yt-bm-tt-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 6px;
    }
    .yt-bm-tt-tag {
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .yt-bm-tt-cluster-header {
      font-size: 11px;
      font-weight: 700;
      color: #9ca3af;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 6px;
    }
    .yt-bm-tt-cluster-item {
      font-size: 12px;
      color: rgba(255,255,255,0.8);
      line-height: 1.45;
      padding: 3px 0;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .yt-bm-tt-cluster-item:last-child { border-bottom: none; }
    .yt-bm-tt-cluster-time {
      color: #14B8A6;
      font-weight: 700;
      margin-right: 5px;
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
    .yt-revision-note {
      font-size: 11px;
      color: rgba(255,255,255,0.50);
      font-style: italic;
      margin-bottom: 6px;
      line-height: 1.35;
    }
    .yt-revision-speed {
      display: flex;
      gap: 4px;
      margin-top: 8px;
    }
    .yt-revision-speed-btn {
      flex: 1;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 5px;
      color: rgba(255,255,255,0.70);
      font-size: 10px;
      font-family: inherit;
      cursor: pointer;
      padding: 3px 0;
      transition: background 0.12s, color 0.12s;
    }
    .yt-revision-speed-btn:hover { background: rgba(255,255,255,0.15); color: white; }
    .yt-revision-speed-btn.active { background: #14B8A6; border-color: #14B8A6; color: #000; font-weight: 700; }
    .yt-revision-nav {
      display: flex;
      gap: 6px;
      margin-bottom: 8px;
    }
    .yt-revision-nav-btn {
      flex: 1;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 5px;
      color: rgba(255,255,255,0.80);
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      padding: 5px 0;
      transition: background 0.12s;
    }
    .yt-revision-nav-btn:hover { background: rgba(255,255,255,0.20); color: white; }
    .yt-revision-nav-btn:disabled { opacity: 0.3; cursor: default; }
    .yt-revision-extend {
      width: 100%;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 5px;
      color: rgba(255,255,255,0.70);
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      padding: 5px 0;
      margin-top: 6px;
      transition: background 0.12s, color 0.12s;
    }
    .yt-revision-extend:hover { background: rgba(255,255,255,0.14); color: white; }

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

    /* Clip range marker on progress bar */
    .yt-clip-range-marker {
      position: absolute;
      top: 0;
      height: 100%;
      background: rgba(20, 184, 166, 0.30);
      border-left: 2px solid #14B8A6;
      border-right: 2px solid #14B8A6;
      pointer-events: none;
      z-index: 1;
    }

    /* Clip recording overlay on the video player */
    .yt-clip-recording-overlay {
      position: absolute;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 999999;
      pointer-events: auto;
    }
    .yt-clip-rec-inner {
      display: flex;
      align-items: center;
      gap: 8px;
      background: rgba(15, 15, 15, 0.88);
      border: 1px solid rgba(20, 184, 166, 0.5);
      border-radius: 20px;
      padding: 6px 14px 6px 10px;
      font-family: 'Segoe UI', system-ui, sans-serif;
      color: white;
      font-size: 13px;
      backdrop-filter: blur(6px);
      box-shadow: 0 4px 16px rgba(0,0,0,0.5);
      white-space: nowrap;
    }
    .yt-clip-rec-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #ef4444;
      flex-shrink: 0;
      animation: clip-rec-blink 1s ease infinite;
    }
    @keyframes clip-rec-blink {
      0%, 100% { opacity: 1; }
      50%       { opacity: 0.3; }
    }
    .yt-clip-rec-label {
      font-weight: 600;
      color: rgba(255,255,255,0.9);
    }
    .yt-clip-rec-time {
      font-size: 11px;
      color: #14B8A6;
      font-variant-numeric: tabular-nums;
      font-weight: 700;
    }
    .yt-clip-rec-cancel {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 10px;
      color: rgba(255,255,255,0.75);
      font-size: 11px;
      font-family: inherit;
      cursor: pointer;
      padding: 2px 8px;
      transition: background 0.15s, color 0.15s;
    }
    .yt-clip-rec-cancel:hover {
      background: rgba(239,68,68,0.25);
      color: white;
      border-color: rgba(239,68,68,0.5);
    }
  `;
  document.head.appendChild(style);
}

// ─── Revisit mode ─────────────────────────────────────────────────────────────
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
  revisionState = { segments: buildRevisionSegments(bookmarks), index: 0, countdownTimer: null, speed: 1 };
  playRevisionSegment(0);
}

function playRevisionSegment(index) {
  const v = document.querySelector('video') || video;
  if (!v || !revisionState) return;
  const seg = revisionState.segments[index];
  revisionState.index = index;
  v.currentTime = seg.start;
  v.playbackRate = revisionState.speed;
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

function skipToNext() {
  if (!revisionState) return;
  if (revisionState.countdownTimer) { clearInterval(revisionState.countdownTimer); revisionState.countdownTimer = null; }
  const v = document.querySelector('video') || video;
  if (v) v.removeEventListener('timeupdate', revisionTimeUpdateHandler);
  const next = revisionState.index + 1;
  if (next >= revisionState.segments.length) {
    exitRevisionMode();
    showSilentSaveIndicator('Revision complete ✓');
    return;
  }
  playRevisionSegment(next);
}

function skipToPrev() {
  if (!revisionState || revisionState.index <= 0) return;
  if (revisionState.countdownTimer) { clearInterval(revisionState.countdownTimer); revisionState.countdownTimer = null; }
  const v = document.querySelector('video') || video;
  if (v) v.removeEventListener('timeupdate', revisionTimeUpdateHandler);
  playRevisionSegment(revisionState.index - 1);
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
    overlay.style.cursor = 'grab';
    overlay.innerHTML = `
      <div class="yt-revision-label">▶ Revisit Mode</div>
      <div class="yt-revision-clip"></div>
      <div class="yt-revision-range"></div>
      <div class="yt-revision-note"></div>
      <div class="yt-revision-next"></div>
      <div class="yt-revision-nav">
        <button class="yt-revision-nav-btn" data-dir="prev">◀ Prev</button>
        <button class="yt-revision-nav-btn" data-dir="next">Next ▶</button>
      </div>
      <div class="yt-revision-speed">
        <button class="yt-revision-speed-btn" data-rate="0.75">0.75×</button>
        <button class="yt-revision-speed-btn" data-rate="1">1×</button>
        <button class="yt-revision-speed-btn" data-rate="1.25">1.25×</button>
        <button class="yt-revision-speed-btn" data-rate="1.5">1.5×</button>
        <button class="yt-revision-speed-btn" data-rate="1.75">1.75×</button>
        <button class="yt-revision-speed-btn" data-rate="2">2×</button>
      </div>
      <button class="yt-revision-extend">+ Extend 30s</button>
      <button class="yt-revision-close">✕</button>
    `;
    overlay.querySelector('.yt-revision-close').addEventListener('click', exitRevisionMode);
    overlay.querySelector('[data-dir="prev"]').addEventListener('click', skipToPrev);
    overlay.querySelector('[data-dir="next"]').addEventListener('click', skipToNext);
    overlay.querySelectorAll('.yt-revision-speed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!revisionState) return;
        const rate = parseFloat(btn.dataset.rate);
        revisionState.speed = rate;
        const v = document.querySelector('video') || video;
        if (v) v.playbackRate = rate;
        updateSpeedButtons(overlay, rate);
      });
    });
    overlay.querySelector('.yt-revision-extend').addEventListener('click', () => {
      if (!revisionState) return;
      revisionState.segments[revisionState.index].end += 30;
      updateRevisionOverlay();
    });

    // Drag to reposition
    let isDragging = false, dragOffsetX = 0, dragOffsetY = 0;
    overlay.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      isDragging = true;
      const rect = overlay.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      overlay.style.cursor = 'grabbing';
      e.preventDefault();
    });
    document.addEventListener('mousemove', e => {
      if (!isDragging || !overlay.isConnected) return;
      overlay.style.right = 'auto';
      overlay.style.left  = (e.clientX - dragOffsetX) + 'px';
      overlay.style.top   = (e.clientY - dragOffsetY) + 'px';
    });
    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      if (overlay.isConnected) overlay.style.cursor = 'grab';
    });

    document.body.appendChild(overlay);
  }
  return overlay;
}

function updateSpeedButtons(overlay, activeRate) {
  overlay.querySelectorAll('.yt-revision-speed-btn').forEach(btn => {
    btn.classList.toggle('active', parseFloat(btn.dataset.rate) === activeRate);
  });
}

function updateRevisionOverlay() {
  if (!revisionState) return;
  const overlay  = ensureRevisionOverlay();
  const seg      = revisionState.segments[revisionState.index];
  const current  = revisionState.index + 1;
  const total    = revisionState.segments.length;
  const rawNote  = seg.bookmark.description || '';
  const note     = rawNote.length > 90 ? rawNote.slice(0, 90) + '…' : rawNote;
  overlay.querySelector('.yt-revision-clip').textContent  = `Clip ${current} / ${total}`;
  overlay.querySelector('.yt-revision-range').textContent =
    `${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}`;
  overlay.querySelector('.yt-revision-note').textContent  = note;
  overlay.querySelector('.yt-revision-next').textContent  = '';
  overlay.querySelector('[data-dir="prev"]').disabled = revisionState.index === 0;
  updateSpeedButtons(overlay, revisionState.speed);
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
