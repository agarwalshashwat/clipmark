Clipmark — Manual Testing Checklist
1. Installation & Basics
 Load the unpacked extension — no errors in chrome://extensions
 Extension icon appears in the toolbar
 Clicking icon on a non-YouTube page shows a graceful "not on YouTube" state (not a blank/broken popup)
 All icons render correctly (16, 48, 128px)
2. Core Bookmarking (Popup)
 Open popup on a YouTube video — timestamp is captured correctly
 Save a bookmark with no description → auto-fills "Bookmark at M:SS"
 Save a bookmark with a custom description
 Save a bookmark with tags (#important, #review, #note, #question, #todo, #key) → correct color shown
 Save a bookmark with a custom/unknown tag → hash-based color applied
 Duplicate bookmark at the same timestamp is rejected (de-duped)
 Bookmark list renders with correct timestamp and description
 Inline edit: click description → edit → Enter saves, Escape cancels
 Delete a bookmark — removed from list and storage
 Clicking a bookmark's timestamp seeks the video to that point
3. Keyboard Shortcuts
 Alt+B — silent save: bookmark saved, toast notification appears on the YouTube page
 Ctrl+Shift+S (or Cmd+Shift+S on Mac) — quick save: bookmark saved with toast
 Both shortcuts work mid-video playback
 Both shortcuts show an appropriate error if fired on a non-video YouTube page (homepage, search, etc.)
4. Side Panel
 Side panel opens (via right-click → "Open side panel" or context menu)
 Bookmarks for current video display correctly
 Bookmarks update live when new ones are added via popup or keyboard shortcut
 Timestamp seek works from the side panel
5. Progress Bar Markers (Content Script)
 Colored markers appear on the YouTube progress bar for each bookmark
 Marker colors match the tag colors in the popup
 Hovering a marker shows a tooltip with the description
 Markers update when bookmarks are added or deleted without requiring a page refresh
 Markers render correctly on full-screen mode
 Markers persist after navigating between videos (SPA navigation)
6. Dashboard (All Bookmarks Page)
 "All Bookmarks" / dashboard page opens
 All bookmarks across all videos are listed
 Search/filter by text works
 Search/filter by tag works
 Sort by newest / oldest / timestamp works
 Export as JSON works — downloaded file is valid JSON
 Export as CSV works
 Export as Markdown works
 Import JSON — bookmarks merge correctly, no duplicates by id
7. Share Feature
 "Share" button appears in popup
 Share creates a public link and copies it to clipboard — success state shown
 Free tier limit: 3 shares — nudge/warning appears near the limit
 Attempting to share with 0 bookmarks shows an appropriate error
 Shared URL opens correctly in the browser (public /v/[shareId] page)
8. Revision Mode
 Revision/spaced-repetition section appears in the popup when bookmarks are due
 Navigating through revision segments seeks the video correctly
 Countdown timer works
 Completing revision updates the schedule
9. Resume Playback
 Navigating away from a video and returning resumes from last position
 Resume prompt/state is cleared after confirming or dismissing
10. AI Features
 On a fresh install with no Gemini Nano: soft paywall shown to free users, cloud fallback offered to Pro
 AI-generated description appears when Gemini Nano is available (local AI path)
 AI summarization via cloud works for Pro users (when local AI is unavailable)
 Transcript snippet is fetched and used for context during silent_save
11. Authentication & Pro / Cloud Sync
 Sign-in flow works — bmUser stored in chrome.storage.sync
 Token auto-refresh fires when access token is near expiry
 Bookmarks sync to cloud after save (Pro user)
 Cloud bookmarks pulled on popup open (Pro user)
 Downgrade detection: server returns non-Pro → local isPro flag updated, Pro features hidden
 Signed-out state: cloud sync silently skipped, no error shown
12. Context Menus
 Right-click on YouTube page → context menu items appear
 Context menu actions (bookmark at timestamp, etc.) work correctly
13. Storage & Migration
 bm_{videoId} keys created correctly in chrome.storage.sync
 One-time migration from chrome.storage.local runs once and sets syncMigrated: true
 Migration does not re-run on subsequent popup opens
 Bookmarks persist across browser restarts
14. Edge Cases & Stability
 Extension reload/update while on YouTube page: content script handles "Extension context invalidated" gracefully — no console errors thrown to the page
 Opening popup before content script is ready: retries 3× then shows a friendly error
 YouTube SPA navigation (clicking from one video to another): markers reset, new video's bookmarks load
 Very long descriptions don't break the popup layout
 Video with 0 bookmarks: popup shows empty state, not a crash
15. Cross-browser / Environment
 Test on Chrome stable (the submission target)
 Test with multiple YouTube tabs open simultaneously
 Test with browser sync enabled vs. disabled