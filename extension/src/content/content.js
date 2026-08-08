// Error reporting: this file deliberately does NOT initialise a reporter. It runs
// in YouTube's page, so it forwards to the background worker via
// globalThis.clipmarkReportError (src/error-report-bridge.js), which keeps the
// transport in the extension origin — clear of YouTube's CSP — and keeps the
// origin filter that stops YouTube's own exceptions draining our error quota in
// one place. See src/error-reporting.js.

function isDevLoggingEnabled() {
  try {
    const manifest = chrome?.runtime?.getManifest?.();
    const unpacked = !!manifest && !manifest.update_url;
    return unpacked || String(globalThis.API_BASE || '').includes('localhost');
  } catch {
    return false;
  }
}

const __contentDevLogs = isDevLoggingEnabled();

if (__contentDevLogs) {
  console.log('[ContentScript][INFO] Dev logging enabled');
}

globalThis.addEventListener('error', (event) => {
  if (!__contentDevLogs) return;
  console.error('[ContentScript][ERROR]', {
    message: event?.message,
    source: event?.filename,
    line: event?.lineno,
    column: event?.colno,
  });
});

globalThis.addEventListener('unhandledrejection', (event) => {
  if (!__contentDevLogs) return;
  console.error('[ContentScript][UNHANDLED_REJECTION]', event?.reason);
});

// ─── Debug ────────────────────────────────────────────────────────────────────
function debugLog(category, message, data = null) {
  if (!__contentDevLogs) return;
  console.log(`[ContentScript][${category}][${new Date().toISOString()}] ${message}`, data ?? '');
}

const _suppressedMessageActions = new Set([
  'getCurrentTime',
  'ping',
]);
const _messageLogState = {};

function shouldLogMessageAction(action) {
  if (_suppressedMessageActions.has(action)) return false;
  const now = Date.now();
  _messageLogState[action] = now;
  return true;
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
let titleVideoWatchTimer = null;
let lastObservedTitleVideoId = null;

// ─── Resume playback state ────────────────────────────────────────────────────
let progressSaveTimer = null;

// ─── Transcript state ─────────────────────────────────────────────────────────
let cachedTranscript       = null; // null = not fetched yet, [] = fetched but empty
let transcriptFetchPromise = null;
let cachedTranscriptVideoId = null;

// TAG_COLORS, parseTags, stringToColor, getTagColor are defined in constants.js

function bmKey(videoId) { return `bm_${videoId}`; }

// ─── Free-tier Active Recall enrollment cap ──────────────────────────────────
// countEnrolledRecallSegments/isEnrollmentCapReached are defined in usage-caps.js
async function isProUser() {
  if (!isContextValid()) return false;
  const { bmUser } = await new Promise(resolve => chrome.storage.sync.get({ bmUser: null }, resolve));
  return bmUser?.isPro === true;
}

async function countAllEnrolledRecallSegments() {
  if (!isContextValid()) return 0;
  const all = await new Promise((resolve, reject) => {
    chrome.storage.sync.get(null, result => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(result);
    });
  });
  const bookmarks = [];
  for (const [key, val] of Object.entries(all)) {
    if (key.startsWith('bm_') && Array.isArray(val)) bookmarks.push(...val);
  }
  return typeof countEnrolledRecallSegments === 'function' ? countEnrolledRecallSegments(bookmarks) : bookmarks.filter(b => b?.reviewSchedule?.length > 0).length;
}

// Decides the reviewSchedule for a brand-new bookmark: a free user past the
// standing 25-segment cap doesn't get auto-enrolled (the bookmark still saves
// with every other field intact), Pro users are always enrolled.
async function resolveNewBookmarkReviewSchedule() {
  if (await isProUser()) return { reviewSchedule: [1, 3, 7], capped: false };
  const enrolled = await countAllEnrolledRecallSegments();
  const capped = typeof isEnrollmentCapReached === 'function' ? isEnrollmentCapReached(enrolled) : enrolled >= 25;
  return capped ? { reviewSchedule: [], capped: true } : { reviewSchedule: [1, 3, 7], capped: false };
}

function getCurrentVideoIdFromLocation() {
  return new URLSearchParams(window.location.search).get('v');
}

function clearSavedTitleCache(exceptVideoId = null) {
  for (const key of Object.keys(savedTitlesCache)) {
    if (exceptVideoId && key === exceptVideoId) continue;
    delete savedTitlesCache[key];
  }
}

function handleVideoIdTransition(reason) {
  const videoId = getCurrentVideoIdFromLocation();
  if (!videoId || videoId === lastObservedTitleVideoId) return null;
  lastObservedTitleVideoId = videoId;
  clearSavedTitleCache(videoId);
  scheduleTitleRefresh([0, 250, 700, 1500, 3000], videoId);
  debugLog('Title', 'Detected video transition', { videoId, reason });
  return videoId;
}

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

// Shared tag-chip HTML (used by the marker tooltip and the recall panels)
function buildTagChipsHtml(tags, tagClass) {
  return (tags || []).map(t => {
    const c = TAG_COLORS[t] || stringToColor(t);
    return `<span class="${tagClass}" style="background:${c}22;color:${c}">${String(t).replace(/</g, '&lt;')}</span>`;
  }).join('');
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
      setTimeout(() => startRevisionMode(r.pendingRevision.bookmarks, r.pendingRevision.recall), 800);
    }
  });

  // Saved A–B loops live in the same bm_<videoId> store — load them so their
  // ranges paint on the scrubber and can be re-armed with one click.
  loadSavedLoops().catch(() => {});

  video.addEventListener('durationchange', () => {
    debugLog('Video', 'Duration changed', { duration: video.duration });
    updateBookmarkMarkers();
    renderLoopRanges();
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
  // The loop button is injected independently: a YouTube layout change that
  // hides the bookmark button must not also take out looping, and vice versa.
  setupPlayerLoopButton();

  if (document.querySelector('.yt-bookmark-player-btn')) return;

  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) return;

  const btn = document.createElement('button');
  btn.className  = 'ytp-button yt-bookmark-player-btn';
  btn.title      = 'Bookmark this moment (Alt+B)';
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

// Resilience: if YouTube renames/removes .ytp-right-controls this bails quietly
// and looping stays fully usable from the keyboard (Alt+[ / Alt+] / Alt+L) —
// the shortcuts are bound to document, not to the player chrome.
function setupPlayerLoopButton() {
  if (document.querySelector('.yt-loop-player-btn')) return;

  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) {
    debugLog('PlayerBtn', 'No .ytp-right-controls — loop stays keyboard-only');
    return;
  }

  const btn = document.createElement('button');
  // Deliberately NOT .yt-bookmark-player-btn — that class is resolved as a
  // single element by the save-flash path and by tests/ci/extension-smoke.
  btn.className = 'ytp-button yt-loop-player-btn';
  btn.title     = 'A–B loop (Alt+L)';
  btn.innerHTML = `<svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
    <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" fill="currentColor"/>
  </svg>`;

  btn.addEventListener('click', e => {
    e.stopPropagation();
    showLoopPanel();
  });

  controls.insertBefore(btn, controls.firstChild);
  debugLog('PlayerBtn', 'Loop button injected');
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
              ? `<div class="yt-bm-tt-tags">${buildTagChipsHtml(tags, 'yt-bm-tt-tag')}</div>`
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

// ─── Silent save (Alt+B) ──────────────────────────────────────────────────────
async function silentSaveBookmark() {
  if (!isContextValid()) return;
  video = document.querySelector('video') || video;
  if (!video) { debugLog('Silent', 'No video element'); return; }

  const videoId = new URLSearchParams(window.location.search).get('v');
  if (!videoId) { debugLog('Silent', 'No video ID'); return; }

  const timestamp = video.currentTime;
  const tags      = [];
  const color     = '#14b8a6';

  // Try transcript first, fall back to "Bookmark at M:SS"
  const transcript     = await fetchTranscript().catch(() => null);
  const transcriptText = transcript ? getTextAtTimestamp(transcript, timestamp) : null;
  const chapter     = getCurrentChapter();
  
  let description = transcriptText || chapter || `Bookmark at ${formatTimestamp(timestamp)}`;

  // AI MAGIC: If we have a transcript snippet, try to summarize it into a concept
  if (transcriptText) {
    try {
      const summarized = await localSummarizeSnippet(transcriptText);
      if (summarized && summarized !== transcriptText) {
        description = summarized;
        // Keep the raw transcript in the description if it's much longer than the summary?
        // Actually, let's store both or just the summary as the title.
        // For now, let's keep the summary as the primary description.
      }
    } catch (e) {
      debugLog('Silent', 'AI summary failed', e);
    }
  }

  // Re-check: the transcript fetch and AI summary above can take real wall-clock
  // time, long enough for an extension reload/update to invalidate this context
  // without unloading the running script.
  if (!isContextValid()) return;

  try {
    const result = await new Promise(resolve =>
      chrome.storage.sync.get({ [bmKey(videoId)]: [], videoTitles: {}, videoDurations: {} }, resolve)
    );
    const bookmarks      = result[bmKey(videoId)];
    const videoTitles    = result.videoTitles;
    const videoDurations = result.videoDurations;

    // Reject duplicate: same floor-second already bookmarked for this video
    if (bookmarks.some(b => Math.floor(b.timestamp) === Math.floor(timestamp))) {
      showSilentSaveIndicator('Already bookmarked at this moment', 'error');
      return;
    }

    const { reviewSchedule, capped } = await resolveNewBookmarkReviewSchedule();

    // The videoTitles cache is filled async (scheduleTitleRefresh), so an
    // instant Alt+B save can race ahead of it — resolve live from the DOM
    // instead of trusting a cache entry that may not exist yet.
    let videoTitle = videoTitles[videoId] || null;
    if (!videoTitle) {
      videoTitle = await getVideoTitle().catch(() => null);
      if (videoTitle) videoTitles[videoId] = videoTitle;
    }

    bookmarks.push({
      id: Date.now(),
      videoId,
      timestamp,
      description,
      tags,
      color,
      createdAt:      new Date().toISOString(),
      videoTitle,
      reviewSchedule,
      lastReviewed:   null,
    });

    if (video.duration && !isNaN(video.duration)) videoDurations[videoId] = video.duration;

    await new Promise((resolve, reject) =>
      chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks, videoDurations, videoTitles }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      })
    );

    updateBookmarkMarkers();
    showSaveFlash();
    if (capped) {
      showSilentSaveIndicator(`Saved. You've used all ${globalThis.FREE_RECALL_ENROLLED_CAP || 25} free Active Recall cards — upgrade for more, or remove one to make room.`);
    } else {
      showSilentSaveIndicator(description);
    }
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

  const colors = ['#14B8A6', '#2dd4bf', '#b45309', '#dc2626', '#15803d', '#8b5cf6'];
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
    el.style.borderLeftColor = '#dc2626';
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

  // Alt+B — global silent-save shortcut
  if (event.altKey && event.key.toLowerCase() === 'b') {
    silentSaveBookmark();
  }

  // A–B loop — Alt-modified so it can't collide with YouTube's own single-key
  // player shortcuts. event.code (not event.key) so non-US layouts still work,
  // where Alt+[ reports an accented character rather than a bracket.
  if (event.altKey && !event.ctrlKey && !event.metaKey) {
    if (event.code === 'BracketLeft')  { event.preventDefault(); showLoopPanel(); markLoopPointA(); return; }
    if (event.code === 'BracketRight') { event.preventDefault(); showLoopPanel(); markLoopPointB(); return; }
    if (event.code === 'KeyL')         { event.preventDefault(); showLoopPanel(); toggleLoopActive(); return; }
  }

  // Revisit mode navigation — only when a session is active
  if (!revisionState) return;
  if (event.key === '[') { event.preventDefault(); skipToPrev(); }
  if (event.key === ']') { event.preventDefault(); skipToNext(); }
}

// ─── Message listener ─────────────────────────────────────────────────────────
function initializeMessageListener() {
  // A content-script reinjection racing an extension reload can start running
  // with an already-invalidated context — chrome.runtime itself is undefined
  // then, not just its methods, so this must be checked before the .onMessage
  // property access, not inside the listener body.
  if (!isContextValid()) {
    debugLog('Messaging', 'Skipping listener setup — extension context invalid');
    return;
  }
  debugLog('Messaging', 'Setting up message listener');
  chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
    if (!isContextValid()) return;
    if (shouldLogMessageAction(request.action)) {
      debugLog('Messaging', 'Received', { action: request.action });
    }

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
        const resolvedTitle = await getVideoTitle();
        sendResponse({
          currentTime: activeVideo ? activeVideo.currentTime : 0,
          duration:    activeVideo ? (activeVideo.duration || 0) : 0,
          title: resolvedTitle || null,
        });
        return;
      }
      if (request.action === 'getVideoTitle') {
        const resolvedTitle = await getVideoTitle();
        sendResponse({ title: resolvedTitle || null, videoId: getCurrentVideoIdFromLocation() });
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
        loadSavedLoops().catch(() => {}); // a loop may have been added/removed elsewhere
        sendResponse({});
        return;
      }
      if (request.action === 'startRevision') {
        startRevisionMode(request.bookmarks, request.recall);
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
  const clean = (raw) => String(raw || '').replace(/\s*-\s*YouTube\s*$/i, '').trim();

  const isLikelyVideoTitle = (raw) => {
    const value = clean(raw);
    if (!value || value.length < 3) return false;
    const blocked = new Set([
      'youtube',
      'home',
      'shorts',
      'subscriptions',
      'library',
      'explore',
      'music',
      'gaming',
      'news',
      'live',
    ]);
    return !blocked.has(value.toLowerCase());
  };

  const selectorCandidates = [
    'h1.ytd-video-primary-info-renderer',
    'ytd-watch-metadata h1 yt-formatted-string',
    'h1.ytd-watch-metadata yt-formatted-string',
    'ytm-watch-metadata h1',
    'h1.slim-video-metadata-title',
    'h1',
    'h1 span',
  ];

  for (const selector of selectorCandidates) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const text = clean(el.textContent);
    if (isLikelyVideoTitle(text)) return text;
  }

  const metaTitle = clean(document.querySelector('meta[name="title"]')?.getAttribute('content'));
  if (isLikelyVideoTitle(metaTitle)) return metaTitle;

  const currentVideoId = getCurrentVideoIdFromLocation();
  const ytVideoDetails = window.ytInitialPlayerResponse?.videoDetails;
  const ytVideoId = ytVideoDetails?.videoId || null;
  const ytTitle = clean(ytVideoDetails?.title);
  if ((!currentVideoId || !ytVideoId || ytVideoId === currentVideoId) && isLikelyVideoTitle(ytTitle)) {
    return ytTitle;
  }

  const ogTitle = clean(document.querySelector('meta[property="og:title"]')?.getAttribute('content'));
  if (isLikelyVideoTitle(ogTitle)) return ogTitle;

  const docTitle = clean(document.title);
  if (isLikelyVideoTitle(docTitle)) return docTitle;

  return null;
}

async function saveVideoTitle(expectedVideoId = null) {
  if (!isContextValid()) return;
  const videoId = getCurrentVideoIdFromLocation();
  if (!videoId) return;
  if (expectedVideoId && expectedVideoId !== videoId) return;

  const title = await getVideoTitle();
  if (!title) return;

  const latestVideoId = getCurrentVideoIdFromLocation();
  if (!latestVideoId || latestVideoId !== videoId) return;

  // Skip write if we already saved this exact title
  if (savedTitlesCache[videoId] === title) return;

  // Re-check: the extension can be reloaded/updated during the awaits above,
  // which invalidates this context without unloading the running script.
  if (!isContextValid()) return;

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

function scheduleTitleRefresh(attempts = [0, 250, 700, 1500, 3000], expectedVideoId = null) {
  attempts.forEach((delay) => {
    setTimeout(() => {
      saveVideoTitle(expectedVideoId).catch(() => {});
    }, delay);
  });
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
      background: var(--bm-color, #14b8a6);
      box-shadow: 0 0 5px var(--bm-color, #14b8a6);
      transition: width 0.2s ease, filter 0.2s ease;
    }
    .yt-bookmark-marker:hover::after {
      width: 5px;
      filter: brightness(1.35);
    }
    .yt-bookmark-marker--active::after {
      width: 5px;
      box-shadow: 0 0 10px var(--bm-color, #14b8a6), 0 0 20px var(--bm-color, #14b8a6);
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
      background: var(--bm-color, #14b8a6);
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
      font-family: ${FONT_FAMILY_NATIVE};
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
      font-size: 11px;
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
      font-family: ${FONT_FAMILY_NATIVE};
      border-left: 3px solid #14b8a6;
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
      font-family: ${FONT_FAMILY_NATIVE};
      min-width: 190px;
      backdrop-filter: blur(8px);
      box-shadow: 0 4px 24px rgba(0,0,0,0.4);
    }
    .yt-revision-label {
      font-size: 11px;
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
      color: #b45309;
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
      font-size: 11px;
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

    /* ── Active Recall panels ────────────────────────────────────────────── */
    .yt-recall-panel {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 999999;
      background: rgba(15, 15, 15, 0.94);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px;
      padding: 20px 24px 18px;
      color: white;
      font-family: ${FONT_FAMILY_NATIVE};
      min-width: 280px;
      max-width: 400px;
      text-align: center;
      backdrop-filter: blur(8px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.55);
    }
    .yt-recall-label {
      font-size: 15px;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .yt-recall-time {
      font-size: 13px;
      font-weight: 700;
      color: #14B8A6;
      font-variant-numeric: tabular-nums;
      margin-bottom: 10px;
    }
    .yt-recall-tags {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 4px;
      margin-bottom: 10px;
    }
    .yt-recall-tag {
      padding: 1px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
    }
    .yt-recall-hint {
      font-size: 11px;
      color: rgba(255,255,255,0.50);
      font-style: italic;
      margin-bottom: 14px;
      line-height: 1.4;
    }
    .yt-recall-desc {
      font-size: 13px;
      color: rgba(255,255,255,0.85);
      line-height: 1.5;
      margin-bottom: 14px;
      word-break: break-word;
    }
    .yt-recall-btn {
      width: 100%;
      background: #14B8A6;
      border: 1px solid #14B8A6;
      border-radius: 6px;
      color: #000;
      font-size: 13px;
      font-weight: 700;
      font-family: inherit;
      cursor: pointer;
      padding: 8px 0;
      transition: filter 0.12s;
    }
    .yt-recall-btn:hover { filter: brightness(1.15); }
    .yt-recall-grade-row {
      display: flex;
      gap: 8px;
    }
    .yt-recall-grade-btn {
      flex: 1;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      color: rgba(255,255,255,0.85);
      font-size: 12px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      padding: 7px 0;
      transition: background 0.12s, color 0.12s;
    }
    .yt-recall-grade-btn:hover { background: rgba(255,255,255,0.18); color: white; }
    .yt-recall-grade-btn--good {
      background: rgba(20,184,166,0.18);
      border-color: rgba(20,184,166,0.5);
      color: #14B8A6;
    }
    .yt-recall-grade-btn--good:hover { background: rgba(20,184,166,0.32); color: #5eead4; }

    /* Player bookmark + loop buttons */
    .yt-bookmark-player-btn,
    .yt-loop-player-btn {
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
    .yt-loop-player-btn:hover {
      opacity: 1;
      transform: scale(1.15);
      color: #8b5cf6;
    }
    .yt-loop-player-btn--armed { color: #8b5cf6; opacity: 1; }
    .yt-bookmark-player-btn.saving {
      animation: bm-pulse 0.4s ease;
    }
    @keyframes bm-pulse {
      0%   { transform: scale(1); }
      50%  { transform: scale(1.3); color: #14B8A6; }
      100% { transform: scale(1); }
    }

    /* ── A–B loop ranges on the scrubber ─────────────────────────────────── */
    .yt-loop-ranges {
      position: absolute; top: 0; left: 0; width: 100%; height: 100%;
      pointer-events: none; z-index: 1;
    }
    .yt-loop-range {
      position: absolute; top: 0; height: 100%;
      background: rgba(139, 92, 246, 0.35);
      border-left:  2px solid #8b5cf6;
      border-right: 2px solid #8b5cf6;
      box-sizing: border-box;
      pointer-events: auto;
      cursor: pointer;
    }
    .yt-loop-range--saved { background: rgba(139, 92, 246, 0.18); }
    .yt-loop-range--active { background: rgba(139, 92, 246, 0.55); }
    .yt-loop-range:hover { background: rgba(139, 92, 246, 0.6); }

    /* ── A–B loop panel ──────────────────────────────────────────────────── */
    .yt-loop-panel {
      position: fixed; right: 24px; bottom: 96px; z-index: 2147483000;
      width: 296px; padding: 14px 14px 12px;
      background: rgba(17, 17, 20, 0.96);
      color: #f3f4f6;
      border: 1px solid rgba(139, 92, 246, 0.5);
      border-radius: 12px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
      font-family: ${FONT_FAMILY_NATIVE};
      font-size: 13px;
      cursor: grab;
    }
    /* Fullscreen paints only the fullscreen subtree, so the panel is re-parented
       into it — position:fixed then resolves against the player, not the page. */
    .yt-loop-panel--fullscreen { right: 24px; bottom: 120px; }
    .yt-loop-label {
      font-weight: 700; letter-spacing: .02em; margin-bottom: 8px;
      display: flex; align-items: center; gap: 6px;
    }
    .yt-loop-mode {
      margin-left: auto; font-size: 11px; font-weight: 600;
      padding: 2px 8px; border-radius: 999px; cursor: pointer;
      background: rgba(139, 92, 246, 0.2); color: #8b5cf6;
      border: 1px solid rgba(139, 92, 246, 0.45);
    }
    .yt-loop-list { max-height: 168px; overflow-y: auto; margin: 0 0 8px; }
    .yt-loop-row {
      display: flex; align-items: center; gap: 8px;
      padding: 5px 6px; border-radius: 7px;
      cursor: pointer;
    }
    .yt-loop-row:hover { background: rgba(255, 255, 255, 0.07); }
    .yt-loop-row--current { background: rgba(139, 92, 246, 0.22); }
    .yt-loop-row-time {
      font-variant-numeric: tabular-nums; color: #8b5cf6; white-space: nowrap;
    }
    .yt-loop-row-name {
      flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: #e5e7eb;
    }
    .yt-loop-row-saved { color: #8b5cf6; font-size: 11px; }
    .yt-loop-row-remove {
      background: none; border: 0; color: #9ca3af; cursor: pointer;
      font-size: 13px; line-height: 1; padding: 2px 4px;
    }
    .yt-loop-row-edit {
      background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.14);
      color: #8b5cf6; cursor: pointer; border-radius: 5px;
      font-size: 11px; font-weight: 700; font-family: inherit;
      line-height: 1; padding: 3px 5px;
    }
    .yt-loop-row-edit:hover { background: rgba(139, 92, 246, 0.35); color: #fff; }
    .yt-loop-row-name { cursor: text; }
    .yt-loop-row-remove:hover { color: #dc2626; }
    .yt-loop-empty { color: #9ca3af; padding: 6px 2px 8px; line-height: 1.5; }
    .yt-loop-draft { color: #9ca3af; margin-bottom: 8px; font-variant-numeric: tabular-nums; }
    .yt-loop-draft b { color: #f3f4f6; font-weight: 600; }
    .yt-loop-actions { display: flex; flex-wrap: wrap; gap: 6px; }
    .yt-loop-btn {
      flex: 1 1 auto; min-width: 78px;
      padding: 6px 8px; border-radius: 7px; cursor: pointer;
      background: rgba(255, 255, 255, 0.08); color: #f3f4f6;
      border: 1px solid rgba(255, 255, 255, 0.14);
      font-size: 12px; font-weight: 600; font-family: inherit;
    }
    .yt-loop-btn:hover { background: rgba(255, 255, 255, 0.16); }
    .yt-loop-btn--primary {
      background: #8b5cf6; border-color: #8b5cf6; color: #fff;
    }
    .yt-loop-btn--primary:hover { background: #7c3aed; }
    .yt-loop-btn:disabled { opacity: .45; cursor: not-allowed; }
    .yt-loop-name-input {
      width: 100%; margin-bottom: 6px; padding: 6px 8px;
      border-radius: 7px; border: 1px solid rgba(139, 92, 246, 0.6);
      background: rgba(0, 0, 0, 0.45); color: #f3f4f6;
      font-family: inherit; font-size: 12px; box-sizing: border-box;
    }
    .yt-loop-close {
      position: absolute; top: 8px; right: 8px;
      background: none; border: 0; color: #9ca3af; cursor: pointer;
      font-size: 14px; line-height: 1;
    }
    .yt-loop-close:hover { color: #f3f4f6; }
    .yt-loop-hint { color: #6b7280; font-size: 11px; margin-top: 8px; line-height: 1.5; }
  `;
  document.head.appendChild(style);
}

// ─── A–B multi-segment loop ───────────────────────────────────────────────────
// The decision logic (when to seek, how wide the trigger window is at 2x, when
// the overlay has to move for fullscreen) lives in src/loop.js as pure
// functions; everything below is player/DOM plumbing around it.
//
// Free vs Pro: looping is NEVER gated — arm as many A–B pairs as you like, for
// as long as you like. Only SAVING a named loop consumes the standing free pool
// (FREE_SAVED_LOOPS_CAP), because a saved loop syncs to the cloud and becomes an
// Active-Recall card. The server enforces the same line independently:
// /api/bookmarks is Pro-only, so a free client that fakes the local check still
// cannot sync loops.

let loopState        = null;  // { segments, index, mode, pendingSeek, active, videoId }
let loopDraftA       = null;  // A point marked, waiting for B
let loopFrameHandle  = null;
let loopFrameVideo   = null;  // element the frame callback is registered on
let loopSafetyTimer  = null;
let loopBoundVideo   = null;
let loopLastTickAt   = 0;     // any tick — feeds the adaptive epsilon
let loopLastFrameAt  = 0;     // frame-source ticks only — feeds the liveness check
let loopSavedCache   = [];    // saved loop segments for the current video
let loopNamingSegment = null; // segment awaiting a name in the save input
let loopRenamingIndex = null; // session-segment index being renamed inline

const LOOP_MAX_TICK_SECONDS   = 0.5;  // cap so a backgrounded tab can't inflate epsilon
const LOOP_FRAME_STALL_MS     = 1000; // frame source considered dead after this

function resolveLoopVideo() {
  const live = document.querySelector('video');
  if (live) video = live;
  return live || video;
}

// ── Watchdog ────────────────────────────────────────────────────────────────
// Two independent tick sources on purpose. requestVideoFrameCallback is exact
// (one call per presented frame, so it survives any playbackRate), but it stops
// firing if YouTube swaps the media element out from under us — which it does on
// SPA navigation and some player re-inits. The interval is the safety net that
// keeps looping and re-arms the frame source. loopTick() is idempotent, so
// double-ticking from both sources is harmless.
function loopTick() {
  if (!loopState?.active) return;
  const v = resolveLoopVideo();
  if (!v) return;

  if (shouldRebindVideo(loopBoundVideo, v)) {
    debugLog('Loop', 'Media element swapped — rebinding watchdog');
    loopBoundVideo = v;
    scheduleLoopFrame();
  }

  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const observed = loopLastTickAt ? (now - loopLastTickAt) / 1000 : LOOP_CONSTANTS.LOOP_DEFAULT_TICK;
  loopLastTickAt = now;
  // The epsilon in advanceLoop is sized from the OBSERVED tick interval, so a
  // fullscreen transition that drops frames automatically widens the window
  // instead of letting the playhead sail past B.
  const tickSeconds = Math.min(
    Math.max(observed, LOOP_CONSTANTS.LOOP_DEFAULT_TICK),
    LOOP_MAX_TICK_SECONDS,
  );

  const before = loopState.index;
  const { state, seek, reason } = advanceLoop(loopState, {
    currentTime:  v.currentTime,
    playbackRate: v.playbackRate,
    tickSeconds,
  });
  loopState = state;

  if (seek === null) return;
  v.currentTime = seek;
  if (v.paused) v.play().catch(() => {});
  debugLog('Loop', 'Seek', { reason, seek, rate: v.playbackRate, tickSeconds });
  if (state.index !== before) updateLoopPanel();
}

function scheduleLoopFrame() {
  cancelLoopFrame();
  const v = resolveLoopVideo();
  if (!v) return;

  const onTick = () => {
    loopLastFrameAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    loopTick();
    if (loopState?.active) scheduleLoopFrame();
  };

  if (typeof v.requestVideoFrameCallback === 'function') {
    loopFrameVideo  = v;
    loopFrameHandle = v.requestVideoFrameCallback(onTick);
  } else {
    loopFrameVideo  = null;
    loopFrameHandle = requestAnimationFrame(onTick);
  }
}

function cancelLoopFrame() {
  if (loopFrameHandle === null) return;
  try {
    if (loopFrameVideo?.cancelVideoFrameCallback) {
      loopFrameVideo.cancelVideoFrameCallback(loopFrameHandle);
    } else {
      cancelAnimationFrame(loopFrameHandle);
    }
  } catch { /* element already gone — the callback died with it */ }
  loopFrameHandle = null;
  loopFrameVideo  = null;
}

function startLoopWatchdog() {
  loopLastTickAt  = 0;
  // Seeded to "now" rather than 0 so the liveness check below also catches the
  // case where the frame source never fires ONCE — e.g. it was registered on a
  // media element YouTube had already detached.
  loopLastFrameAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  scheduleLoopFrame();
  if (loopSafetyTimer) return;
  loopSafetyTimer = setInterval(() => {
    if (!loopState?.active) return;
    loopTick();
    const v = resolveLoopVideo();
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    // requestVideoFrameCallback only fires while frames are presented, so a
    // paused video is expected to look stalled — only re-arm during playback.
    if (v && !v.paused && now - loopLastFrameAt > LOOP_FRAME_STALL_MS) {
      debugLog('Loop', 'Frame source stalled — re-arming');
      scheduleLoopFrame();
    }
  }, 200);
}

function stopLoopWatchdog() {
  cancelLoopFrame();
  if (loopSafetyTimer) { clearInterval(loopSafetyTimer); loopSafetyTimer = null; }
  loopBoundVideo = null;
}

/** Tints the player's loop button while a loop is armed. */
function syncLoopButtonState() {
  document.querySelector('.yt-loop-player-btn')
    ?.classList.toggle('yt-loop-player-btn--armed', !!loopState?.active);
}

// ── Session control ─────────────────────────────────────────────────────────
function ensureLoopSession() {
  if (!loopState) {
    loopState = {
      segments: [],
      index: 0,
      mode: 'chain',
      pendingSeek: null,
      active: false,
      videoId: getCurrentVideoIdFromLocation(),
    };
  }
  return loopState;
}

/** Arms the loop on `index` and starts the watchdog. */
function activateLoop(index = 0) {
  const state = ensureLoopSession();
  if (!state.segments.length) return;
  state.index = Math.max(0, Math.min(index, state.segments.length - 1));
  state.active = true;
  state.pendingSeek = null;
  const v = resolveLoopVideo();
  const seg = state.segments[state.index];
  if (v && seg) {
    v.currentTime = seg.start;
    state.pendingSeek = seg.start;
    v.play().catch(() => {});
  }
  startLoopWatchdog();
  updateLoopPanel();
  renderLoopRanges();
  syncLoopButtonState();
}

function deactivateLoop() {
  if (loopState) { loopState.active = false; loopState.pendingSeek = null; }
  stopLoopWatchdog();
  updateLoopPanel();
  renderLoopRanges();
  syncLoopButtonState();
}

/** Full teardown — SPA navigation, page unload, or the panel's ✕. */
function exitLoopMode() {
  stopLoopWatchdog();
  loopState = null;
  loopDraftA = null;
  loopNamingSegment = null;
  loopRenamingIndex = null;
  document.querySelector('.yt-loop-panel')?.remove();
  renderLoopRanges();
  syncLoopButtonState();
}

function markLoopPointA() {
  const v = resolveLoopVideo();
  if (!v) return;
  ensureLoopSession();
  loopDraftA = v.currentTime;
  updateLoopPanel();
  showSilentSaveIndicator(`A set at ${formatLoopClock(loopDraftA)} — press Alt+] to close the loop`);
}

function markLoopPointB() {
  const v = resolveLoopVideo();
  if (!v) return;
  if (loopDraftA === null) {
    showSilentSaveIndicator('Set the A point first (Alt+[)', 'error');
    return;
  }
  const state = ensureLoopSession();
  const pair = { a: loopDraftA, b: v.currentTime };
  if (!isValidLoopSegment(pair, v.duration || 0)) {
    showSilentSaveIndicator('A and B are too close together', 'error');
    return;
  }
  const before = state.segments.length;
  state.segments = insertLoopSegment(state.segments, pair, v.duration || 0);
  loopDraftA = null;
  if (state.segments.length === before) {
    showSilentSaveIndicator('That loop is already in this session');
    updateLoopPanel();
    return;
  }
  const seg = normalizeLoopSegment(pair, v.duration || 0);
  const index = state.segments.findIndex(s => isSameLoopSegment(s, seg));
  activateLoop(index === -1 ? state.segments.length - 1 : index);
  showSilentSaveIndicator(`Looping ${formatLoopClock(seg.start)} → ${formatLoopClock(seg.end)}`);
}

function toggleLoopActive() {
  const state = ensureLoopSession();
  if (!state.segments.length) {
    showLoopPanel();
    showSilentSaveIndicator('Mark A (Alt+[) then B (Alt+]) to start looping');
    return;
  }
  if (state.active) deactivateLoop();
  else activateLoop(state.index);
}

function toggleLoopMode() {
  const state = ensureLoopSession();
  state.mode = state.mode === 'chain' ? 'single' : 'chain';
  updateLoopPanel();
}

function removeLoopAt(index) {
  const state = ensureLoopSession();
  const removed = state.segments[index];
  state.segments = removeLoopSegment(state.segments, index);
  if (!state.segments.length) {
    deactivateLoop();
  } else if (state.index >= state.segments.length) {
    state.index = state.segments.length - 1;
  }
  updateLoopPanel();
  renderLoopRanges();
  // A segment adopted from a saved loop carries its record id — removing it
  // from the session also deletes the saved loop, matching what the row's ✕
  // visibly means when the row is marked as saved.
  if (removed?.id) deleteSavedLoop(removed.id);
}

/**
 * Re-anchors A or B of an existing segment to the current playhead — this is
 * how a loop is tightened after hearing it, and it's the same edit whether the
 * segment is session-only or a saved loop (the saved record follows).
 *
 * Editing SUSPENDS the loop. Otherwise the two fight each other: to push B
 * later you have to scrub past the current B, and an armed watchdog yanks you
 * back to A before you can press the button. Re-arm with Loop (or Alt+L) when
 * the bounds are where you want them.
 */
function editLoopBound(index, which) {
  const state = ensureLoopSession();
  const v = resolveLoopVideo();
  const before = state.segments[index];
  if (!v || !before) return;
  if (state.active) deactivateLoop();

  const previous = state.segments;
  const next = updateLoopSegmentBound(previous, index, which, v.currentTime, v.duration || 0);
  // updateLoopSegmentBound rebuilds the edited entry as a new object and leaves
  // every other entry by reference, so the one that isn't in the old list by
  // identity is the one we just edited — and that survives the re-sort.
  const updated = next.find(seg => !previous.includes(seg));
  if (!updated) {
    showSilentSaveIndicator('That would make the loop too short', 'error');
    return;
  }

  state.segments = next;
  state.index = next.indexOf(updated);
  updateLoopPanel();
  renderLoopRanges();
  if (before.id !== undefined) persistLoopEdit(before.id, updated);
}

/** Starts an inline rename of the segment at `index`. */
function beginLoopRename(index) {
  const seg = loopState?.segments?.[index];
  if (!seg) return;
  loopRenamingIndex = index;
  updateLoopPanel();
}

function commitLoopRename() {
  const index = loopRenamingIndex;
  loopRenamingIndex = null;
  const seg = loopState?.segments?.[index];
  const input = document.querySelector('.yt-loop-panel [data-loop-rename]');
  const name = input ? input.value : '';
  if (!seg) { updateLoopPanel(); return; }
  seg.name = sanitizeLoopName(name, seg);
  updateLoopPanel();
  renderLoopRanges();
  if (seg.id !== undefined) persistLoopEdit(seg.id, seg);
}

/**
 * Writes an in-session edit back onto the stored loop bookmark.
 *
 * Read-modify-write against the FRESH stored copy (same discipline as
 * gradeAndPersistBookmark) so a concurrent edit from another surface isn't
 * silently reverted.
 */
function persistLoopEdit(id, segment) {
  if (!isContextValid()) return;
  const videoId = getCurrentVideoIdFromLocation();
  if (!videoId || !segment) return;
  chrome.storage.sync.get({ [bmKey(videoId)]: [] }, result => {
    const bookmarks = result[bmKey(videoId)];
    const idx = bookmarks.findIndex(b => b.id === id);
    if (idx === -1) return;
    bookmarks[idx] = {
      ...bookmarks[idx],
      timestamp: segment.start,
      description: segment.name || bookmarks[idx].description,
      loop: { ...(bookmarks[idx].loop || {}), end: segment.end },
    };
    chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks }, () => {
      if (chrome.runtime.lastError) {
        debugLog('Loop', 'Failed to persist edit', { error: chrome.runtime.lastError.message });
        return;
      }
      loadSavedLoops().catch(() => {});
      updateBookmarkMarkers();
    });
  });
}

function deleteSavedLoop(id) {
  if (!isContextValid()) return;
  const videoId = getCurrentVideoIdFromLocation();
  if (!videoId) return;
  chrome.storage.sync.get({ [bmKey(videoId)]: [] }, result => {
    const bookmarks = result[bmKey(videoId)];
    const next = bookmarks.filter(b => b.id !== id);
    if (next.length === bookmarks.length) return;
    chrome.storage.sync.set({ [bmKey(videoId)]: next }, () => {
      if (chrome.runtime.lastError) return;
      loadSavedLoops().catch(() => {});
      updateBookmarkMarkers();
    });
  });
}

// ── Saving (the Pro line) ───────────────────────────────────────────────────
// A saved loop is written into bm_<videoId> as a bookmark carrying `loop.end`,
// so it syncs through the existing /api/bookmarks path and is picked up by
// Active Recall with no extra wiring. reviewSchedule comes from the SAME
// enrollment resolver bookmarks use — loops enter recall through the existing
// gate rather than a parallel one.
async function resolveSavedLoopAllowance() {
  if (await isProUser()) return { allowed: true, capped: false };
  const all = await new Promise((resolve, reject) => {
    chrome.storage.sync.get(null, result => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(result);
    });
  });
  const bookmarks = [];
  for (const [key, val] of Object.entries(all)) {
    if (key.startsWith('bm_') && Array.isArray(val)) bookmarks.push(...val);
  }
  const saved = typeof countSavedLoops === 'function'
    ? countSavedLoops(bookmarks)
    : bookmarks.filter(b => b?.loop?.end > b?.timestamp).length;
  const capped = typeof isSavedLoopCapReached === 'function'
    ? isSavedLoopCapReached(saved)
    : saved >= 3;
  return { allowed: !capped, capped };
}

async function saveNamedLoop(segment, name) {
  if (!isContextValid()) return;
  const videoId = getCurrentVideoIdFromLocation();
  if (!videoId || !segment) return;

  const { allowed } = await resolveSavedLoopAllowance();
  if (!allowed) {
    const cap = globalThis.FREE_SAVED_LOOPS_CAP || 3;
    showSilentSaveIndicator(
      `You've saved all ${cap} free loops — looping stays unlimited, upgrade to save and sync more.`,
      'error',
    );
    return;
  }

  try {
    const stored = await new Promise(resolve =>
      chrome.storage.sync.get({ [bmKey(videoId)]: [], videoTitles: {} }, resolve)
    );
    const bookmarks = stored[bmKey(videoId)];
    if (isDuplicateLoop(bookmarks, segment)) {
      showSilentSaveIndicator('That loop is already saved', 'error');
      return;
    }

    const { reviewSchedule } = await resolveNewBookmarkReviewSchedule();
    const record = buildLoopBookmark({
      videoId,
      segment,
      name,
      videoTitle: stored.videoTitles[videoId] || (await getVideoTitle().catch(() => null)),
      reviewSchedule,
      nowMs: Date.now(),
    });
    if (!record) return;

    bookmarks.push(record);
    await new Promise((resolve, reject) =>
      chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      })
    );

    updateBookmarkMarkers();
    await loadSavedLoops();
    showSaveFlash();
    showSilentSaveIndicator(
      reviewSchedule.length
        ? `Saved "${record.description}" — it'll come back in Active Recall`
        : `Saved "${record.description}"`,
    );
    debugLog('Loop', 'Saved named loop', { videoId, segment, enrolled: reviewSchedule.length > 0 });
  } catch (error) {
    debugLog('Loop', 'Save failed', { error: error?.message });
    showSilentSaveIndicator('Could not save that loop', 'error');
  }
}

/** Saved loops for this video, pulled from the same bm_<videoId> store. */
async function loadSavedLoops() {
  if (!isContextValid()) return;
  const videoId = getCurrentVideoIdFromLocation();
  if (!videoId) { loopSavedCache = []; return; }
  const stored = await new Promise(resolve =>
    chrome.storage.sync.get({ [bmKey(videoId)]: [] }, resolve)
  );
  loopSavedCache = loopSegmentsFromBookmarks(stored[bmKey(videoId)]);
  renderLoopRanges();
  updateLoopPanel();
}

// ── Scrubber ranges ─────────────────────────────────────────────────────────
function renderLoopRanges() {
  if (!progressBar) return;
  let container = progressBar.querySelector('.yt-loop-ranges');
  if (!container) {
    container = document.createElement('div');
    container.className = 'yt-loop-ranges';
    progressBar.appendChild(container);
  }
  const v = resolveLoopVideo();
  const duration = v?.duration;
  container.innerHTML = '';
  if (!duration || !isFinite(duration) || duration <= 0) return;

  const session = loopState?.segments || [];
  // Saved loops the session hasn't already picked up, so a range isn't drawn twice.
  const saved = loopSavedCache.filter(s => !session.some(x => isSameLoopSegment(x, s)));

  const draw = (seg, className, onClick) => {
    const bar = document.createElement('div');
    bar.className = `yt-loop-range ${className}`;
    bar.style.left  = `${(seg.start / duration) * 100}%`;
    bar.style.width = `${Math.max(0.2, ((seg.end - seg.start) / duration) * 100)}%`;
    bar.title = `${formatLoopClock(seg.start)} → ${formatLoopClock(seg.end)}${seg.name ? ` · ${seg.name}` : ''}`;
    bar.addEventListener('click', event => { event.stopPropagation(); onClick(); });
    container.appendChild(bar);
  };

  saved.forEach(seg => draw(seg, 'yt-loop-range--saved', () => adoptSavedLoop(seg)));
  session.forEach((seg, i) => draw(
    seg,
    loopState?.active && loopState.index === i ? 'yt-loop-range--active' : '',
    () => activateLoop(i),
  ));
}

/** Pulls a saved loop into the live session and starts looping it. */
function adoptSavedLoop(seg) {
  const state = ensureLoopSession();
  const v = resolveLoopVideo();
  state.segments = insertLoopSegment(state.segments, seg, v?.duration || 0);
  const index = state.segments.findIndex(s => isSameLoopSegment(s, seg));
  showLoopPanel();
  activateLoop(index === -1 ? 0 : index);
}

// ── Panel ───────────────────────────────────────────────────────────────────
function showLoopPanel() {
  ensureLoopSession();
  mountLoopPanel();
  updateLoopPanel();
}

/**
 * Creates the panel if needed and parents it into whatever subtree is actually
 * painted. In fullscreen the browser renders ONLY document.fullscreenElement's
 * subtree, so a panel left on <body> silently disappears.
 */
function mountLoopPanel() {
  let panel = document.querySelector('.yt-loop-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.className = 'yt-loop-panel';
    panel.addEventListener('click', onLoopPanelClick);
    panel.addEventListener('keydown', onLoopPanelKeydown);
    // Keep YouTube's own player shortcuts from eating what we type/press here.
    panel.addEventListener('keydown', e => e.stopPropagation());
    attachLoopPanelDrag(panel);
  }
  const host = document.fullscreenElement || document.body;
  if (needsOverlayRemount(panel.parentNode, document.fullscreenElement, document.body)) {
    host.appendChild(panel);
  }
  panel.classList.toggle('yt-loop-panel--fullscreen', !!document.fullscreenElement);
  return panel;
}

function attachLoopPanelDrag(panel) {
  let dragging = false, offsetX = 0, offsetY = 0;
  panel.addEventListener('mousedown', e => {
    if (e.target.closest('button, input')) return;
    dragging = true;
    const rect = panel.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging || !panel.isConnected) return;
    panel.style.right  = 'auto';
    panel.style.bottom = 'auto';
    panel.style.left = `${e.clientX - offsetX}px`;
    panel.style.top  = `${e.clientY - offsetY}px`;
  });
  document.addEventListener('mouseup', () => { dragging = false; });
}

function updateLoopPanel() {
  const panel = document.querySelector('.yt-loop-panel');
  if (!panel) return;
  const state = loopState;
  const segments = state?.segments || [];
  const savedOnly = loopSavedCache.filter(s => !segments.some(x => isSameLoopSegment(x, s)));

  const rows = [
    ...segments.map((seg, i) => {
      const current = state?.active && state.index === i;
      const saved = loopSavedCache.some(s => isSameLoopSegment(s, seg));
      if (loopRenamingIndex === i) {
        return `
          <div class="yt-loop-row yt-loop-row--current">
            <input class="yt-loop-name-input" data-loop-rename placeholder="Rename this loop…"
                   maxlength="${LOOP_CONSTANTS.LOOP_NAME_MAX}" value="${escapeLoopText(seg.name || '')}">
          </div>`;
      }
      return `
        <div class="yt-loop-row ${current ? 'yt-loop-row--current' : ''}" data-loop-index="${i}">
          <span class="yt-loop-row-time">${formatLoopClock(seg.start)} → ${formatLoopClock(seg.end)}</span>
          <span class="yt-loop-row-name" data-loop-rename-at="${i}" title="Click to rename">${escapeLoopText(seg.name || '')}</span>
          ${saved ? '<span class="yt-loop-row-saved" title="Saved &amp; syncing">●</span>' : ''}
          <button class="yt-loop-row-edit" data-loop-edit="${i}:start" title="Move A to the playhead">A</button>
          <button class="yt-loop-row-edit" data-loop-edit="${i}:end" title="Move B to the playhead">B</button>
          <button class="yt-loop-row-remove" data-loop-remove="${i}" title="${saved ? 'Delete this saved loop' : 'Remove from session'}">✕</button>
        </div>`;
    }),
    ...savedOnly.map(seg => `
      <div class="yt-loop-row" data-loop-saved="${seg.start}:${seg.end}">
        <span class="yt-loop-row-time">${formatLoopClock(seg.start)} → ${formatLoopClock(seg.end)}</span>
        <span class="yt-loop-row-name">${escapeLoopText(seg.name || '')}</span>
        <span class="yt-loop-row-saved" title="Saved &amp; syncing">●</span>
      </div>`),
  ].join('');

  const active = segments[state?.index ?? 0];
  const naming = loopNamingSegment;

  panel.innerHTML = `
    <button class="yt-loop-close" data-loop-action="exit" title="Close">✕</button>
    <div class="yt-loop-label">
      🔁 A–B Loop
      <button class="yt-loop-mode" data-loop-action="mode" title="Chain plays every segment in turn">
        ${state?.mode === 'single' ? 'Single' : 'Chain'}
      </button>
    </div>
    <div class="yt-loop-list">${rows || '<div class="yt-loop-empty">No segments yet. Mark <b>A</b> then <b>B</b> to start looping — as many pairs as you want.</div>'}</div>
    <div class="yt-loop-draft">A: <b>${loopDraftA === null ? '—' : formatLoopClock(loopDraftA)}</b> &nbsp; B: <b>—</b></div>
    ${naming ? `<input class="yt-loop-name-input" data-loop-name placeholder="Name this loop…" maxlength="${LOOP_CONSTANTS.LOOP_NAME_MAX}">` : ''}
    <div class="yt-loop-actions">
      <button class="yt-loop-btn" data-loop-action="setA">Set A</button>
      <button class="yt-loop-btn" data-loop-action="setB">Set B</button>
      <button class="yt-loop-btn ${state?.active ? '' : 'yt-loop-btn--primary'}" data-loop-action="toggle" ${segments.length ? '' : 'disabled'}>
        ${state?.active ? 'Pause loop' : 'Loop'}
      </button>
      <button class="yt-loop-btn yt-loop-btn--primary" data-loop-action="${naming ? 'commitSave' : 'save'}" ${active ? '' : 'disabled'}>
        ${naming ? 'Save ✓' : 'Save loop'}
      </button>
    </div>
    <div class="yt-loop-hint">Alt+[ set A · Alt+] set B · Alt+L loop on/off. Editing A/B pauses the loop. Looping is free and unlimited.</div>
  `;

  if (naming) panel.querySelector('[data-loop-name]')?.focus();
  if (loopRenamingIndex !== null) panel.querySelector('[data-loop-rename]')?.focus();
}

function escapeLoopText(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function onLoopPanelClick(event) {
  const editBtn = event.target.closest('[data-loop-edit]');
  if (editBtn) {
    const [idx, which] = editBtn.dataset.loopEdit.split(':');
    editLoopBound(Number(idx), which);
    return;
  }
  const renameAt = event.target.closest('[data-loop-rename-at]');
  if (renameAt) {
    beginLoopRename(Number(renameAt.dataset.loopRenameAt));
    return;
  }
  const removeBtn = event.target.closest('[data-loop-remove]');
  if (removeBtn) {
    removeLoopAt(Number(removeBtn.dataset.loopRemove));
    return;
  }
  const savedRow = event.target.closest('[data-loop-saved]');
  if (savedRow) {
    const [start, end] = savedRow.dataset.loopSaved.split(':').map(Number);
    const match = loopSavedCache.find(s => s.start === start && s.end === end);
    if (match) adoptSavedLoop(match);
    return;
  }
  const row = event.target.closest('[data-loop-index]');
  if (row) { activateLoop(Number(row.dataset.loopIndex)); return; }

  const action = event.target.closest('[data-loop-action]')?.dataset.loopAction;
  if (!action) return;
  if (action === 'exit')   { exitLoopMode(); return; }
  if (action === 'mode')   { toggleLoopMode(); return; }
  if (action === 'setA')   { markLoopPointA(); return; }
  if (action === 'setB')   { markLoopPointB(); return; }
  if (action === 'toggle') { toggleLoopActive(); return; }
  if (action === 'save')   { beginLoopSave(); return; }
  if (action === 'commitSave') { commitLoopSave(); return; }
}

function onLoopPanelKeydown(event) {
  if (event.target.matches('[data-loop-rename]')) {
    if (event.key === 'Enter') { event.preventDefault(); commitLoopRename(); }
    if (event.key === 'Escape') { loopRenamingIndex = null; updateLoopPanel(); }
    return;
  }
  if (!event.target.matches('[data-loop-name]')) return;
  if (event.key === 'Enter') { event.preventDefault(); commitLoopSave(); }
  if (event.key === 'Escape') { loopNamingSegment = null; updateLoopPanel(); }
}

function beginLoopSave() {
  const seg = loopState?.segments?.[loopState.index];
  if (!seg) return;
  loopNamingSegment = seg;
  updateLoopPanel();
}

function commitLoopSave() {
  const seg = loopNamingSegment;
  if (!seg) return;
  const name = document.querySelector('.yt-loop-panel [data-loop-name]')?.value || '';
  loopNamingSegment = null;
  updateLoopPanel();
  saveNamedLoop(seg, name);
}

// Fullscreen swaps the painted subtree — re-parent the panel or it vanishes.
document.addEventListener('fullscreenchange', () => {
  if (!document.querySelector('.yt-loop-panel')) return;
  mountLoopPanel();
  updateLoopPanel();
  // The transition drops frames; re-arm the frame source rather than waiting
  // for the safety net to notice.
  if (loopState?.active) scheduleLoopFrame();
});

// ─── Revisit mode ─────────────────────────────────────────────────────────────
function buildRevisionSegments(bookmarks) {
  const sorted = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);
  return sorted.map((b, i) => {
    // A saved A–B loop carries its own end: the user drew that range because it
    // is the hard part, so recall/revisit replays exactly it instead of the
    // "until the next bookmark, max 60s" heuristic.
    const loopEnd = typeof loopEndForBookmark === 'function' ? loopEndForBookmark(b) : null;
    if (loopEnd !== null) return { bookmark: b, start: b.timestamp, end: loopEnd };
    const next = sorted[i + 1];
    const end  = next ? Math.min(next.timestamp, b.timestamp + 60) : b.timestamp + 60;
    return { bookmark: b, start: b.timestamp, end };
  });
}

function startRevisionMode(bookmarks, recall = false) {
  if (!bookmarks.length) return;
  exitRevisionMode(); // clean up any prior session
  revisionState = { segments: buildRevisionSegments(bookmarks), index: 0, countdownTimer: null, speed: 1, recall: !!recall };
  enterSegment(0);
}

// Single seam deciding how a segment is entered: recall mode prompts first,
// classic revisit plays immediately.
function enterSegment(index) {
  if (!revisionState) return;
  if (revisionState.recall) {
    showRecallPrompt(index);
  } else {
    playRevisionSegment(index);
  }
}

function finishRevisionSession() {
  const recall = !!revisionState?.recall;
  exitRevisionMode();
  showSilentSaveIndicator(recall ? 'Recall session complete ✓' : 'Revision complete ✓');
}

function advanceToNextOrFinish() {
  if (!revisionState) return;
  const next = revisionState.index + 1;
  if (next >= revisionState.segments.length) {
    finishRevisionSession();
    return;
  }
  enterSegment(next);
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
  if (revisionState.recall) {
    // Recall mode: pause and self-grade instead of the auto-advance countdown
    const v = document.querySelector('video') || video;
    if (v) v.pause();
    showRecallGrade();
    return;
  }
  const next = revisionState.index + 1;
  if (next >= revisionState.segments.length) {
    finishRevisionSession();
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
  removeRecallPanels(); // discard any pending recall prompt/grade panel
  const v = document.querySelector('video') || video;
  if (v) v.removeEventListener('timeupdate', revisionTimeUpdateHandler);
  advanceToNextOrFinish();
}

function skipToPrev() {
  if (!revisionState || revisionState.index <= 0) return;
  if (revisionState.countdownTimer) { clearInterval(revisionState.countdownTimer); revisionState.countdownTimer = null; }
  removeRecallPanels(); // discard any pending recall prompt/grade panel
  const v = document.querySelector('video') || video;
  if (v) v.removeEventListener('timeupdate', revisionTimeUpdateHandler);
  enterSegment(revisionState.index - 1);
}

function exitRevisionMode() {
  const v = document.querySelector('video') || video;
  if (v) v.removeEventListener('timeupdate', revisionTimeUpdateHandler);
  if (revisionState?.countdownTimer) clearInterval(revisionState.countdownTimer);
  revisionState = null;
  document.querySelector('.yt-revision-overlay')?.remove();
  removeRecallPanels();
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

function updateRevisionOverlay(hideNote = false) {
  if (!revisionState) return;
  const overlay  = ensureRevisionOverlay();
  const seg      = revisionState.segments[revisionState.index];
  const current  = revisionState.index + 1;
  const total    = revisionState.segments.length;
  const rawNote  = seg.bookmark.description || '';
  const note     = rawNote.length > 90 ? rawNote.slice(0, 90) + '…' : rawNote;
  // Same overlay serves both modes — label it for the one that's actually running.
  overlay.querySelector('.yt-revision-label').textContent =
    revisionState.recall ? '🧠 Active Recall' : '▶ Revisit Mode';
  overlay.querySelector('.yt-revision-clip').textContent  = `Clip ${current} / ${total}`;
  overlay.querySelector('.yt-revision-range').textContent =
    `${formatTimestamp(seg.start)} → ${formatTimestamp(seg.end)}`;
  overlay.querySelector('.yt-revision-note').textContent  = hideNote ? '' : note;
  overlay.querySelector('.yt-revision-next').textContent  = '';
  overlay.querySelector('[data-dir="prev"]').disabled = revisionState.index === 0;
  updateSpeedButtons(overlay, revisionState.speed);
}

function updateRevisionCountdown(sec) {
  const el = document.querySelector('.yt-revision-next');
  if (el) el.textContent = `Next clip in ${sec}s`;
}

// ─── Active Recall mode ───────────────────────────────────────────────────────
// Recall-before-reveal flow layered on Revisit Mode: prompt (description hidden)
// → reveal & play the segment → self-grade → persist → next prompt.

function removeRecallPanels() {
  document.querySelectorAll('.yt-recall-panel').forEach(el => el.remove());
}

// Shown BEFORE a segment plays: timestamp + tags only — the description is the
// answer, so it stays hidden until the user reveals.
function showRecallPrompt(index) {
  if (!revisionState) return;
  removeRecallPanels();
  revisionState.index = index;
  const v = document.querySelector('video') || video;
  if (v) v.pause();
  // Keep the revisit overlay (Prev/Next/✕/speed) present and in sync during the
  // prompt, but hide its note — the description is the answer.
  updateRevisionOverlay(true);

  const seg   = revisionState.segments[index];
  const total = revisionState.segments.length;
  const tags  = seg.bookmark.tags || [];
  const panel = document.createElement('div');
  panel.className = 'yt-recall-panel';
  panel.innerHTML = `
    <div class="yt-recall-label">🧠 Recall this moment</div>
    <div class="yt-recall-time">${formatTimestamp(seg.start)} · Clip ${index + 1} / ${total}</div>
    ${tags.length ? `<div class="yt-recall-tags">${buildTagChipsHtml(tags, 'yt-recall-tag')}</div>` : ''}
    <div class="yt-recall-hint">Try to recall what happens here before revealing.</div>
    <button class="yt-recall-btn">Reveal &amp; Play ▶</button>
  `;
  panel.querySelector('.yt-recall-btn').addEventListener('click', () => {
    if (!revisionState) return;
    removeRecallPanels();
    playRevisionSegment(index);
  });
  document.body.appendChild(panel);
}

// Shown AFTER a segment ends in recall mode: reveal the note and self-grade.
function showRecallGrade() {
  if (!revisionState) return;
  removeRecallPanels();
  const seg  = revisionState.segments[revisionState.index];
  const desc = (seg.bookmark.description || 'No description').replace(/</g, '&lt;');
  const panel = document.createElement('div');
  panel.className = 'yt-recall-panel';
  panel.innerHTML = `
    <div class="yt-recall-label">Did you recall it?</div>
    <div class="yt-recall-desc">${desc}</div>
    <div class="yt-recall-grade-row">
      <button class="yt-recall-grade-btn" data-grade="again">🔁 Again</button>
      <button class="yt-recall-grade-btn yt-recall-grade-btn--good" data-grade="got_it">✅ Got it</button>
    </div>
  `;
  panel.querySelectorAll('.yt-recall-grade-btn').forEach(btn => {
    btn.addEventListener('click', () => handleRecallGrade(seg.bookmark, btn.dataset.grade));
  });
  document.body.appendChild(panel);
}

function handleRecallGrade(bookmark, grade) {
  if (!revisionState) return;
  removeRecallPanels();
  gradeAndPersistBookmark(bookmark, grade);
  incrementRecallReviewCounter().catch(() => {});
  advanceToNextOrFinish();
}

// ─── Free-tier reviews-this-month counter ────────────────────────────────────
// Stored in chrome.storage.local (not sync — no cross-device consistency
// needed, and it keeps this out of sync's tight quota). Pro users are
// unlimited and aren't tracked. normalizeMonthlyCounter/isMonthlyReviewWarnThreshold
// are defined in usage-caps.js.
async function incrementRecallReviewCounter() {
  if (await isProUser()) return;
  const { recallReviewUsage } = await new Promise(resolve =>
    chrome.storage.local.get({ recallReviewUsage: null }, resolve)
  );
  const now = Date.now();
  const normalized = normalizeMonthlyCounter(recallReviewUsage, now);
  const updated = { periodStart: normalized.periodStart, count: normalized.count + 1 };
  await new Promise((resolve, reject) =>
    chrome.storage.local.set({ recallReviewUsage: updated }, () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    })
  );
  if (isMonthlyReviewWarnThreshold(updated, now)) {
    showSilentSaveIndicator(`${updated.count} of ${FREE_RECALL_REVIEWS_PER_MONTH} free reviews used this month`);
  }
}

// Read-modify-write on bm_<videoId>: grade the FRESH stored copy (not the
// session-start snapshot) so a concurrent edit from the side panel/dashboard
// isn't silently reverted.
function gradeAndPersistBookmark(bookmark, grade) {
  if (!isContextValid() || !bookmark) return;
  const videoId = bookmark.videoId || getCurrentVideoIdFromLocation();
  if (!videoId) return;
  chrome.storage.sync.get({ [bmKey(videoId)]: [] }, result => {
    const bookmarks = result[bmKey(videoId)];
    const idx = bookmarks.findIndex(b => b.id === bookmark.id);
    if (idx === -1) {
      debugLog('Recall', 'Graded bookmark not found in storage', { id: bookmark.id, videoId });
      return;
    }
    const fresh = bookmarks[idx];
    let updated;
    try {
      // gradeRecall ships in src/recall.js (sibling PR) — guard until it lands.
      updated = typeof gradeRecall === 'function'
        ? gradeRecall(fresh, grade, Date.now())
        : { ...fresh, lastReviewed: new Date().toISOString() };
    } catch (error) {
      debugLog('Recall', 'gradeRecall failed, falling back', { error: error?.message });
      updated = { ...fresh, lastReviewed: new Date().toISOString() };
    }
    bookmarks[idx] = updated;
    chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks }, () => {
      if (chrome.runtime.lastError) {
        debugLog('Recall', 'Failed to persist grade', { error: chrome.runtime.lastError.message });
      }
    });
  });
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
      titleSaveTimer = setTimeout(() => saveVideoTitle().catch(() => {}), 400);
    });
    titleObserver.observe(document.body, { subtree: true, childList: true });
    handleVideoIdTransition('initialize');
    titleVideoWatchTimer = setInterval(() => {
      handleVideoIdTransition('url-watch');
    }, 1000);

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
  const videoId = handleVideoIdTransition('yt-navigate-finish') || getCurrentVideoIdFromLocation();
  // A loop is scoped to one video: SPA nav means the armed segments no longer
  // point at anything real, so tear the session down and reload this video's
  // saved loops instead of letting the watchdog seek inside the new video.
  if (loopState && loopState.videoId !== videoId) exitLoopMode();
  loadSavedLoops().catch(() => {});
  if (videoId) {
    scheduleTitleRefresh([0, 250, 700, 1500, 3000], videoId);
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
  const videoId = handleVideoIdTransition('yt-page-data-updated') || getCurrentVideoIdFromLocation();
  scheduleTitleRefresh([0, 300, 900, 1800], videoId);
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
  exitLoopMode();
  if (titleVideoWatchTimer) { clearInterval(titleVideoWatchTimer); titleVideoWatchTimer = null; }
  if (progressSaveTimer) { clearTimeout(progressSaveTimer); progressSaveTimer = null; }
  saveProgress(); // flush final position on page unload
  isInitialized       = false;
  reconnectAttempts   = 0;
  lastObservedTitleVideoId = null;
  clearSavedTitleCache();
  cachedTranscript    = null;
  transcriptFetchPromise = null;
  cachedTranscriptVideoId = null;
});
