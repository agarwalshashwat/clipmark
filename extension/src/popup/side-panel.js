import {
  parseTags,
  getTagColor,
  tagHueVars,
  ytWatchUrl,
  ytThumbnailUrl,
  MAX_RECONNECT_ATTEMPTS,
  RECONNECT_DELAY,
  isExtensionContextValid,
  buildPendingRevision,
} from '../constants.module.js';
import { formatLoopRange, isLoopBookmark } from '../loop.module.js';
import {
  getValidToken,
  resolveAccessToken,
  TOKEN_NO_SESSION,
  TOKEN_SESSION_EXPIRED,
} from '../auth-token.module.js';
import {
  buildDueSummary,
  buildIdleVideoCards,
  collectStoredBookmarks,
  dueBookmarksForVideo,
  dueCountLabel,
  momentCountLabel,
} from '../idle-summary.js';
import {
  localAiAvailability,
  localSummarizeBookmarks,
  localGeneratePost,
  // Was read as a bare global (local-ai.js is a content script the manifest
  // injects into youtube.com only), so on this page it was always undefined —
  // the autofill summarise step below silently fell into its catch. Same class
  // of bug as the dashboard's TITLE_TRUNCATE_LENGTH; both are now caught by
  // scripts/page-globals-guard.mjs.
  localSummarizeSnippet,
} from '../ai/local-ai.js';
import { createDevLogger, installGlobalErrorLogging } from '../dev-logger.js';
import { initReviewNudge } from './review-nudge-banner.js';
import { showUpgradeModal } from './upgrade-modal.js';
import { applyProGating } from './pro-gating.js';
import {
  countEnrolledRecallSegments,
  isEnrollmentCapReached,
  isRecallStartBlocked,
  FREE_RECALL_ENROLLED_CAP,
  FREE_RECALL_REVIEWS_PER_MONTH,
} from '../usage-caps.module.js';
import { isDueForRecall } from '../recall.module.js';
import { initErrorReporting } from '../error-reporting.js';
// `?sp` for the same reason as the driver.js imports below: content/tour.js
// imports this too, and without the distinct module id Rollup hoists it into a
// chunk shared with the content script. That happens to work (crxjs makes the
// chunk web-accessible), but it puts the content script's code behind a
// runtime chrome.runtime.getURL resolution for no benefit — inlining a copy
// into each bundle keeps the shipped content script self-contained.
import {
  didYoutubeTourComplete,
  shouldAutoRunSidePanelTour,
  shouldMarkTourSeen,
} from '../tour-state.js?sp';
// The `?sp` query keeps these distinct module ids from the imports in
// content/tour.js, so Rollup inlines a separate copy into each bundle
// instead of hoisting a shared chunk — content_scripts entries must stay a
// single static file; they can't load a lazily-imported shared chunk.
import { driver } from 'driver.js?sp';
import 'driver.js/dist/driver.css?sp';
import '../tour-theme.css?sp';

// Before anything else in this module runs, so an error during setup is caught.
// Mirror this in any future popup page with its own `context` tag.
initErrorReporting('extension-side-panel');

const API_BASE = globalThis.API_BASE || 'https://clipmark.mithahara.com';
const logger = createDevLogger('SidePanel');
// Logs to the console for local debugging; initErrorReporting above is what
// forwards the same failures to Sentry in a packaged build.
installGlobalErrorLogging('SidePanel');

let currentTimeSyncInterval = null;

function normalizeYouTubeTitle(rawTitle) {
  if (!rawTitle) return '';
  return String(rawTitle)
    .replace(/\s*-\s*YouTube\s*$/i, '')
    .trim();
}

function stopCurrentTimeSync() {
  if (currentTimeSyncInterval) {
    clearInterval(currentTimeSyncInterval);
    currentTimeSyncInterval = null;
  }
}

function startCurrentTimeSync(tabId) {
  stopCurrentTimeSync();

  const tick = async () => {
    try {
      const response = await sendMessageToTab(tabId, { action: 'getCurrentTime' });
      if (response && response.currentTime !== undefined) {
        const currentTimeEl = document.getElementById('current-time');
        if (currentTimeEl) currentTimeEl.textContent = `⏱ ${formatTimestamp(response.currentTime)}`;
      }
    } catch {
      // Best effort; avoid noisy logs on transient tab/message state
    }
  };

  tick().catch(() => {});
  currentTimeSyncInterval = setInterval(() => { tick().catch(() => {}); }, 1000);
}

async function checkPro() {
  const { bmUser } = await syncGet({ bmUser: null });
  return bmUser?.isPro === true;
}

/**
 * "May a recall session start from here?" — the shared free-tier rule
 * (usage-caps.module.js), asked identically by both of this panel's recall
 * entry points, the extension dashboard, and background.js's web bridge.
 */
async function isRecallBlockedForFreeTier() {
  const { recallReviewUsage } = await new Promise(resolve =>
    chrome.storage.local.get({ recallReviewUsage: null }, resolve)
  );
  return isRecallStartBlocked({
    isPro: await checkPro(),
    reviewUsage: recallReviewUsage,
    nowMs: Date.now(),
  });
}

// ─── Free-tier Active Recall enrollment cap ──────────────────────────────────
async function countAllEnrolledRecallSegments() {
  const all = await syncGet(null);
  const bookmarks = [];
  for (const [key, val] of Object.entries(all)) {
    if (key.startsWith('bm_') && Array.isArray(val)) bookmarks.push(...val);
  }
  return countEnrolledRecallSegments(bookmarks);
}

// Decides the reviewSchedule for a brand-new bookmark: a free user past the
// standing 25-segment cap doesn't get auto-enrolled (the bookmark still saves
// with every other field intact), Pro users are always enrolled.
async function resolveNewBookmarkReviewSchedule() {
  if (await checkPro()) return { reviewSchedule: [1, 3, 7], capped: false };
  const enrolled = await countAllEnrolledRecallSegments();
  if (isEnrollmentCapReached(enrolled)) return { reviewSchedule: [], capped: true };
  return { reviewSchedule: [1, 3, 7], capped: false };
}

// Re-checks Pro status against the server and updates the cached bmUser.isPro
// flag on a mismatch, so upgrading via the web dashboard unlocks gated
// features here without a full re-auth. Throttled — called on load and on
// window focus, not polled.
let lastEntitlementRefresh = 0;
const ENTITLEMENT_REFRESH_MIN_INTERVAL_MS = 60_000;
async function refreshEntitlement() {
  // Triggered by window focus / visibilitychange, i.e. long after the side
  // panel's own initial (valid) load — the same staleness window the other
  // reactive listeners in this file guard against (see isExtensionContextValid).
  if (!isExtensionContextValid()) return;
  const now = Date.now();
  if (now - lastEntitlementRefresh < ENTITLEMENT_REFRESH_MIN_INTERVAL_MS) return;
  lastEntitlementRefresh = now;

  const { bmUser } = await syncGet({ bmUser: null });
  if (!bmUser) return;
  const token = await getValidToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/api/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const { isPro } = await res.json();
      if (isPro !== bmUser.isPro) {
        await syncSet({ bmUser: { ...bmUser, isPro } });
      }
    }
  } catch { /* non-critical, ignore */ }
  // Re-check: the fetch above can take real wall-clock time, long enough for
  // an extension reload/update to invalidate this context mid-flight.
  if (!isExtensionContextValid()) return;
  applyProGating(await checkPro());
}

function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function debugLog(category, message, data = null) {
  logger.debug(`[${category}] ${message}`, data ?? '');
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

// ─── Guided onboarding tour — Sub-tour B (Active Recall) ───────────────────
// Auto-launches the first time the side panel opens, whether that's a
// handoff from Sub-tour A on the YouTube page or the user's first-ever open.
// See docs/guided-tour-spec.md.
const TOUR_POPOVER_CLASS = 'clipmark-tour-popover';

async function getTourState() {
  const r = await syncGet({ tourState: {} });
  return r.tourState || {};
}

async function setTourState(partial) {
  const current = await getTourState();
  await syncSet({ tourState: { ...current, ...partial } });
}

/**
 * True when the profile holds a saved moment for ANY video.
 *
 * The coach-mark's "come back once you've saved a moment or two" copy was
 * chosen from the CURRENT video's bookmarks alone, so it also greeted users who
 * already had plenty saved — anyone opening the panel on a fresh video, and
 * everyone off YouTube entirely (where videoId is null, so the list is empty by
 * construction). Telling a returning user with moments due to come back and
 * start is the wrong half of the tour. Scope the question to the profile.
 */
async function hasSavedMomentsAnywhere() {
  try {
    return collectStoredBookmarks(await syncGet(null)).length > 0;
  } catch {
    // Storage unreachable — fall back to the first-run copy rather than
    // promising a review queue we cannot see.
    return false;
  }
}

async function runSidePanelTour({ force = false } = {}) {
  const tab = await getCurrentTab();
  if (!force && !shouldAutoRunSidePanelTour({ tourState: await getTourState(), activeTabUrl: tab?.url })) {
    return;
  }

  const videoId = tab?.url ? extractVideoId(tab.url) : null;
  const bookmarks = videoId ? await getVideoBookmarksLocal(videoId) : [];

  const steps = (bookmarks.length || await hasSavedMomentsAnywhere())
    ? [{
        element: '#revisit-mode-btn',
        popover: {
          title: 'Active Recall',
          description:
            "Once you've saved a few moments, Active Recall quizzes you before each clip plays — real retention, not just a replay.",
          side: 'top',
          align: 'center',
          popoverClass: TOUR_POPOVER_CLASS,
          doneBtnText: 'Got it',
        },
      }]
    : [{
        // Anchored to the SAME element as the has-bookmark variant on purpose.
        // An element-less step takes driver.js's centered branch, which is
        // positioned without any viewport clamp — under ~281px of CSS viewport
        // height (a short window, or browser zoom past ~150%) the card grew
        // across the 50px header and painted over the wordmark, which at
        // z-index 50 cannot compete with the popover's 1000010. Anchoring
        // leaves that branch entirely; tour-theme.css bounds the height as
        // well, so neither fix is load-bearing alone.
        element: '#revisit-mode-btn',
        popover: {
          title: 'Active Recall',
          description: "Come back here once you've saved a moment or two — Active Recall will quiz you on them before each clip plays.",
          side: 'top',
          align: 'center',
          popoverClass: TOUR_POPOVER_CLASS,
          doneBtnText: 'Got it',
        },
      }];

  // Same one-shot-flag trap as Sub-tour A: driver.js fires onDestroyed even when
  // it gave up waiting for #revisit-mode-btn, which would mark the coach-mark
  // seen without ever rendering it. Only a step that actually highlighted counts.
  let stepShown = false;
  // Set once the flag has been persisted for this run, so the several
  // acknowledgement paths below can all call markSeenIfShown defensively
  // without spending extra chrome.storage.sync writes on the same one-shot.
  let markedSeen = false;

  const markSeenIfShown = () => {
    if (!shouldMarkTourSeen({ stepShown }) || markedSeen) return;
    markedSeen = true;
    // A failed write must not be silent: leaving markedSeen true would make the
    // panel believe the one-shot was spent when nothing was stored, and the
    // coach-mark would come back on the next open with no way to stop it.
    // (syncGet/syncSet reject on chrome.runtime.lastError.)
    setTourState({ sidePanelTour: true }).catch(() => { markedSeen = false; });
  };

  // Hoisted so the teardown hooks can complete the destroy they intercept.
  let tourInstance = null;
  tourInstance = driver({
    showButtons: ['next', 'close'],
    allowClose: true,
    waitForElement: 3000,
    // Proof that the coach-mark was actually painted. This is the #97 fix
    // (src/content/tour.js), which had never been ported to this file:
    // `onHighlighted` is the END of driver.js's ~400ms highlight transition, so
    // a user who clicked "Got it" before it finished — the common case, the
    // button is right there — was recorded as having seen nothing. The flag was
    // never stored and the card re-showed on every panel open, forever. Both
    // hooks are wired up; the first to fire wins.
    onPopoverRender: () => { stepShown = true; },
    onHighlighted: () => { stepShown = true; },
    // The only teardown hook driver.js calls unconditionally. `onDestroyed` is
    // guarded on its `__activeElement` state, which is set at the same instant
    // onHighlighted fires — so dismissing before the highlight transition
    // finished skipped onDestroyed entirely. Completing this via destroy()
    // re-enters as destroy(false), which skips this hook rather than looping.
    onDestroyStarted: () => {
      markSeenIfShown();
      tourInstance?.destroy();
    },
    onDestroyed: () => {
      tourInstance = null;
      markSeenIfShown();
    },
    steps,
  });
  tourInstance.drive();
}

async function getVideoTitles() {
  const r = await syncGet({ videoTitles: {} });
  return r.videoTitles;
}

async function refreshTitleFromContentScript(tabId, expectedVideoId = null) {
  if (!tabId) return null;
  try {
    const response = await sendMessageToTab(tabId, { action: 'getVideoTitle' });
    const resolvedVideoId = response?.videoId || null;
    const resolvedTitle = normalizeYouTubeTitle(response?.title);
    if (!resolvedTitle) return null;
    if (expectedVideoId && resolvedVideoId && expectedVideoId !== resolvedVideoId) return null;

    const titleEl = document.querySelector('#video-title span');
    if (titleEl) {
      titleEl.className = '';
      titleEl.textContent = resolvedTitle;
    }

    if (resolvedVideoId) {
      const videoTitles = await getVideoTitles();
      if (videoTitles[resolvedVideoId] !== resolvedTitle) {
        videoTitles[resolvedVideoId] = resolvedTitle;
        await syncSet({ videoTitles });
      }
    }
    return resolvedTitle;
  } catch {
    return null;
  }
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

/* ─── "either-is-dark": ask the active tab whether YouTube is in dark theme ────
 *
 * The panel is docked beside the page but cannot see its DOM, so the content
 * script reads `<html dark>` for us. The panel then goes dark when the SYSTEM is
 * dark OR YouTube is dark — a user who darkens only YouTube on a light OS still
 * gets a matching panel, which is the eye-strain case this whole feature exists
 * for. The resolution itself lives in theme-loader.js; this only reports.
 *
 * Off YouTube there is nothing to match, so we report false and fall back to the
 * system theme. On a messaging failure (tab predates the install, page still
 * loading) we keep the last-known value rather than flashing the panel.
 */
async function refreshYouTubeTheme() {
  const theme = globalThis.ClipMarkTheme;
  if (!theme || !theme.followsYouTube()) return;
  let tab;
  try {
    tab = await getCurrentTab();
  } catch {
    return;
  }
  if (!tab || !(tab.url || '').includes('youtube.com')) {
    theme.setYouTubeDark(false);
    return;
  }
  try {
    const r = await sendMessageToTab(tab.id, { action: 'getYouTubeTheme' });
    theme.setYouTubeDark(!!(r && r.dark));
  } catch {
    /* no content script on that tab yet — keep the cached value */
  }
}

async function waitForContentScript(tabId, maxRetries = MAX_RECONNECT_ATTEMPTS, delay = RECONNECT_DELAY) {
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
  // Every waitForContentScript caller funnels its failure through here. That
  // message is not an error the user can act on as written — it means the tab
  // predates the install and needs one reload — so route it to the screen that
  // says exactly that, rather than flashing the internal string in a red toast.
  if (isContentScriptUnavailable({ message })) {
    getCurrentTab()
      .then((tab) => showContentInactiveScreen(tab?.id))
      .catch(() => {});
    return;
  }

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
    if (!(tab.url || '').includes('youtube.com/watch')) {
      throw new Error('Please navigate to a YouTube video first!');
    }

    await waitForContentScript(tab.id);

    // Parallel reads — dupe check list + video titles in one round-trip
    const [bookmarks, videoTitles] = await Promise.all([
      getVideoBookmarks(bookmark.videoId),
      getVideoTitles(),
    ]);

    if (bookmarks.some(b => Math.floor(b.timestamp) === Math.floor(bookmark.timestamp))) {
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
    const { reviewSchedule, capped } = await resolveNewBookmarkReviewSchedule();

    // The videoTitles cache is filled async by the content script, so it can
    // be empty for a freshly-opened video — resolve live instead of falling
    // back straight to the raw ID.
    let videoTitle = videoTitles[bookmark.videoId] || null;
    if (!videoTitle) {
      try {
        const titleRes = await sendMessageToTab(tab.id, { action: 'getVideoTitle' });
        if (titleRes?.title) videoTitle = titleRes.title;
      } catch {}
      if (videoTitle) {
        videoTitles[bookmark.videoId] = videoTitle;
        await syncSet({ videoTitles });
      }
    }

    bookmarks.push({
      ...bookmark,
      description,
      tags,
      color,
      id: Date.now(),
      createdAt: new Date().toISOString(),
      videoTitle,
      reviewSchedule,
      lastReviewed: null,
    });

    await saveVideoBookmarks(bookmark.videoId, bookmarks);
    if (bookmark.duration) {
      const vd = (await syncGet({ videoDurations: {} })).videoDurations;
      vd[bookmark.videoId] = bookmark.duration;
      await syncSet({ videoDurations: vd });
    }
    debugLog('Bookmarks', 'Saved bookmark', { description, tags });

    // Instant feedback — UI refresh runs in background
    sendMessageToTab(tab.id, { action: 'showSaveFlash' }).catch(() => {});
    document.getElementById('description').value = '';
    document.getElementById('tag-suggestions').style.display = 'none';
    if (capped) {
      showStatus(`Saved. You've used all ${FREE_RECALL_ENROLLED_CAP} free Active Recall cards — upgrade for more, or remove one to make room.`, 4000);
    } else {
      showStatus('Bookmark saved ✓');
    }

    loadBookmarks();
    sendMessageToTab(tab.id, { action: 'bookmarkUpdated' }).catch(() => {});
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
    showError('Failed to update bookmark: ' + error.message);
  }
}

// ─── Share Bookmarks ──────────────────────────────────────────────────────────
async function shareBookmarks() {
  const btn = document.getElementById('share-btn');
  try {
    const tab = await getCurrentTab();
    if (!(tab.url || '').includes('youtube.com/watch')) {
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

    // Sharing requires sign-in: the server derives the owner from this token,
    // so we no longer send a spoofable userId in the body.
    const token = await getValidToken();
    if (!token) {
      showError('Please sign in to share a collection.', 5000);
      chrome.tabs.create({ url: `${API_BASE}/signin?extensionId=${chrome.runtime.id}` });
      btn.textContent = '↗ Share';
      btn.disabled = false;
      return null;
    }

    const response = await fetch(`${API_BASE}/api/share`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        videoId,
        videoTitle: videoTitles[videoId] || '',
        bookmarks,
      }),
    });

    if (response.status === 401) {
      showError('Your session expired. Please sign in again to share.', 5000);
      chrome.tabs.create({ url: `${API_BASE}/signin?extensionId=${chrome.runtime.id}` });
      btn.textContent = '↗ Share';
      btn.disabled = false;
      return null;
    }

    if (response.status === 403) {
      const err = await response.json().catch(() => ({}));
      if (err.error === 'free_limit_reached') {
        showUpgradeModal({
          feature: 'Unlimited sharing',
          benefit: `You've used all ${err.limit} free shared collections. Go Pro for unlimited public share pages.`,
        });
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
    if (!(tab.url || '').includes('youtube.com/watch')) {
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
    let result = null;

    if (availability === 'available') {
      // Local AI (Gemini Nano) — free for everyone, on-device, zero cost to us.
      btn.textContent = '…';
      btn.disabled = true;
      try {
        result = await localSummarizeBookmarks(bookmarks, videoTitle);
      } catch (e) {
        throw new Error('Local AI failed to generate summary.');
      }
    } else if (availability === 'downloading') {
      // Model is still downloading — show informational notice
      content.innerHTML = `
        <div class="local-ai-notice">
          <p>Gemini Nano is downloading to your device. Try again in a few minutes.</p>
        </div>`;
      panel.style.display = 'block';
      return;
    } else {
      // Local AI unavailable
      content.innerHTML = `
        <div class="ai-unavailable">
          <span class="material-symbols-outlined" style="font-size:48px;color:#94a3b8;margin-bottom:12px;">robot_2</span>
          <h3>Local AI Required</h3>
          <p>ClipMark now uses Chrome's built-in <strong>Gemini Nano</strong> for your privacy and to keep the service sustainable.</p>
          <p style="font-size:12px;color:#64748b;margin-top:12px;">Please ensure you are on Chrome 128+ and have "Enable Bypass for AI" flags set.</p>
          <a href="https://clipmark.mithahara.com/docs/ai" target="_blank" class="ai-help-link">How to enable →</a>
        </div>`;
      panel.style.display = 'block';
      return;
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
    const availability = await localAiAvailability();
    if (availability !== 'available') {
      textareaEl.value = "Local AI (Gemini Nano) is required for social post generation.";
      outputEl.style.display = 'block';
      return;
    }

    const tab = await getCurrentTab();
    if (!(tab.url || '').includes('youtube.com/watch')) throw new Error('Open a YouTube video first');

    const videoId = extractVideoId(tab.url);
    const bookmarks = await getVideoBookmarks(videoId);
    if (bookmarks.length === 0) throw new Error('No bookmarks to share');

    const videoTitles = await getVideoTitles();
    const videoTitle = videoTitles[videoId] || '';

    showStatus('Generating post...');
    const post = await localGeneratePost(bookmarks, videoTitle, shareUrl || '', platform);
    
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
let lastCommentVideoId = null;
let loadBookmarksInFlight = null;
let loadBookmarksQueued = false;
let loadBookmarksRetryTimer = null;
let contentScriptRetryCount = 0;
const MAX_SIDE_PANEL_CONTENT_RETRIES = 8;

function scheduleBookmarksReload(delayMs = 150) {
  if (loadBookmarksRetryTimer) clearTimeout(loadBookmarksRetryTimer);
  loadBookmarksRetryTimer = setTimeout(() => {
    loadBookmarksRetryTimer = null;
    loadBookmarks();
  }, delayMs);
}

// ─── Load Bookmarks ───────────────────────────────────────────────────────────

// Gathers bookmarks across every saved video (not just the active tab) so the
// idle screen has something useful to show while the user isn't on YouTube.
async function getIdleScreenSummary(limit = 4) {
  const all = await syncGet(null);
  const bookmarks = collectStoredBookmarks(all);
  const now = Date.now();

  return {
    bookmarks,
    cards: buildIdleVideoCards({ bookmarks, videoTitles: all.videoTitles || {}, limit }),
    due: buildDueSummary({ bookmarks, isDue: isDueForRecall, now }),
  };
}

/**
 * Open a saved moment in YouTube.
 *
 * Prefers an already-open tab for that video — reloading a video the user is
 * mid-way through just to move the playhead is worse than seeking in place, and
 * the content script already exposes `seekTo`. Falls back to a real navigation
 * when the tab has no reachable content script (e.g. it predates the install —
 * the same gap the onInstalled backfill covers), and to a new tab otherwise.
 */
async function openVideoAt(videoId, timestamp) {
  const seconds = Number.isFinite(timestamp) ? timestamp : 0;
  const url = ytWatchUrl(videoId, seconds);

  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/watch*' });
    const existing = tabs.find(t => (t.url || '').includes(`v=${videoId}`));
    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        try { await chrome.windows.update(existing.windowId, { focused: true }); } catch {}
      }
      try {
        await sendMessageToTab(existing.id, { action: 'seekTo', time: seconds });
        return;
      } catch {
        await chrome.tabs.update(existing.id, { url });
        return;
      }
    }
  } catch {
    // tabs.query can reject if the pattern falls outside our host permissions —
    // opening a new tab is always allowed, so just fall through.
  }

  chrome.tabs.create({ url });
}

/**
 * Start Active Recall for a video from the idle screen's due strip.
 *
 * Deliberately does NOT go through openVideoAt. That helper's whole job is to
 * *play* a moment — its reused-tab branch sends `seekTo`, and content.js's
 * seekTo handler seeks and then calls play(). Routing recall through it started
 * the clip immediately and the prompt never got the chance to hold the frame,
 * so the answer was spoiled before the user recalled anything.
 *
 * Instead this mirrors background.js's startRecallFromWebapp: message the live
 * content script directly with `startRevision`, and let the recall engine's own
 * pause do the work. The storage handoff is the fallback for when there is no
 * tab, or its content script doesn't answer. Pro gating mirrors
 * #revisit-mode-btn exactly.
 */
async function startRecallFromIdle(videoId, bookmarks) {
  if (!videoId) return;
  if (await isRecallBlockedForFreeTier()) {
    showUpgradeModal({
      feature: 'More reviews this month',
      benefit: `You've used all ${FREE_RECALL_REVIEWS_PER_MONTH} free Active Recall reviews this month. Upgrade to Pro for unlimited reviews.`,
    });
    return;
  }

  const dueOnes = dueBookmarksForVideo({
    bookmarks,
    videoId,
    isDue: isDueForRecall,
    now: Date.now(),
  });
  if (!dueOnes.length) return;

  const handoff = () =>
    chrome.storage.local.set({ pendingRevision: buildPendingRevision(videoId, dueOnes, true) });

  try {
    const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/watch*' });
    const existing = tabs.find(t => (t.url || '').includes(`v=${videoId}`));
    if (existing?.id) {
      await chrome.tabs.update(existing.id, { active: true });
      if (existing.windowId != null) {
        try { await chrome.windows.update(existing.windowId, { focused: true }); } catch {}
      }
      try {
        await sendMessageToTab(existing.id, { action: 'startRevision', bookmarks: dueOnes, recall: true });
        return;
      } catch {
        // Content script not reachable (tab still loading, or it predates the
        // install) — reload through the storage handoff instead.
      }
      await handoff();
      await chrome.tabs.reload(existing.id);
      return;
    }
  } catch {
    // tabs.query can reject if the pattern falls outside our host permissions —
    // opening a new tab is always allowed, so just fall through.
  }

  await handoff();
  // No `t=` deep link: the recall prompt owns the playhead, and a start time in
  // the URL would have YouTube autoplay into the clip behind the prompt.
  await chrome.tabs.create({ url: ytWatchUrl(videoId) });
}

// i.ytimg.com answers an unknown video id with a 120x90 grey placeholder rather
// than a failed request; a real mqdefault is 320x180. See renderIdleScreen.
const YT_MISSING_THUMB_MAX_WIDTH = 120;

function idleCardMarkup(card) {
  const title = escapeHtml(card.title);
  const moments = card.moments.map(m => {
    const range = formatLoopRange(m);
    return `
        <button class="sp-clip-moment" data-video-id="${escapeHtml(card.videoId)}" data-timestamp="${m.timestamp}">
          <span class="sp-clip-moment-time${range ? ' sp-clip-moment-time--loop' : ''}">${
            range
              ? `<span class="material-symbols-outlined bookmark-loop-icon" aria-hidden="true">repeat</span>${range}`
              : formatTimestamp(m.timestamp)
          }</span>
          <span class="sp-clip-moment-desc">${escapeHtml(m.description)}</span>
        </button>`;
  }).join('');

  const more = card.hiddenMomentCount
    ? `<span class="sp-clip-more">+${card.hiddenMomentCount} more</span>`
    : '';

  return `
    <div class="sp-clip-card">
      <button class="sp-clip-head" data-video-id="${escapeHtml(card.videoId)}" data-timestamp="${card.headerTimestamp}" title="${title}">
        <span class="sp-clip-thumb-wrap">
          <img class="sp-clip-thumb" src="${escapeHtml(ytThumbnailUrl(card.videoId))}" alt="" loading="lazy">
          <span class="sp-clip-thumb-fallback" aria-hidden="true">
            <span class="material-symbols-outlined">movie</span>
          </span>
          <span class="sp-clip-thumb-gradient"></span>
          <span class="sp-clip-play">
            <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">play_arrow</span>
          </span>
        </span>
        <span class="sp-clip-meta">
          <span class="sp-clip-title">${title}</span>
          <span class="sp-clip-count">${momentCountLabel(card.momentCount)}</span>
        </span>
      </button>
      <div class="sp-clip-moments">${moments}${more}</div>
    </div>`;
}

async function renderIdleScreen() {
  const { bookmarks, cards, due } = await getIdleScreenSummary();

  // Due strip — omitted entirely when nothing is due, never shown empty.
  const dueBanner = document.getElementById('sp-idle-due-banner');
  if (dueBanner) {
    if (due.dueCount > 0) {
      dueBanner.style.display = 'flex';
      dueBanner.querySelector('.sp-idle-due-text').textContent = dueCountLabel(due.dueCount);
      const startBtn = dueBanner.querySelector('#sp-idle-due-start-btn');
      if (startBtn) {
        startBtn.onclick = () => startRecallFromIdle(due.primaryVideoId, bookmarks);
      }
    } else {
      dueBanner.style.display = 'none';
    }
  }

  const list = document.getElementById('sp-idle-recent-list');
  if (!list) return;
  if (!cards.length) {
    list.innerHTML = '<div class="sp-idle-recent-empty">Your saved moments will show up here.</div>';
    return;
  }

  list.innerHTML = cards.map(idleCardMarkup).join('');

  // Thumbnail fallback. Two distinct failure modes, and an `error` handler only
  // catches the first:
  //   1. the request fails outright (offline, CDN unreachable) — naturalWidth 0
  //   2. the video is private/removed, and i.ytimg.com answers 404 with a 120x90
  //      grey placeholder that decodes fine, so `error` never fires
  // A real mqdefault is 320x180, so anything at or under the sentinel width is
  // treated as missing. Either way the <img> is hidden and the styled
  // placeholder underneath shows through — never a broken-image icon.
  list.querySelectorAll('.sp-clip-thumb').forEach(img => {
    const hideIfMissing = () => {
      if (img.naturalWidth > YT_MISSING_THUMB_MAX_WIDTH) return;
      img.style.display = 'none';
    };
    img.addEventListener('error', () => { img.style.display = 'none'; }, { once: true });
    if (img.complete) hideIfMissing();
    else img.addEventListener('load', hideIfMissing, { once: true });
  });

  list.querySelectorAll('.sp-clip-head, .sp-clip-moment').forEach(el => {
    el.addEventListener('click', () => {
      openVideoAt(el.dataset.videoId, parseFloat(el.dataset.timestamp));
    });
  });
}

async function showUnsupportedScreen() {
  const screen = document.getElementById('sp-unsupported-screen');
  if (screen) screen.style.display = 'flex';
  try {
    await renderIdleScreen();
  } catch {
    // Best-effort — the CTA buttons still work even if the summary fails to load
  }
}

function hideUnsupportedScreen() {
  const screen = document.getElementById('sp-unsupported-screen');
  if (screen) screen.style.display = 'none';
}

// ─── Content script unreachable ────────────────────────────────────────────
// The tab *is* a YouTube video, we just can't talk to its content script.
// In practice that means the tab was already open when the extension was
// installed or updated: Chrome only injects declared content_scripts on
// navigation. The background worker backfills those tabs on onInstalled
// (src/background/install-injection.js), but that can't reach every tab —
// tabs discarded at the time, or hosts outside host_permissions — so the
// panel still needs an answer better than "Failed to load bookmarks:
// Content script not available."
let inactiveScreenTabId = null;

function showContentInactiveScreen(tabId) {
  inactiveScreenTabId = tabId ?? null;
  const screen = document.getElementById('sp-inactive-screen');
  if (screen) screen.style.display = 'flex';
}

function hideContentInactiveScreen() {
  inactiveScreenTabId = null;
  const screen = document.getElementById('sp-inactive-screen');
  if (screen) screen.style.display = 'none';
}

function isContentScriptUnavailable(error) {
  return /Content script not available/i.test(error?.message || '');
}

async function loadBookmarks() {
  if (loadBookmarksInFlight) {
    loadBookmarksQueued = true;
    return loadBookmarksInFlight;
  }

  loadBookmarksInFlight = (async () => {
  try {
    const tab = await getCurrentTab();
    logger.info('loadBookmarks called', { url: tab?.url });
    if (!tab.url || !tab.url.includes('youtube.com/watch')) {
      stopCurrentTimeSync();
      stopCommentSync();
      hideContentInactiveScreen();
      await showUnsupportedScreen();
      return;
    }
    hideUnsupportedScreen();
    if (inactiveScreenTabId !== null && inactiveScreenTabId !== tab.id) hideContentInactiveScreen();

    const videoId = extractVideoId(tab.url);
    if (!videoId) return;

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
    if (titleEl) {
      titleEl.className = '';
      titleEl.textContent = videoTitles[videoId] || normalizeYouTubeTitle(tab.title) || 'Current video';
    }

    try {
      await waitForContentScript(tab.id, MAX_RECONNECT_ATTEMPTS + 2, RECONNECT_DELAY);
      contentScriptRetryCount = 0;
      hideContentInactiveScreen();
      await refreshTitleFromContentScript(tab.id, videoId);
    } catch (error) {
      const isScriptUnavailable = isContentScriptUnavailable(error);
      if (isScriptUnavailable && contentScriptRetryCount >= MAX_SIDE_PANEL_CONTENT_RETRIES) {
        // Out of retries: the script isn't coming without a reload. Say so
        // plainly and offer the reload, instead of retrying forever behind a
        // spinner (v1.0.1) or surfacing the raw error string.
        stopCurrentTimeSync();
        showContentInactiveScreen(tab.id);
        return;
      }
      if (isScriptUnavailable && contentScriptRetryCount < MAX_SIDE_PANEL_CONTENT_RETRIES) {
        contentScriptRetryCount += 1;
        debugLog('Init', 'Content script not ready yet, retrying', {
          retry: contentScriptRetryCount,
          tabId: tab.id,
          url: tab.url,
        });
        stopCurrentTimeSync();
        scheduleBookmarksReload(Math.min(4000, 600 + contentScriptRetryCount * 350));
        return;
      }
      throw error;
    }
    startCurrentTimeSync(tab.id);

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

    list.innerHTML = bookmarks.map(b => {
      // A saved A–B loop shows the range it covers, not just its A point —
      // matching the web dashboard, which has always rendered it that way. The
      // panel used to show "01:35" for a loop, so the same record looked like a
      // point bookmark here and a range there.
      const loopRange = formatLoopRange(b);
      return `
      <div class="bookmark${loopRange ? ' bookmark--loop' : ''}" data-timestamp="${b.timestamp}" data-id="${b.id}" data-video-id="${videoId}" style="border-left-color: ${b.color || 'var(--accent)'}">
        <div class="bookmark-content">
          <span class="bookmark-time${loopRange ? ' bookmark-time--loop' : ''}" style="${tagHueVars(b.color || '#14b8a6')}">${
            loopRange
              ? `<span class="material-symbols-outlined bookmark-loop-icon" aria-hidden="true">repeat</span>${loopRange}`
              : formatTimestamp(b.timestamp)
          }</span>
          <span class="bookmark-desc">${b.description || 'No description'}</span>
          ${b.tags && b.tags.length
            ? `<div class="bookmark-tags">${b.tags.map(t =>
                `<span class="tag-badge" style="${tagHueVars(getTagColor([t]))}">#${t}</span>`
              ).join('')}</div>`
            : ''}
        </div>
        <button class="copy-link" data-video-id="${videoId}" data-timestamp="${b.timestamp}" aria-label="Copy link" title="Copy link">⎘</button>
        <button class="delete-bookmark" aria-label="Delete bookmark" title="Delete">&times;</button>
      </div>
    `;
    }).join('');

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
    debugLog('Error', 'Failed to load bookmarks', {
      error: error?.message || String(error),
      stack: error?.stack,
    });

    // On startup races, avoid flashing hard errors while we keep retrying.
    if (isContentScriptUnavailable(error)) {
      scheduleBookmarksReload(1200);
      return;
    }

    showError('Failed to load bookmarks: ' + error.message);
  }
  })().finally(() => {
    loadBookmarksInFlight = null;
    if (loadBookmarksQueued) {
      loadBookmarksQueued = false;
      scheduleBookmarksReload(0);
    }
  });

  return loadBookmarksInFlight;
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

    // Silently validate/refresh token — sign out only when the session is
    // genuinely gone (server rejected it, or the record is unusable). A failed
    // refresh used to sign the user out whether the token was dead or the
    // network was merely down.
    const { reason } = await resolveAccessToken();
    if (reason === TOKEN_SESSION_EXPIRED || reason === TOKEN_NO_SESSION) {
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
  logger.info('Side panel initialized', { devLoggingEnabled: logger.enabled, apiBase: API_BASE });
  debugLog('Init', 'Side panel opened');

  scheduleBookmarksReload(0);
  loadAuthState();
  checkPro().then(applyProGating);  // show PRO badges on gated controls for free users
  refreshEntitlement();
  runSidePanelTour();
  // Own storage reads, own gate, never throws — see review-nudge-banner.js.
  // Deliberately after the tour: a first-run user cannot reach the milestone,
  // but the ordering makes it impossible for the two to ever race for attention.
  // Also subscribes to the recall-session record, so a drill finished while this
  // panel is open surfaces the ask at that moment rather than on a later open.
  initReviewNudge();
  document.getElementById('replay-tour-btn')?.addEventListener('click', async () => {
    await setTourState({ youtubeTour: false, sidePanelTour: false });
    runSidePanelTour({ force: true });
  });

  // Sub-tour A → Sub-tour B handoff. If A was still pending when the panel
  // opened, runSidePanelTour() above deliberately deferred; pick it up the
  // moment A finishes so a panel left open still gets the coach-mark.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync' || !changes.tourState) return;
    if (didYoutubeTourComplete(changes.tourState)) runSidePanelTour();
  });

  document.getElementById('sp-reload-tab-btn')?.addEventListener('click', async () => {
    const tab = await getCurrentTab();
    if (!tab?.id) return;
    // Reloading re-runs Chrome's own declarative injection, which is the whole
    // fix from the user's side; the panel picks the content script up on the
    // tabs.onUpdated 'complete' below.
    contentScriptRetryCount = 0;
    hideContentInactiveScreen();
    chrome.tabs.reload(tab.id);
  });
  window.addEventListener('focus', refreshEntitlement);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshEntitlement();
  });

  // Idle screen button handlers
  document.getElementById('sp-go-youtube-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.youtube.com' });
  });
  document.getElementById('sp-open-dashboard-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/pages/dashboard.html') });
  });

  // Re-check when the active tab navigates (e.g. user goes to YouTube)
  chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      const active = await getCurrentTab();
      if (active?.id === _tabId) {
        // A completed load means Chrome injected the content script itself, so
        // give the reconnect budget back before retrying.
        contentScriptRetryCount = 0;
        hideContentInactiveScreen();
        scheduleBookmarksReload(0);
      }
    }
  });

  window.addEventListener('beforeunload', () => {
    stopCurrentTimeSync();
    stopCommentSync();
  });

  // ── Theme toggle: System → Light → Dark ─────────────────────────────────────
  // data-theme is already stamped (theme-loader.js, classic script in this
  // page's <head>). This reconciles the stored override, keeps the button label
  // honest, and feeds the resolver YouTube's own theme — see refreshYouTubeTheme.
  function updateThemeIcon(resolved, preference) {
    const icon = document.querySelector('.theme-icon');
    const btn = document.getElementById('theme-toggle');
    if (icon) {
      icon.textContent =
        preference === 'system' ? 'brightness_auto' : resolved === 'dark' ? 'dark_mode' : 'light_mode';
    }
    if (btn) {
      const label =
        preference === 'system' ? `System theme (currently ${resolved})`
          : preference === 'dark' ? 'Dark theme' : 'Light theme';
      btn.title = `${label} — click to change`;
      btn.setAttribute('aria-label', btn.title);
    }
  }

  function initTheme() {
    const theme = globalThis.ClipMarkTheme;
    if (!theme) return; // theme-loader.js failed to load; the panel stays light
    theme.subscribe(updateThemeIcon);
    theme.init();
    updateThemeIcon(theme.getResolved(), theme.getPreference());
    const btn = document.getElementById('theme-toggle');
    if (btn) {
      btn.addEventListener('click', () => {
        theme.cyclePreference();
        updateThemeIcon(theme.getResolved(), theme.getPreference());
      });
    }
    refreshYouTubeTheme();
  }
  initTheme();

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
      if (!(tab.url || '').includes('youtube.com/watch')) {
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

  // ── Auto-fill from transcript ──────────────────────────────────────────────
  document.getElementById('auto-fill-btn').addEventListener('click', async () => {
    const btn   = document.getElementById('auto-fill-btn');
    const input = document.getElementById('description');
    const origHTML = btn.innerHTML;
    try {
      const tab = await getCurrentTab();
      debugLog('AutoFill', 'Tab URL', tab.url);
      if (!(tab.url || '').includes('youtube.com/watch')) {
        debugLog('AutoFill', 'Not a YouTube watch page, aborting');
        return;
      }

      btn.disabled = true;

      await waitForContentScript(tab.id);
      const tsRes = await sendMessageToTab(tab.id, { action: 'getTimestamp' });
      debugLog('AutoFill', 'Timestamp response', tsRes);
      if (!tsRes?.timestamp) throw new Error('no timestamp');

      debugLog('AutoFill', 'Fetching transcript and chapter in parallel', tsRes.timestamp);
      const [txResult, chResult] = await Promise.allSettled([
        sendMessageToTab(tab.id, { action: 'getTranscriptAtTimestamp', timestamp: tsRes.timestamp }),
        sendMessageToTab(tab.id, { action: 'getCurrentChapter' }),
      ]);

      const transcript = txResult.status === 'fulfilled' ? txResult.value?.text  : null;
      const chapter    = chResult.status  === 'fulfilled' ? chResult.value?.chapter : null;
      const txRaw = txResult.status === 'fulfilled' ? txResult.value : null;
      debugLog('AutoFill', 'Transcript raw response', {
        status: txResult.status,
        text: txRaw?.text,
        segmentCount: txRaw?._debug?.segmentCount,
        hasCaptions: txRaw?._debug?.hasCaptions,
        error: txResult.reason?.message,
      });
      debugLog('AutoFill', 'Transcript text', transcript);
      debugLog('AutoFill', 'Chapter', chapter);

      let text = null;
      if (chapter && transcript) text = `${chapter} - ${transcript}`;
      else if (transcript)       text = transcript;
      else if (chapter)          text = chapter;

      // AI MAGIC: Try to summarize the resulting text if it's long
      if (text && text.length > 50) {
        try {
          const summarized = await localSummarizeSnippet(text);
          if (summarized && summarized !== text) {
            text = summarized;
            debugLog('AutoFill', 'AI summarized to', text);
          }
        } catch (e) {
          debugLog('AutoFill', 'AI summary failed', e);
        }
      }

      if (text) {
        debugLog('AutoFill', 'Filled with', text);
        input.value = text;
        input.focus();
        input.select();
      } else {
        debugLog('AutoFill', 'No transcript or chapter available');
        showStatus('No transcript available');
      }
    } catch (e) {
      debugLog('AutoFill', 'Error', e?.message);
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
      if (await isRecallBlockedForFreeTier()) {
        showUpgradeModal({
          feature: 'More reviews this month',
          benefit: `You've used all ${FREE_RECALL_REVIEWS_PER_MONTH} free Active Recall reviews this month. Upgrade to Pro for unlimited reviews.`,
        });
        return;
      }
      const tab = await getCurrentTab();
      if (!(tab.url || '').includes('youtube.com/watch')) {
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
      await sendMessageToTab(tab.id, { action: 'startRevision', bookmarks, recall: true });
    } catch (error) {
      showError('Could not start Active Recall: ' + error.message);
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
    // The side panel can stay open across an extension reload/update, which
    // revokes chrome.storage/chrome.runtime from this already-running page —
    // this listener keeps firing (Chrome delivers the event first), so it must
    // check before touching either API again.
    if (!isExtensionContextValid()) return;
    if (area === 'sync') {
      const changedKeys = Object.keys(changes);
      const hasRelevantChange =
        changedKeys.includes('bmUser') ||
        changedKeys.includes('videoTitles') ||
        changedKeys.some(k => k.startsWith('bm_') || k.startsWith('rem_'));

      if (!hasRelevantChange) return;

      debugLog('Storage', 'Change detected, reloading bookmarks');
      scheduleBookmarksReload(100);
      if (changes.bmUser) loadAuthState();
    }
  });

  // Reload bookmarks when tab changes
  chrome.tabs.onActivated.addListener(() => {
    if (!isExtensionContextValid()) return;
    debugLog('Tabs', 'Tab activated, reloading bookmarks');
    scheduleBookmarksReload(0);
    // Switching tabs can move the panel from a dark YouTube to a light one, or
    // off YouTube entirely — re-resolve the panel theme against the new tab.
    refreshYouTubeTheme().catch(() => {});
  });
});

// Auto-refresh when YouTube SPA navigates to a new video
chrome.runtime.onMessage.addListener((msg) => {
  if (!isExtensionContextValid()) return;
  if (msg.action === 'ytVideoChanged') {
    debugLog('Nav', 'YouTube video changed, reloading', { videoId: msg.videoId });
    scheduleBookmarksReload(0);
    getCurrentTab()
      .then(tab => refreshTitleFromContentScript(tab?.id, msg.videoId))
      .catch(() => {});
    // YouTube is an SPA and its theme survives navigation, but the content
    // script is re-initialised — re-read rather than trust the cache.
    refreshYouTubeTheme().catch(() => {});
  }
  // The user toggled YouTube's own theme while the panel was open.
  if (msg.action === 'ytThemeChanged') {
    debugLog('Theme', 'YouTube theme changed', { dark: msg.dark });
    globalThis.ClipMarkTheme?.setYouTubeDark(!!msg.dark);
  }
});
