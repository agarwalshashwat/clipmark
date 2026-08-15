// Error reporting must be first: registering the global handlers before any
// other top-level code runs means a failure during startup is still reported.
// The background worker owns the extension's only Sentry sender — the content
// script forwards to it (see src/error-report-bridge.js).
import { initErrorReporting, isOwnScript } from '../error-reporting.js';
import {
  countEnrolledRecallSegments,
  isEnrollmentCapReached,
  FREE_RECALL_ENROLLED_CAP,
  isRecallStartBlocked,
  FREE_RECALL_REVIEWS_PER_MONTH,
} from '../usage-caps.module.js';
import { isTrustedExternalSender, buildAuthUser } from '../external-messaging.module.js';
import { getValidToken } from '../auth-token.module.js';
import { buildPendingRevision } from '../constants.module.js';
import {
  CONTENT_SCRIPT_MARKER,
  contentScriptMatchPatterns,
  planInjections,
  shouldBackfillOnInstalled,
  shouldInjectIntoTab,
  urlMatchesAnyPattern,
} from './install-injection.js';
import { registerUninstallUrl } from './uninstall-url.js';

const errorReporter = initErrorReporting('extension-background');

// ─── Constants ──────────────────────────────────────────────────────────────
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
    if (!tags || tags.length === 0) return '#14B8A6';
    return TAG_COLORS[tags[0]] || stringToColor(tags[0]);
  }
  
  function formatTimestamp(seconds) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  
  function bmKey(videoId) { return `bm_${videoId}`; }

  // ─── Free-tier Active Recall enrollment cap ────────────────────────────────
  async function countAllEnrolledRecallSegments() {
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
    return countEnrolledRecallSegments(bookmarks);
  }

  // Decides the reviewSchedule for a brand-new bookmark: a free user past the
  // standing 25-segment cap doesn't get auto-enrolled (the bookmark still
  // saves with every other field intact), Pro users are always enrolled.
  async function resolveNewBookmarkReviewSchedule() {
    const { bmUser } = await new Promise(resolve => chrome.storage.sync.get({ bmUser: null }, resolve));
    if (bmUser?.isPro === true) return { reviewSchedule: [1, 3, 7], capped: false };
    const enrolled = await countAllEnrolledRecallSegments();
    if (isEnrollmentCapReached(enrolled)) return { reviewSchedule: [], capped: true };
    return { reviewSchedule: [1, 3, 7], capped: false };
  }

  // ─── Service Worker Keep-Alive (MV3) ─────────────────────────────────────────
  // MV3 service workers shut down after ~5 min of inactivity.
  // A recurring alarm prevents this for features that need persistence
  // (context menus, OAuth coordination, cloud sync events).
  chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'keepalive') {
      // Trivial ping — keeps the service worker alive.
    }
  });

  // ─── Install-time content-script backfill ──────────────────────────────────
  // Chrome injects declared content_scripts on navigation only, so every
  // YouTube tab that was already open when the extension installed or updated
  // has none — and the side panel, context menus and keyboard commands all fail
  // against it with "Content script not available" until the user reloads.
  // Replay the manifest's own content_scripts into those tabs instead.
  //
  // Best-effort by design: injection legitimately refuses on hosts outside
  // host_permissions, on sleeping/closing tabs, and on privileged pages. A
  // failure here is never worse than v1.0.1's status quo, so nothing throws.
  async function injectContentScriptsIntoTab(plan, currentVersion) {
    try {
      const [probe] = await chrome.scripting.executeScript({
        target: { tabId: plan.tabId },
        // Runs in the isolated world, i.e. the same global scope the content
        // scripts share — so it can see the marker they stamp.
        func: (marker) => globalThis[marker] ?? null,
        args: [CONTENT_SCRIPT_MARKER],
      });
      if (!shouldInjectIntoTab(probe?.result, currentVersion)) return 'already-injected';

      if (plan.css.length) {
        await chrome.scripting.insertCSS({ target: { tabId: plan.tabId }, files: plan.css });
      }
      if (plan.js.length) {
        await chrome.scripting.executeScript({ target: { tabId: plan.tabId }, files: plan.js });
      }
      return 'injected';
    } catch {
      return 'skipped';
    }
  }

  async function backfillContentScripts() {
    // `scripting` is declared in the manifest; the guard is for the E2E harness
    // and for older runtimes, where a missing API must not break onInstalled.
    if (!chrome.scripting?.executeScript) return [];

    const manifest = chrome.runtime.getManifest();
    const contentScripts = manifest.content_scripts || [];
    const patterns = contentScriptMatchPatterns(contentScripts);
    if (!patterns.length) return [];

    let tabs = [];
    try {
      tabs = await chrome.tabs.query({ url: patterns });
    } catch {
      // The `url` filter needs "tabs" or host permissions covering every
      // pattern. ClipMark's host_permissions are deliberately narrower than the
      // content-script matches, so fall back to filtering ourselves — tabs we
      // hold no permission for come back without a url and drop out here.
      try {
        const all = await chrome.tabs.query({});
        tabs = all.filter((tab) => urlMatchesAnyPattern(tab?.url, patterns));
      } catch {
        return [];
      }
    }

    const plans = planInjections({ contentScripts, tabs });
    return Promise.all(plans.map((plan) => injectContentScriptsIntoTab(plan, manifest.version)));
  }

  // ─── Context Menu Setup ───────────────────────────────────────────────────────
  // Create context menu items on extension install/update
  chrome.runtime.onInstalled.addListener((details) => {
    // Recreate keepalive alarm on update to ensure it persists
    chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });

    // Where Chrome sends the user if they remove ClipMark. Registered on both
    // install and startup rather than install alone: the registration belongs to
    // the worker's lifetime, and an update that changes the version has to
    // re-register to keep ?v= truthful. The call is idempotent and never throws.
    registerUninstallUrl().catch(() => {});

    if (shouldBackfillOnInstalled(details?.reason)) {
      backfillContentScripts().catch(() => {});
    }

    // "Bookmark at [time]" - visible only on YouTube watch pages
    chrome.contextMenus.create({
      id: 'bookmark-at-time',
      title: 'Bookmark at current time',
      contexts: ['page'],
      documentUrlPatterns: ['*://*.youtube.com/watch*'],
    });

    // "Bookmark Quote" - visible when text is selected
    chrome.contextMenus.create({
      id: 'bookmark-quote',
      title: 'Bookmark quote',
      contexts: ['selection'],
      documentUrlPatterns: ['*://*.youtube.com/watch*'],
    });
  });

  // Browser restart: onInstalled does NOT fire, so without this the uninstall URL
  // would only ever be registered by the install/update that first shipped it.
  chrome.runtime.onStartup.addListener(() => {
    registerUninstallUrl().catch(() => {});
  });

  // ─── Context Menu Handler ──────────────────────────────────────────────────────
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    if (!tab || !tab.url) return;

    try {
      // Validate YouTube watch page
      if (!tab.url.includes('youtube.com/watch')) {
        console.log('[ContextMenu] Not a YouTube watch page, skipping');
        return;
      }

      const videoId = new URLSearchParams(new URL(tab.url).search).get('v');
      if (!videoId) {
        console.log('[ContextMenu] Could not extract video ID');
        return;
      }

      if (info.menuItemId === 'bookmark-at-time') {
        // Get current timestamp from content script
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getTimestamp'
        });

        if (!response?.timestamp && response?.timestamp !== 0) {
          throw new Error('Could not get timestamp from video');
        }

        const timestamp = response.timestamp;
        const description = `Bookmark at ${formatTimestamp(timestamp)}`;

        // Save bookmark
        await saveContextMenuBookmark(videoId, timestamp, description, tab.id);

        console.log('[ContextMenu] Saved bookmark at', formatTimestamp(timestamp));
      }
      else if (info.menuItemId === 'bookmark-quote') {
        // Use selected text as description
        const selectedText = info.selectionText || '';

        // Get current timestamp
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'getTimestamp'
        });

        if (!response?.timestamp && response?.timestamp !== 0) {
          throw new Error('Could not get timestamp from video');
        }

        const timestamp = response.timestamp;
        const description = selectedText || `Bookmark at ${formatTimestamp(timestamp)}`;

        // Save bookmark
        await saveContextMenuBookmark(videoId, timestamp, description, tab.id);

        console.log('[ContextMenu] Saved quoted bookmark:', selectedText.substring(0, 50));
      }
    } catch (error) {
      console.error('[ContextMenu] Error:', error.message);
    }
  });

  // ─── Helper: Save bookmark from context menu ───────────────────────────────────
  async function saveContextMenuBookmark(videoId, timestamp, description, tabId) {
    // Get existing bookmarks
    const result = await new Promise(resolve =>
      chrome.storage.sync.get({ [bmKey(videoId)]: [], videoTitles: {}, videoDurations: {} }, resolve)
    );

    const bookmarks      = result[bmKey(videoId)];
    const videoTitles    = result.videoTitles;
    const videoDurations = result.videoDurations;

    // Check for duplicates
    if (bookmarks.some(b => Math.floor(b.timestamp) === Math.floor(timestamp))) {
      console.log('[ContextMenu] Bookmark already exists at this timestamp');
      return;
    }

    // Parse tags from description
    const tags = parseTags(description);
    const color = getTagColor(tags);

    // Try to get video duration and a live-resolved title from content script
    let duration = 0;
    let liveTitle = null;
    try {
      const durRes = await chrome.tabs.sendMessage(tabId, { action: 'getBookmarkData' });
      if (durRes?.duration) duration = durRes.duration;
      liveTitle = durRes?.title || null;
    } catch {}

    const videoTitle = videoTitles[videoId] || liveTitle || null;
    if (!videoTitles[videoId] && liveTitle) videoTitles[videoId] = liveTitle;

    // Create new bookmark
    const { reviewSchedule, capped } = await resolveNewBookmarkReviewSchedule();
    const newBookmark = {
      id: Date.now(),
      videoId,
      timestamp,
      description,
      tags,
      color,
      createdAt: new Date().toISOString(),
      videoTitle,
      reviewSchedule,
      lastReviewed: null,
    };

    // Save to storage
    bookmarks.push(newBookmark);
    if (duration && !isNaN(duration)) videoDurations[videoId] = duration;
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks, videoDurations, videoTitles }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });

    // Notify content script to update markers
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'bookmarkUpdated' });
    } catch {
      // Content script may not be ready, that's OK
    }

    if (capped) {
      try {
        chrome.notifications.create(`recall_cap_${videoId}_${newBookmark.id}`, {
          type: 'basic',
          iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
          title: 'Bookmark saved',
          message: `You've used all ${FREE_RECALL_ENROLLED_CAP} free Active Recall cards — upgrade for more, or remove one to make room.`,
        });
      } catch {
        // Notifications may be unavailable/blocked — not fatal, save already succeeded.
      }
    }

    console.log('[ContextMenu] Bookmark saved successfully');
  }

  // ─── Action Click Handler ────────────────────────────────────────────────────────
  chrome.action.onClicked.addListener(async (tab) => {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
      console.error('Failed to open side panel:', error);
    }
  });

  // ─── Command Listeners ───────────────────────────────────────────────────────
  chrome.commands.onCommand.addListener(async (command) => {
    console.log(`Command received: ${command}`);

    if (command === 'quick_save' || command === 'silent_save') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url.includes('youtube.com/watch')) return;
        
        const videoId = new URLSearchParams(new URL(tab.url).search).get('v');
        if (!videoId) return;

        try {
            // Get current time and title from content script
            const response = await chrome.tabs.sendMessage(tab.id, { action: 'getBookmarkData' });
            if (!response || response.currentTime === undefined) return;

            const timestamp  = response.currentTime;
            const videoTitle = response.title || 'Unknown Video';
            const duration   = response.duration || 0;

            // Check for duplicates
            const key = bmKey(videoId);
            const data = await chrome.storage.sync.get({ [key]: [], videoTitles: {}, videoDurations: {} });
            const bookmarks      = data[key];
            const videoTitles    = data.videoTitles;
            const videoDurations = data.videoDurations;

            if (bookmarks.some(b => Math.floor(b.timestamp) === Math.floor(timestamp))) {
                chrome.tabs.sendMessage(tab.id, { action: 'showToast', message: 'Bookmark already exists', type: 'error' });
                return;
            }

            // Save title if not already present
            if (!videoTitles[videoId]) {
                videoTitles[videoId] = videoTitle;
                await chrome.storage.sync.set({ videoTitles });
            }

            let description = '';
            let tags = [];
            
            if (command === 'silent_save') {
                // Try to get transcript if available
                try {
                    const transcriptRes = await chrome.tabs.sendMessage(tab.id, { action: 'getTranscriptSnippet', timestamp });
                    description = transcriptRes.snippet || `Bookmark at ${formatTimestamp(timestamp)}`;
                } catch (e) {
                    description = `Bookmark at ${formatTimestamp(timestamp)}`;
                }
            }
            
            tags = parseTags(description);
            const color = getTagColor(tags);

            const newBookmark = {
                videoId,
                timestamp,
                description,
                tags,
                color,
                id: Date.now(),
                createdAt: new Date().toISOString(),
                videoTitle: videoTitle
            };

            bookmarks.push(newBookmark);
            if (duration && !isNaN(duration)) videoDurations[videoId] = duration;
            await chrome.storage.sync.set({ [key]: bookmarks, videoDurations });

            // Notify content script to update markers or show toast
            chrome.tabs.sendMessage(tab.id, { action: 'bookmarkUpdated' });
            chrome.tabs.sendMessage(tab.id, { action: 'showToast', message: 'Bookmark saved ✓', type: 'success' });

            if (command === 'quick_save') {
                // For quick_save, we rely on the toast confirmation in the content script.
            }
        } catch (error) {
            console.error('Failed to save via command:', error);
        }
    }
  });

// ─── External message from webapp (auth token after OAuth) ────────────────────
// The trust gate and the AUTH_SUCCESS payload shape live in
// src/external-messaging.module.js so they can be unit-tested; see the notes
// there for why only the ClipMark web app may talk to the extension.

/**
 * Free-tier gate for a recall session, asked here rather than in the page that
 * requested it.
 *
 * This is the choke point on purpose. The web dashboard is ordinary web content
 * — anything it checks client-side can be skipped by calling
 * `chrome.runtime.sendMessage(extensionId, {type:'START_RECALL', …})` from the
 * console. The background worker is the only hop the caller cannot go around,
 * and it is also the only place that can read the entitlement and the review
 * counter (both live in extension storage, which the page cannot touch). So the
 * web dashboard's own check is presentation; THIS is enforcement.
 *
 * The rule itself is the shared one from usage-caps.module.js, so a session
 * started from the web is capped exactly like one started from the side panel
 * or the extension dashboard.
 */
async function isRecallBlockedForFreeTier() {
  const { bmUser } = await chrome.storage.sync.get({ bmUser: null });
  const { recallReviewUsage } = await chrome.storage.local.get({ recallReviewUsage: null });
  return isRecallStartBlocked({
    isPro: bmUser?.isPro === true,
    reviewUsage: recallReviewUsage,
    nowMs: Date.now(),
  });
}

/**
 * Start an Active Recall session for a video, driven from the web dashboard.
 *
 * The webapp sends only a videoId plus the ids it believes are due; the
 * bookmarks themselves always come from the extension's own storage, so nothing
 * the page sends is trusted as content. Falls back to every bookmark for the
 * video when the ids don't match locally (e.g. not synced down yet).
 */
async function startRecallFromWebapp(videoId, bookmarkIds) {
  // Before any tab is opened or any handoff is written: a free user who has
  // spent this month's reviews gets the same refusal the extension's own UI
  // gives, and the dashboard turns it into an upgrade prompt.
  if (await isRecallBlockedForFreeTier()) {
    return { ok: false, error: 'review_cap_reached', cap: FREE_RECALL_REVIEWS_PER_MONTH };
  }

  const key = bmKey(videoId);
  const stored = await chrome.storage.sync.get({ [key]: [] });
  let bookmarks = stored[key] || [];

  if (Array.isArray(bookmarkIds) && bookmarkIds.length) {
    const wanted = new Set(bookmarkIds);
    const selected = bookmarks.filter(b => wanted.has(b.id));
    if (selected.length) bookmarks = selected;
  }
  if (!bookmarks.length) return { ok: false, error: 'no_bookmarks' };

  bookmarks = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);

  // Reuse an already-open tab for this video (messaging the live content script
  // avoids a reload); otherwise hand off via storage for the fresh page load.
  const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/watch*' });
  const existing = tabs.find(t => (t.url || '').includes(`v=${videoId}`));

  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true });
    try {
      await chrome.tabs.sendMessage(existing.id, { action: 'startRevision', bookmarks, recall: true });
      return { ok: true, count: bookmarks.length, reusedTab: true };
    } catch {
      // Content script not ready (e.g. tab still loading) — fall through to the
      // storage handoff, which setupBookmarkMarkers picks up on player init.
    }
  }

  await chrome.storage.local.set({ pendingRevision: buildPendingRevision(videoId, bookmarks, true) });
  if (existing?.id) await chrome.tabs.reload(existing.id);
  else await chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}` });
  return { ok: true, count: bookmarks.length, reusedTab: !!existing?.id };
}

chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  if (!isTrustedExternalSender(sender)) {
    console.warn('[ClipMark] rejected external message from untrusted sender');
    sendResponse({ ok: false, error: 'untrusted_sender' });
    return false;
  }

  if (message.type === 'AUTH_SUCCESS') {
    chrome.storage.sync.set({ bmUser: buildAuthUser(message) }, () => {
      sendResponse({ ok: true });
      scheduleReminderAlarms();
    });
    return true; // async
  }

  if (message.type === 'START_RECALL') {
    const videoId = String(message.videoId || '');
    if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      sendResponse({ ok: false, error: 'invalid_video_id' });
      return false;
    }
    startRecallFromWebapp(videoId, message.bookmarkIds)
      .then(sendResponse)
      .catch(err => sendResponse({ ok: false, error: err?.message || 'failed' }));
    return true; // async
  }
});

/**
 * Receives errors forwarded from the content script (src/error-report-bridge.js).
 *
 * The bridge already drops anything without a chrome-extension:// origin; the
 * check is repeated here because this listener is reachable from any injected
 * script, and a YouTube-origin error must never reach Sentry.
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'CLIPMARK_REPORT_ERROR') return false;

  const source = message.extra?.source;
  if (source && !isOwnScript(source)) {
    sendResponse({ ok: false, error: 'not_own_script' });
    return false;
  }

  // Rebuild an Error so the stack survives the structured-clone boundary
  // (Error objects don't cross chrome.runtime messaging intact).
  const error = new Error(message.error?.message ?? 'Unknown error');
  error.name = message.error?.name || 'Error';
  if (message.error?.stack) error.stack = message.error.stack;

  errorReporter.capture(error, { ...message.extra, context: 'extension-content' });
  sendResponse({ ok: true });
  return false;
});

// ─── Reminder Alarms ──────────────────────────────────────────────────────────
const REMINDERS_API = 'https://clipmark.mithahara.com/api/reminders';
const REMINDER_HORIZON_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function scheduleReminderAlarms() {
  // Must go through getValidToken: this runs from a daily alarm and on every
  // service-worker wake-up, so the stored access token is almost always past
  // its one-hour life. Reading `bmUser.accessToken` raw made every one of these
  // syncs 401 and silently scheduled no alarms at all.
  const token = await getValidToken();
  if (!token) return;

  let reminders;
  try {
    const res = await fetch(REMINDERS_API, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const json = await res.json();
    reminders = [...(json.due ?? []), ...(json.upcoming ?? [])];
  } catch {
    return;
  }

  // Clear all existing reminder alarms
  const allAlarms = await chrome.alarms.getAll();
  for (const alarm of allAlarms) {
    if (alarm.name.startsWith('reminder_')) {
      await chrome.alarms.clear(alarm.name);
    }
  }

  // Store reminder metadata keyed by id for notification use
  const reminderMeta = {};
  const now = Date.now();
  const horizon = now + REMINDER_HORIZON_MS;

  for (const r of reminders) {
    const dueMs = new Date(r.next_due_at).getTime();
    reminderMeta[r.id] = {
      id: r.id,
      targetLabel: r.targetLabel,
      videoId: r.videoId,
      frequency: r.frequency,
    };
    // Only schedule alarms for future reminders within the horizon
    if (dueMs > now && dueMs <= horizon) {
      chrome.alarms.create(`reminder_${r.id}`, { when: dueMs });
    }
  }
  await chrome.storage.local.set({ reminderMeta });

  // Schedule daily re-sync at 9AM local time if not already set
  const syncAlarm = await chrome.alarms.get('reminder_sync');
  if (!syncAlarm) {
    const next9AM = new Date();
    next9AM.setHours(9, 0, 0, 0);
    if (next9AM.getTime() <= now) next9AM.setDate(next9AM.getDate() + 1);
    chrome.alarms.create('reminder_sync', {
      when: next9AM.getTime(),
      periodInMinutes: 1440,
    });
  }
}

function frequencyLabel(frequency) {
  const map = { once: 'one-time', daily: 'daily', weekly: 'weekly', biweekly: 'every 2 weeks', monthly: 'monthly' };
  return map[frequency] || frequency;
}

// Wire reminder alarms into the existing alarm listener
const _originalAlarmListener = chrome.alarms.onAlarm.hasListeners()
  ? null : null; // keep existing keepalive listener — we add a second listener below

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'reminder_sync') {
    await scheduleReminderAlarms();
    return;
  }

  if (alarm.name.startsWith('reminder_')) {
    const reminderId = alarm.name.slice('reminder_'.length);
    const { reminderMeta } = await chrome.storage.local.get({ reminderMeta: {} });
    const meta = reminderMeta[reminderId];
    if (!meta) return;

    chrome.notifications.create(`reminder_notif_${reminderId}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-48.png'),
      title: 'Time to revisit 🔖',
      message: `${meta.targetLabel} — ${frequencyLabel(meta.frequency)}`,
      buttons: [
        { title: 'Revisit now' },
        { title: 'Mark Done' },
      ],
      requireInteraction: true,
    });
  }
});

chrome.notifications.onButtonClicked.addListener(async (notifId, buttonIndex) => {
  if (!notifId.startsWith('reminder_notif_')) return;
  const reminderId = notifId.slice('reminder_notif_'.length);
  chrome.notifications.clear(notifId);

  const { reminderMeta } = await chrome.storage.local.get({ reminderMeta: {} });
  const meta = reminderMeta[reminderId];
  if (!meta) return;

  if (buttonIndex === 0 && meta.videoId) {
    // Revisit now — open YouTube
    chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${meta.videoId}` });
  } else if (buttonIndex === 1) {
    // Mark Done — call API then reschedule
    const token = await getValidToken();
    if (token) {
      try {
        await fetch(`${REMINDERS_API}/${reminderId}/done`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {}
    }
    await scheduleReminderAlarms();
  }
});

// Schedule alarms on service worker startup (fires when SW wakes up)
scheduleReminderAlarms();
