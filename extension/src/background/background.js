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

  // ─── Context Menu Setup ───────────────────────────────────────────────────────
  // Create context menu items on extension install/update
  chrome.runtime.onInstalled.addListener(() => {
    // Recreate keepalive alarm on update to ensure it persists
    chrome.alarms.create('keepalive', { periodInMinutes: 0.4 });

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

    // Try to get video duration from content script
    let duration = 0;
    try {
      const durRes = await chrome.tabs.sendMessage(tabId, { action: 'getBookmarkData' });
      if (durRes?.duration) duration = durRes.duration;
    } catch {}

    // Create new bookmark
    const newBookmark = {
      id: Date.now(),
      videoId,
      timestamp,
      description,
      tags,
      color,
      createdAt: new Date().toISOString(),
      videoTitle: videoTitles[videoId] || null,
      reviewSchedule: [1, 3, 7],
      lastReviewed: null,
    };

    // Save to storage
    bookmarks.push(newBookmark);
    if (duration && !isNaN(duration)) videoDurations[videoId] = duration;
    await new Promise((resolve, reject) => {
      chrome.storage.sync.set({ [bmKey(videoId)]: bookmarks, videoDurations }, () => {
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
                // For quick_save, we want to open the popup (though Chrome doesn't allow programmatically opening the popup)
                // Instead, we just rely on the toast confirmation.
            }
        } catch (error) {
            console.error('Failed to save via command:', error);
        }
    }
  });

// ─── External message from webapp (auth token after OAuth) ────────────────────
chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message.type === 'AUTH_SUCCESS') {
    chrome.storage.sync.set({
      bmUser: {
        userId:       message.userId,
        userEmail:    message.userEmail,
        accessToken:  message.accessToken,
        refreshToken: message.refreshToken,
        isPro:        message.isPro || false,
      }
    }, () => {
      sendResponse({ ok: true });
    });
    return true; // async
  }
});
